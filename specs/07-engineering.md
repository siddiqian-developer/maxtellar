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
- **Intent wins:** once the user touches the sub-head field in a drawer session, the model
  never fires again that session. Suggestions never auto-create registry entries.
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
each with its own `touched` flag (set the instant the user edits the suggested field, which
permanently silences that suggester for the session) and the same `suggested`/`suggested new`
tag (accent-strong outline vs dashed budgeted-hue, never conflated):
- `TaskDrawer.tsx`, Title → Sub-head (`subheadTouched`) — autofills, per Feature 1.
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
