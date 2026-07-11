# PART VII — ENGINEERING

### 7.0 Code is disposable (the regenerability law)
The markdown in this repo (`specs/` + `docs/`) is the app; the code is a build artifact.
**If all code were deleted, the md files must suffice to regenerate exactly this app.**
Corollaries: every decision lands in markdown in the same turn it is made; exact values
(hex, px, ms, easings) live in `docs/design-tokens.md`, never only in CSS; implementation
patterns worth keeping live in `docs/*.md`; code is never the sole home of any decision.

### 7.0.1 ML-assist — ADOPTED (grilled & settled 2026-07-10)
**The law (mirrored in Part VI):** cloud LLM/AI only in very late stages and only where it
provides real value, always with local fallbacks; cloud-exclusive features must never block
regular functionality. On-device ML inference permitted — some features on by default, some
opt-in, always overridable, **never load-bearing for correctness** (the app works
identically with ML off).

**Feature 1 — title → sub-head suggestion (grilled design):**
- **Corpus:** kNN vote over embeddings of the user's **past task titles** (each stored with
  its sub-head — the strong signal); bare sub-head names as cold-start fallback only.
- **Trigger:** debounced ~400ms after typing pauses in Title; runs in a Web Worker.
- **Two calibrated thresholds, not one** (calibrated 2026-07-10 after a false-positive bug —
  "cycling" wrongly matched an unrelated existing sub-head "networking"): `bge-small`
  mean-pooled short-text/single-word embeddings have a high noise floor — unrelated words
  land at 0.48–0.66 cosine, genuinely related short phrases at 0.72+. One threshold across
  both paths let noise through.
  - **Title-corpus kNN vote → 0.45 cosine.** Full-sentence embeddings, pooled over multiple
    past titles — discriminative even at this level, the strong signal.
  - **Sub-head-NAME cold-start fallback → 0.60 cosine** (tuned down from an initial 0.68 —
    retune if false positives resurface). Single words/short phrases only, noisier; needs a
    higher bar than the title-corpus path to stay out of the noise floor.
  - **Above threshold:** autofill the winning **existing** sub-head (head auto-derives);
    rendered in a provisional style until confirmed/edited.
  - **Below threshold:** do NOT stay silent — offer a **create-new suggestion**, explicitly
    labeled as "suggest creating a new sub-head", never disguised as a registry match.
  - **The "new" name is GENERATED, not echoed (ADOPTED 2026-07-11; model TBD):** echoing the
    whole title as the proposed new sub-head is unusable. Instead, an **on-device generative
    (text2text) model** proposes a concise sub-head, **few-shot conditioned on the user's
    existing `title → sub-head` pairings** so new names follow the user's own naming
    *pattern/abstraction* (empty corpus → three universal SEED demonstrations fill in, since a
    77M model can't follow the format zero-shot — tuned 2026-07-12 after live degeneration
    ("- a - a - a"); as real pairings accumulate they replace the seeds and the user's style
    dominates — e.g. once titles map to short activity nouns, "went for a swim at the pool" →
    "Swimming", not the sentence). **Prompt is PURE pattern completion** (bare
    `Task:/Category:` pairs, NO instruction line — a 77M model parrots instructions back,
    seen live 2026-07-12). Decoding: `max_new_tokens: 8`, greedy, `repetition_penalty: 1.3`.
    Post-processing (unit-tested against live outputs in `generate.test.ts`): strips a leading
    `Category:` label; **truncates at a continued `Task:` marker** (the model answers, then
    keeps completing the pattern — "Socialization Task: How to pay" → "Socialization");
    extracts a **double**-quoted answer from prose wrappers (incl. an unclosed trailing quote;
    apostrophes must not count as quotes — `I'm sorry` mangled into "M Sorry"); **truncates at
    the first function word** ("Shopping for a new dress" → "Shopping"); caps at 2 words; and
    **rejects** chat refusals ("I'm sorry…"), question-style prose ("What is the best way…"),
    prompt-echo lines (checked on the full line, pre-slice), outputs with no name before the
    first function word ("To fix a leak…"), and single-letter degeneration → all rejections
    fall back to the title echo. This is real **generation**,
    which the embedding model cannot do — hence a second, separate model. **Never load-bearing:**
    if the generator is unavailable/slow/fails, it **falls back to the title echo** (current
    behavior) — the app still works with ML off. On-device only (self-hosted like the embedding
    model, per the law); no cloud. Output is post-processed (trim, cap length, Capitalize).
  - **User-selectable model, lazy per-selection load (2026-07-11):** the app offers a **list of
    generative models** (Settings); the user picks one. All candidate models are *hosted on the
    server*, but **only the selected model is streamed into the browser**, on first use — never
    all of them. Switching selection loads the newly-chosen model on demand (and drops the old
    from memory). The model id lives in one config constant/registry so the list is easy to
    extend. **Default is "Off" (echo the title)** — generation is opt-in, since it's a
    multi-tens-to-hundreds-MB download; nothing downloads until the user selects a model.
  - **Implementation (built 2026-07-11):** `ml/genModels.ts` (registry + `GEN_OFF`),
    `ml/genWorker.ts` + `ml/genClient.ts` (a `text2text-generation` worker mirroring the
    embed worker — one model held at a time, self-hosted under `public/models/`), `ml/generate.ts`
    (`generateNewSubhead`: few-shot prompt from `loadTitleCorpus` pairings → post-process to a
    1–3 word Capitalized name), `ml/useGeneratedSubhead.ts` (500ms-debounced hook, only fires
    for a `"new"` suggestion with a model selected). Wired in `TaskDrawer.tsx`:
    `proposedNew = generatedNew ?? title.trim()` feeds both the autofill and the choice-row
    display; the autofill effect re-runs when the async name resolves, upgrading the echoed
    title to the generated name while still app-sourced. Setting is `genModel` in `settings.tsx`,
    picker in `SettingsPanel.tsx`. **Operational note:** a selected model only works once its
    files are hosted at `public/models/<id>/` (same as the embedding model); until then it
    fails closed → title echo.
  - **Dev/preview server must 404 missing `/models/` files, not SPA-fallback (fixed
    2026-07-11):** transformers.js probes *optional* model files (e.g. `added_tokens.json`) that
    many repos don't ship. A real static host 404s them and the library ignores it, but Vite's
    dev/preview answers `200 + index.html`, which the library then `JSON.parse`s ("Unexpected
    token '<'") and the whole model load fails. The `modelFile404` plugin in `vite.config.ts`
    returns a real 404 for missing files under `/models/` (dev *and* preview), matching
    production. Symptom this fixes: a model whose `config.json` loads fine but loading still
    dies on a `<!doctype …>` JSON parse error.
  - **transformers.js poisons its own Cache Storage with bad responses (fixed 2026-07-12):**
    the library caches every model-file response in the `transformers-cache` Cache Storage —
    including an `index.html` SPA fallback from attempts made before the files were hosted.
    Poisoned entries are read back forever **without hitting the network**, so server-side
    fixes alone never resolve the load (diagnostic signature: `getModelJSON` JSON-parse error
    with NO network request). `genWorker.ts`'s `purgePoisonedCache()` deletes any
    `text/html` entries from that cache before each pipeline load, keeping valid cached
    weights intact.
  - **Both retrieval paths are scoped to the CURRENT registry** (2026-07-11): the kNN vote
    **and** the name-fallback filter their candidates to activities still in the registry, so a
    deleted sub-head never surfaces as an *existing* pick (only ever as "suggested new"). This
    is the safety net regardless of the pruning below.
  - **Deleting a sub-head FORGETS its pairings (2026-07-11):** deletion means "these
    title→sub-head pairings were wrong / no longer wanted" — so `deleteActivity` (and
    `deleteHead`, for each of its sub-heads) drops that activity's **title-corpus entries** and
    its **name vector** (`forgetActivity` in `vectorStore.ts`). Without this, the pairings are
    only *dormant* while the name is absent and would **resurrect** if a sub-head with the same
    name is re-created — re-fighting the vote against any newer pairing (e.g. an old
    `Cycling→Cycling` outvoting a deliberate `Cycling→Sports` retag). Forgetting makes a
    same-name re-create start clean. (The corpus/name cache remain purely derived, rebuilt from
    future task creations; the event log is the source of truth.)
  - **Reassign-on-delete RE-HOMES, it doesn't forget (2026-07-11):** deleting a sub-head that's
    *in use* forces reassigning its tasks to another sub-head — a genuine *move*, not a discard.
    So the config screen calls `rehomeActivity(from, to)` (re-labels the corpus entries to the
    destination, drops the old name vector) **before** the delete, so the title→sub-head
    training follows the tasks to their new sub-head. Plain (unused) delete still forgets.
  - **Tests:** `apps/web/src/ml/vectorStore.test.ts` (forget/rehome mechanics) and
    `suggest.test.ts` (deleted sub-head returns "new" not "existing", via a one-hot `embed`
    mock) cover this; `embed` is mocked so no model/worker is needed.

**Feature 2 — sub-head → head suggestion (implemented 2026-07-10, revised 2026-07-11):** the
same duality, wherever a brand-new sub-head needs a head — the Heads & Sub-heads config
screen's "Add a sub-head" form (§6, sub-head-first layout) **and** the task drawer's "New
sub-head's head" field (shown when the typed sub-head doesn't match an existing one):
confident → suggest an existing head; unconfident → clearly-labeled suggestion to create a
new head, never disguised as an existing pick. **No separate corpus** — every sub-head
already in the registry, plus the head it lives under, IS the training data: kNN vote (same
`NAME_FALLBACK_THRESHOLD` as the title-suggester's cold-start path, `suggestHeadForSubhead`
in `suggest.ts`) over the existing sub-head-NAME embeddings (the same cache the
title-suggester warms), weighted by similarity to the newly-typed sub-head name. Empty
registry, or nothing confident, → `"new"`. Same intent-wins rule: touching the head field
silences the suggester for that session.
- **Auto-fills like Feature 1, but from an EMPTY start (settled 2026-07-11 after two
  reversals):** the head field has **no static default** (never pre-seeded with `heads[0]` —
  that non-ML prefill was the real complaint behind an interim "tag-only, never auto-fill"
  rule that proved unusable: a bare `suggested` tag with an empty field tells the user
  nothing). A confident ML match auto-fills the field (provisional, `suggested` tag);
  `suggested new` seeds the field with **the sub-head name itself** as the proposed new
  head (2026-07-11 — same convention as the title→sub-head suggester's new case, which
  seeds the title; the field is never left empty once a suggestion resolves). Intent wins
  as always.
- **Head is required once a sub-head is being entered (2026-07-11):** the config screen's
  Head label shows the required dot (•) once the sub-head input has ≥3 characters, and the
  "Add sub-head" button is disabled while either the sub-head or the head is empty. The
  drawer's "New sub-head's head" field likewise starts empty (no `heads[0]` default);
  its existing required-dot/validation already covered the rest.
- **Intent wins — the Title is the only trigger; it re-fires on every title edit (revised
  2026-07-11):** a changed title = changed intent = a *fresh* suggestion. Editing the Title is
  never silenced by an earlier sub-head edit; the suggester recomputes on every title change.
  Editing or clearing the **sub-head** is **never** a trigger — it does not summon or re-apply
  a suggestion. What the next title-driven suggestion does depends on **who *sourced* the
  sub-head currently in the field** (tracked as a `subheadSource` of `"app" | "user"`) — the
  axis is *source*, not the field's value and not whether it is non-empty:
  - **App-sourced** (empty, or a value the app autofilled and the user left untouched) → the
    fresh suggestion simply **replaces** it. No choice prompt — there is no user intent to
    protect.
  - **User-sourced** — the user *acted* on the field: typed it, explicitly picked it from the
    dropdown, **or accepted a suggestion via _Use this_** (accepting is a user action → user
    intent). A title edit **never overwrites** a user-sourced sub-head. When the fresh
    suggestion *differs* from it, a **visible use-suggested choice** appears below
    the field: the `suggested`/`suggested new` **tag/pill** followed by the proposed sub-head
    name as a **clickable quiet-outline pill** and its **head** — `in` + the head name as a
    **brand-tinted pill**.
    For an existing sub-head that's its assigned head; for a `suggested new` sub-head the
    head-suggester (Feature 2) is run on it too and a confidently-matched **existing** head is
    shown as the suggested head (nothing shown when unconfident/"new"). **Clicking the sub-head
    pill uses the suggestion** (swaps it in — the swapped-in value is **still user-sourced**, so
    it too is protected on later edits). There is no separate "Use this"/"Keep mine" pair — the
    single pill *is* the accept affordance; leaving it untouched keeps the user's own value.
    Nothing is applied silently. Clearing a
    user-sourced field back to empty makes it app-sourced again, so the *next* title edit
    autofills.
- **Intent wins — head fields (Feature 2) unchanged:** once the user touches a head field in
  a drawer session, that head-suggester never fires again that session. Suggestions never
  auto-create registry entries.
- **Runtime:** transformers.js + `bge-small-en-v1.5` quantized (~34MB), lazy-loaded on first
  drawer open. **WebGPU is an optional accelerator, not a requirement** — automatic fallback
  to WASM on CPU (single-title embed ~50–200ms there; fine under a 400ms debounce). No GPU,
  no server, no cloud needed.
- **Vectors are derived data, never backed up:** embeddings are recomputable from titles;
  on a new machine the corpus re-embeds in the background. Only the event log is precious
  (same source-vs-artifact doctrine as §7.0).

**Backup/export of the store itself:** manual export/import and File-System-Access folder
auto-backup were designed and **deliberately deferred** (2026-07-10) — not in current scope;
cloud offload (§7.2) remains the eventual answer.

**Implementation (built 2026-07-10, extended 2026-07-11):** `apps/web/src/ml/` —
`embedWorker.ts` (transformers.js `Xenova/bge-small-en-v1.5`, quantized), `embedClient.ts`
(main-thread `embed()` promise wrapper around the worker), `vectorStore.ts` (localStorage
cache: past-title vectors capped at 1000 entries, sub-head-name vectors), `suggest.ts`
(`suggestSubhead`, `suggestHeadForSubhead`, `recordTitleActivity`), `useSubheadSuggestion.ts`
and `useHeadSuggestion.ts` (400ms-debounced hooks, same shape). Wired into **three** spots,
with the same `suggested`/`suggested new` tag (accent-strong outline vs dashed budgeted-hue,
never conflated), but the intent-guard differs by suggester (revised 2026-07-11): the **head
fields** use a `touched` flag that permanently silences the suggester for the session;
**Title → Sub-head** uses a `subheadSource` (`"app" | "user"`) that never silences — title
edits always recompute — and only decides autofill-vs-choice:
- `TaskDrawer.tsx`, Title → Sub-head (`subheadSource`) — a title edit replaces an app-authored
  sub-head, but protects a user-authored one, offering a clickable use-suggested pill instead,
  per Feature 1.
- `TaskDrawer.tsx`, new Sub-head → "New sub-head's head" (`newHeadTouched`, added 2026-07-11)
  — autofills from an empty start, per Feature 2.
- `HeadsConfigScreen.tsx`, "Add a sub-head" form's head field (`headTouched`) — autofills
  from an empty start, per Feature 2; both the Sub-head input and the Head dropdown carry
  small labels above them, Head gaining the required dot at ≥3 sub-head characters.

**`HeadsConfigScreen.tsx` layout (revised 2026-07-10):** the sub-head form's head field is a
free-typing `FuzzyDropdown` (pick existing, or type a brand-new head — `addActivity` creates
the head implicitly if it doesn't exist yet, no separate `addHead` call needed). A pre-existing
effect that reset the field to `heads[0]` whenever its value wasn't a known head had
`activityHead` in its dependency array, which stomped a freshly-typed new head name back to
`heads[0]` on every keystroke; fixed by scoping that effect to react only to `heads` itself
changing (registry additions/deletions), not to the field's own value.

**Model files are self-hosted, not CDN-fetched (fixed 2026-07-10):** the model
(`config.json`, tokenizer files, `onnx/model_quantized.onnx`, ~34MB total) is downloaded
once into `apps/web/public/models/Xenova/bge-small-en-v1.5/` and served same-origin;
`embedWorker.ts` sets `env.allowRemoteModels = false; env.localModelPath = "/models/"`.
Two reasons, not one: (1) satisfies "100% local & offline" literally — zero network needed
even on first run; (2) the page's `Cross-Origin-Embedder-Policy: require-corp` header
(added for SQLite-wasm OPFS) can block a worker's cross-origin fetch to a CDN that sends no
`Cross-Origin-Resource-Policy` header (confirmed: huggingface.co does not send one) — this
was the leading suspect when the feature was first reported not working, before a real
browser could be checked. Self-hosting sidesteps that entirely by making the resource
same-origin. Verification note: this sandbox has no headless-browser runtime (missing
system audio libs, no sudo) — verified via `tsc --noEmit` (clean), `vite build` (clean;
model files confirmed copied into `dist/models/`), and the dev server confirmed serving
all model files at the expected same-origin paths via `curl`. Live in-browser inference
was still **not** exercised end-to-end; do a manual check before fully trusting this.

**Second real bug found via user testing (2026-07-10):** the COEP theory above was not
actually the cause. The real error, seen at the 3rd typed character (the code's own
`title.trim().length >= 3` gate — nothing runs before that): `Cannot read properties of
undefined (reading 'registerBackend')` inside onnxruntime-web's bundle. Cause: Vite
pre-bundles a **Web Worker's** dependencies in a separate esbuild pass from the main app's;
`optimizeDeps.exclude` had `@xenova/transformers` but not `onnxruntime-web`, which ships
its own internal webpack-chunked UMD bundle (backend-registration modules that self-wire
into a shared registry object at load time) — esbuild's re-packaging broke that wiring.
First attempted fix (added `"onnxruntime-web"` to `optimizeDeps.exclude`, cleared
`node_modules/.vite`) **did not resolve it** — the identical error recurred. **Lesson:
don't stop at the first plausible theory** — the COEP hypothesis was reasonable but wrong;
a real browser console error was needed both times to find what was actually happening.

**Root cause and real fix (2026-07-10):** `@xenova/transformers` v2 is an archived/
unmaintained package; its bundled `onnxruntime-web` dependency ships a self-contained
webpack-chunked UMD build that is fundamentally hostile to modern bundlers (Vite/esbuild)
re-processing it — no `optimizeDeps` configuration reliably fixes this, it's a known class
of upstream packaging problem, not a config mistake. **Fix: migrated to
`@huggingface/transformers` v3+** (the official, actively-maintained successor — same
author, HuggingFace-adopted, purpose-built with a proper bundler-friendly ESM build,
`dist/transformers.web.js`), which does not exhibit this failure mode. API changes handled:
`pipeline(..., { quantized: true })` → `pipeline(..., { dtype: "q8" })` (v3 replaced the
boolean `quantized` option with a `dtype` enum; `"q8"` maps to the same `_quantized` file
suffix, so the already-downloaded `onnx/model_quantized.onnx` needed no re-fetching);
`env.allowRemoteModels` / `env.localModelPath` API unchanged. Verified: `tsc --noEmit`
clean, `vite build` clean (no more `eval`-in-bundle warning that v2's build triggered;
onnxruntime's own WASM binary now correctly emitted as a proper Vite asset), dev server
confirmed resolving the correct browser build (`transformers.web.js`) via `curl`. Still
awaiting final manual browser confirmation that typing now produces a suggestion with no
console error.

**EventStore dispatch is serialized (bug fixed 2026-07-11):** `dispatch()` runs through an
internal promise chain — one event fully reduces+persists before the next reads state. The
unqueued version read `this.state`, `await`ed the log append, then wrote `this.state` back;
two rapid dispatches (the drawer's "Add & start now" = CREATE_TASK + START_TASK) both
reduced from the same stale state and the second **silently discarded the first's result**
(task vanished, no error). One sequential reducer is the E5/§3.12 contract; the queue
enforces it at the store boundary. A rejected event must not jam the chain (the chain
swallows the rejection; the caller still gets it).

### 7.1 Termination guarantees (the anti-infinite-loop contract) — R-audit
- **Forward-only lemma:** every scheduler-caused motion of an unstarted task moves it strictly
  later; `now` strictly advances; every structural op consumes gap, consumes budget, or reduces
  segment count. Potential function strictly decreases → no infinite loop.
- **Check-before-split:** an op that would create a fragment < MIN_FRAGMENT is never performed
  (never performed-then-undone); slots < MIN_FRAGMENT are invisible to placement/wrap (R2).
- **Fixed single-tick op order (R3):** one ordered pass per tick, each task touched ≤ once:
  (1) advance `now`/running occupancy → (2) amputations → (3) top-down leading-chain resolution
  (slide/squeeze/wrap-transfer) → (4) gap merge/vanish → (5) reunification → (6) invariant
  asserts (no-overlap; Σ segment budgets = original; forward-only).
- **Atomic ceremonies (R9):** ceremony/injection steps are atomic reducer transactions; ticks
  queue behind them.
- **Bracket rebalance = one transaction, one direction (R5).**
- **Monotonic internal clock + batch catch-up (R11):** wall-clock/DST/reopen deltas are
  explicit reconciliation events, computed as one batch, not per-minute replay.
- **Global safety net:** per-tick structural-op circuit breaker (halt + snapshot on runaway,
  never silent corruption); event-sourced log → replayable bug reports.

### 7.2 Architecture & stack
- **TypeScript strict, pnpm monorepo:**
  - `packages/core` — pure scheduler: `(State, Event) → State`, integer minutes, **zero deps/
    IO**. Houses the settle-pass, tick pipeline, fork/commit, accounting identity.
  - `packages/store` — append-only **event log** + snapshots behind a `StorageAdapter`
    interface → **SQLite-wasm** (OPFS) on web (chosen over Dexie for history-scale queries,
    analytics GROUP BYs, mobile parity, Drive export); `expo-sqlite` later.
  - `apps/web` — React 18 + Vite **PWA**; Zustand; dnd-kit; absolutely-positioned timeline.
- **No backend in MVP** (local-first, solo). Cloud offload later = log segments to Drive.
- **Ticks:** minute-aligned interval + `visibilitychange` batch catch-up.
- **Testing:** Vitest + **fast-check** property tests enforcing the R-audit invariants
  (no-overlap, budget conservation, forward-only, no fragment < MIN_FRAGMENT, idempotent
  replay) + a **50k-tick random-soup simulation** harness.
- **Acceptance tests (deferred):** once UI flows stabilize, regenerate scenario-style
  (Gherkin) acceptance tests **fresh from this spec**, each scenario tagged with the rule
  it verifies (e.g. `@G7`). The old generic `features/*.feature` drafts were deleted
  2026-07-09; they described a different app and must not be resurrected. The spec stays
  the single source of truth — scenarios are a derived test layer, never a second spec.
- **Mobile later:** Expo/React Native reusing core+store untouched (health APIs → wearable).

### 7.3 Build order
0. **(done)** This spec.
1. Scaffold monorepo (pnpm workspaces, strict tsconfig, vitest, CI scripts).
2. `packages/core` — types → reducer skeleton → tick pipeline (R3 order) → settle-pass (§3.13)
   → wrap/squeeze/amputation (§3.7) → fork/commit (§3.12) → ceremonies → **property tests +
   simulation harness** (the bulk of the risk).
3. `packages/store` — event schema, snapshots, SQLite-wasm adapter, replay.
4. `apps/web` — timeline (now-seam) first, then pipeline, ceremonies, analytics/history.

### 7.4 Verification
- `pnpm test` green including fast-check suites; simulation harness: 50k ticks × 100 random
  soups, zero invariant violations, circuit breaker never trips on legal input.
- Manual: create all 5 timing types; start/pause/overrun through a fixed task; run a full SOD
  ceremony; edit-via-fork while a task runs and confirm re-settle at real `now`; verify
  timeline/pipeline sync — reproducing the spec's worked examples (§3.7 tick-by-tick numbers)
  exactly.

---
