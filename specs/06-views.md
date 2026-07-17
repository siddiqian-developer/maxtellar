# PART VI — VIEWS

One spine, multiple projections.

**Screen navigation (2026-07-12):** the app has four screens — **Day** (timeline +
pipeline, the default), **History**, **Analytics**, and **Heads & Sub-heads config**
(reached via Settings, not the menu). History and Analytics are **full screens** like the
config screen: they replace the timeline+pipeline grid area entirely (real navigation, no
overlay/scrim). A **topbar navigation menu** sits directly after the wordmark: three quiet
icon-only buttons (Day / History / Analytics — house floating-icon-button style, custom
tooltips, monoline SVG). The **active screen's icon reads full `ink`** with a small
underline bar; inactive ones stay `ink-faint`-quiet. Esc / the back (‹) affordance follow
the back-navigation stack rule below — History/Analytics opened from the menu return to
**Day**.
1. **Active timeline (MAIN):** Google-Calendar day view; **pinned now-seam** (~35% height, day
   flows upward through it); left time axis; box heights ∝ duration; ticks every minute; strong
   seam duality; gently-witnessed reflow. Gaps = hatched empty space. Overrun = box tail past a
   budget mark. **No time label on the seam** — just a plain dot on the axis (Google-Calendar
   style); the global clock already shows the time. When scrolled away from the seam, a quiet
   icon-only **"back to now"** control floats bottom-center (no label text — see
   `docs/design-tokens.md` "floating icon buttons").
   **Plan blocks are hued by timing type (2026-07-11)** — the same state-hue palette as the
   pipeline badges and drawer chips (one hue per type: unscheduled / budgeted / semi / fixed),
   applied as a soft fill + a colored left bar.
   **Block edges encode anchoring (2026-07-11):** a block's borders say which coordinates are
   pinned — **top edge = start, bottom edge = end, left edge = whether the duration is
   committed**; solid = anchored/committed, dashed = floating/presumed. So: unscheduled = all
   dashed; budgeted = dashed top/bottom, solid left; fixed = all solid; semi-head = solid top,
   dashed bottom + left; semi-tail = solid bottom, dashed top + left. (Reads directly off
   §2.3's {start,end,budget} knowledge.)
   **A pinned start/end (solid top/bottom) is drawn MORE prominently (2026-07-12):** those two
   edges are thicker (2px) and a stronger ink (`ink-soft`) than the provisional dashed edges, so
   an anchored coordinate reads at a glance.
   **Every task box whispers its start/end clock time (2026-07-12):** the start (top) and end
   (bottom) timestamp is shown aligned to that edge in the time gutter, smaller than an hour tick
   so it never competes, and joined by a short **graduation line** — a ruler-style tick drawn on
   the **RIGHT side of the axis** (2026-07-12), reaching from the axis toward the block edge it
   labels (stopping at the block inset). Each tick points at what it belongs to: task times belong
   to blocks (right of the axis), hour marks belong to the ruler labels (left gutter).
   It reads in the main `ink` (readable, not dimmed). Its style
   **follows the edge's border**: an **anchored** edge (solid — a pinned coordinate) reads
   **upright**; a **floating** edge (dashed — presumed by the scheduler, reflows) reads **italic**
   with a leading **"~"** ("≈, will move"). So `fixed` → both upright; `semi-head` → upright start,
   ~italic end; `semi-tail` → ~italic start, upright end; `budgeted`/`unscheduled` → both ~italic;
   an **open** (budget-less) task's end is a presumed cap, so it is always ~italic regardless of
   timing. Gaps get no times; a split task labels only its real start (first part) and end (last
   part), never an internal split boundary. **Coinciding times dedupe (2026-07-12):** where one
   box's end lands on the next box's start (same minute), only the **later** task's label is kept
   — a start outranks an end, since the start owns the boundary going forward.
   **Hour vs task-time collision — offset + leader (2026-07-12):** a task time that would land on
   top of an hour label is **pushed below the hour** and a **diagonal leader line** points back up
   to its true edge on the axis (so the label clears the hour but still reads as belonging to that
   edge). Up to **two** such labels stack under one hour (each a step lower); a rare third stays at
   its edge without a leader rather than piling up. The offset label drops its own graduation tick
   (the leader replaces it, terminating in the same short right-side tick past the axis).
   **Always-on hour graduation tick (2026-07-12):** every labelled hour also carries a short
   **solid** tick on the axis, extending **LEFT off the axis line toward its hour label** in the
   gutter (swapped from right, same day — task-time ticks own the right side; see above). This is
   independent of the opt-in sub-hour grid below — hours always show their tick.
   **Sub-hour ruler graduation is OPT-IN (2026-07-12):** between the labelled hours the timeline
   can show minor graduation ticks, controlled by **Settings → Timeline grid** with granularity
   **Off / 5 / 10 / 15 / 30 min** and **defaulting to Off**. When on, ticks are drawn off the axis
   (half-hour marks longer/stronger than the finer ticks); hours keep their existing label.
   **Running block (2026-07-11): full projected span, never shrinks.** The running task
   renders start → projected end at all times (countdown: `now + remaining`; stopwatch: open
   tail rides `now`), split two-tone by the seam: **spent above (stronger accent fill,
   ~32% mix, accent bottom hairline), remaining below (accent-soft)**. Label shows elapsed
   and (countdown) time left. The earlier render — a sliver that grew from the start point,
   reading as the task "shrinking" out of its planned height — is superseded.
2. **Pipeline:** Running + unstarted only; uniform cards; gaps as subtle spacing; a **control
   surface** (Start/Pause/Cancel sync to timeline unconditionally; scroll-sync only when
   co-displayed). Desktop shows timeline + pipeline side-by-side; mobile uses bottom tabs.
   **BUILT (2026-07-16):** below **720px** the two panes become bottom tabs — one at a time, no
   resizer, the FAB lifted clear of the bar. Both panes stay **mounted** (CSS hides one), so the
   timeline keeps its follow-scroll position and nothing re-settles on a tab switch; Start/Pause/
   Cancel "sync to timeline unconditionally" for free, since they go through the same state. (No
   cross-pane scroll-sync exists to disable — the timeline only follows `now` itself.) The `.app`
   grid uses `minmax(0, 1fr)` on mobile: plain `1fr` floors the track at the topbar's min-content
   (~760px) and drags the whole page into a horizontal scroll. ~~**Known gap:** the topbar's own
   controls still exceed a phone's width and scroll horizontally within the bar.~~ **BUILT
   (2026-07-16): the topbar REFLOWS instead of scrolling** — below 720px it wraps (flex-wrap +
   a full-width `::after` break item) into stacked rows: identity + navigation (wordmark, screen
   menu … theme, settings), then the hero metric, then the ceremony controls right-aligned. The
   desktop spacers stand down (`display:none`); the global clock stays hidden (already law). No
   horizontal scroll exists on the page OR inside the bar (verified at 390px).
   **Cards follow TIME order (2026-07-11), mirroring the timeline** — sorted by each item's
   first placed part, not by raw priority rank (an anchored task can be placed earlier in
   time than a higher-priority float; the two projections must agree). Unplaced items sink
   to the end in rank order.
   **Unstarted-card Cancel buttons carry the danger accent** (2026-07-11, per the semantic
   action-button color law — outline `--danger`, same as the drawer's Cancel).
   **Card anatomy (2026-07-12):** every pipeline card is built from these elements, top to
   bottom (exact values in `docs/design-tokens.md` "pipeline task card"):
   - **State-hued left bar** (3px): the card's left border carries the state hue — running =
     `accent`, overrun = `danger`, unstarted = its timing-type hue (the §"State-hue pills"
     palette). The rest of the border stays hairline.
   - **Header row:** pipeline **index badge** `#N` (time-order position, tabular-nums; the
     running card takes `#1` and the unstarted list continues from `#2`) — on the running
     card the index is joined by a **live ripple dot** (accent; danger when overrun; the
     ripple is an "ON" lamp, suppressed under `prefers-reduced-motion`); the **title**
     (static text — editing stays in the drawer/fork, never inline on the card); a quiet
     `OMMF` pill when set; a **timing-type pill on EVERY card (2026-07-12)** — the
     task's timing type (Fixed/Semi-head/Semi-tail/Budgeted/Unscheduled) as a small
     pill filled with its `--st-*` hue (the drawer type-chip look), sitting just before
     the capsule; the running card carries its timing from START_TASK, a paused
     remainder shows its recomputed remainder timing — and the **status capsule**,
     now **lifecycle-only (2026-07-12)**: `Started • Running`, `Started • Overrun`,
     `Started • Paused` (a paused remainder, `remainderOf` set), or single-segment
     `Unstarted` (its former timing substate moved to the timing pill — nothing reads
     twice). **Paused is never Unstarted (2026-07-12):** work on a remainder has begun;
     it is the continuation, not a fresh task. Substate text takes the state hue; the
     capsule background is a soft tint of the same hue.
     **The head badge lives in the header row too (2026-07-12):** the neutral pill
     `Head · Sub-head` sits directly **next to the title** (colorless — hue is reserved
     for STATE, same law as the timeline; it shrinks/ellipsizes before the title does);
     the capsule stays pinned to the row's right edge. The badge's former own row is gone
     — the card is one row shorter.
     **Lock icon on non-slideable cards (2026-07-13):** when `isSlideable = false`, a small
     muted padlock (inline SVG, text-sized, neutral — never a state hue) sits in the header
     row immediately after the title. Absence = slideable: the common case stays quiet, only
     the immovable card is marked. Pipeline cards only for now (timeline blocks may follow
     later). Exact size/color in `docs/design-tokens.md` "pipeline task card".
   - **Fields row** (labelled, read-only): tiny uppercase labels over tabular-nums values,
     **all packed in a SINGLE row (2026-07-12)** — five cells (six on a paused remainder),
     never wrapping to a second line.
     **Every card shows Spent and Remaining (2026-07-12)**, not just the running one:
     `Start(ed) / End(s) / Budget / Spent / Remaining` on every card. Fresh unstarted:
     Spent `00:00`, Remaining = budget. Running countdown: live Spent/Remaining. Running
     open (stopwatch): Ends `—`, Budget `open`, Remaining `—`, Spent ticks (it IS the
     elapsed meter). A **paused remainder** additionally: its Spent sums the prior
     segments' history (walking the `remainderOf` chain), its Budget shows the **original
     total** (spent + remaining — so `remaining = budget − spent` reads true, matching
     every other card), Remaining = its own stored budget, and it carries a sixth field —
     **Paused (2026-07-12, always shown on the paused part)**: live minutes since the
     pause moment (`now −` the last segment's history end), ticking. Absolute times
     follow the
     timeline's edge language: an **anchored** coordinate reads upright; a **presumed**
     (scheduler-placed, will reflow) one reads *~italic*; unplaced shows `—`. The running
     card's projected end is always presumed (~italic).
     **A paused remainder has no "start time" (2026-07-12):** its first time field is
     labelled **Restart** (the scheduler-placed resume moment — ~italic unless anchored);
     the earlier separate `Resumes at <time>` pill is **removed** as redundant with it.
   - **Wasted badge:** the running card shows a quiet `Wasted <dur>` pill when its
     `channels.wasted` > 0.
   - **Footer actions** (unchanged semantics, **compact height 2026-07-12** — see
     design-tokens): running → Pause (neutral) + Complete (primary); unstarted → Start
     (primary) + Cancel (danger outline). (The dev-sandbox ⏩ speed-ups that used to sit
     here moved to the topbar dev clock, 2026-07-12.) A meta line notes
     splits (`N parts`) and squeeze (`squeezed Nm`).
   Explicitly **not** on the card (rejected from the reference): inline field editing /
   steppers (drawer's job), calendar-provenance tags (no external calendar in MVP),
   re-open/refine-timing corrections, twin spent/remaining split cards
   (a pause = history entry + one remainder card), done/locked states (pipeline never
   shows finished work).
   **Reorder-to-reprioritize IS on the card now (ruled 2026-07-16, supersedes the earlier
   "drag-to-reorder rejected").** Every unstarted card carries a **▲▼ priority pair** (raise/
   lower one rank) AND a **drag handle** (dnd-kit) for coarse reordering; both dispatch `RERANK`
   (§3.11) and the plan re-settles with the downward **ripple**. This is the **layered** model
   (§3.11): the reorder overrides time-order for that action, then time order re-activates over
   the new rank — so a dropped card is not pinned in place, it re-sorts by its new placement. An
   invalid reorder (above the running card, onto started work) **snaps back with a notify**. The
   running card (#1) is never reorderable. The **timeline** blocks carry the same pointer-drag
   reorder (§6.1). Built on **dnd-kit** (§7.0.4 buy-first — the specced DnD lib, healthy on a live
   check 2026-07-16).
   **The split is user-resizable (2026-07-11):** a 6px drag handle between the columns
   (hairline at rest, accent-soft on hover/drag) sets the pipeline width — clamped
   240px…60% of the window, persisted locally (`pipelineWidth`), default 340px. The new-task
   fab tracks the divider (anchored to the timeline's bottom-right corner, 20px inset).
3. **Analytics — the 24h zero-sum ledger (from the author's 8-yr Google Sheet; core feature).**
   - **24-hour zero-sum mechanism:** every day's 24h is fully budgeted and fully accounted —
     Sleep + Waking; Waking = Work + OTW-Productive + Wasted + Lost. Nothing escapes a bucket;
     the columns must sum to 24h. This is the spiritual centre of the whole app.
   - **Real-time budgeted-vs-achieved per head:** for every head, live `Target / Achieved /
     Remaining` (per-day and weekly), updating as the day ticks — exactly the sheet's
     `Targets | Achieved | Remaining` block, but live.
   - **Weekly report:** per-head weekly target vs achieved vs remaining, plus the aggregate
     rows (Sleeping / Waking / Work / OTW-Productive / Total-Productive / Wasted / Lost Hours).
   - Time-blind on start/end times; totals only; Skipped = 0m; persistent deficit badges.
   - **First slice shipped (2026-07-12), a full screen via the topbar menu:** two sections.
     **Today** — the elapsed-day ledger: hero row `Accounted / Wasted / Lost` (wall elapsed
     = accounted + lost; wasted is the sum of `channels.wasted`), then a per-head table of
     achieved minutes (occupancy history + the running task's live spend), zero-sum against
     the accounted total. **This week** — per-head × last-7-days grid of achieved minutes
     with row/column totals. Durations only (time-blind), `fmtDur`. **Target/Remaining
     columns arrive with quotas (§5.1)** — omitted until quotas exist, not shown empty.
     **Days are SLEEP-CYCLE days (R5, 2026-07-16):** once the first SOD seals a `DayRecord`,
     **Today** is the forming day (last `DayRecord.end` → `now`) and **This week** is the last 7
     sealed cycles + the forming one, each windowed on its real `[start,end)` (a cycle may run
     30–100 h, never clipped to 24 h). The forming column is marked "now". Before any SOD (no
     `DayRecord`s) it falls back to **calendar days** so a fresh install still reads.
   - **Sheet mapping (reference):** sheet "heads" (Main Work, Self-Management, Health, Job,
     Core Work, Self-Learning, Kitchen Work, Sleep, Rest, Meditation, …, Time-Wasted subtree)
     → app **Heads**; sheet per-day columns → app **days (sleep-cycles)**; sheet Budgeting
     block → app **quotas** (§5.1); sheet Aggregates (Sleeping/Waking/Work/Productive/Wasted/
     Lost) → app **built-in aggregate rows**. The sheet's Wasted subtree (WhatsApp/YouTube/
     Sleepless-Bedtime/…) confirms **Wasted Time** needs user-defined sub-activities.
4. **History:** exact as-happened flow; history editor for pre-SOD edits (no-overlap enforced;
   end ≤ now wall). Cloud-offload provision (e.g. Drive) for unbounded growth.
   **First slice shipped (2026-07-12), a full screen via the topbar menu — read-only** (the
   editor was a later slice, now landed — see below): entries **grouped by day, oldest day
   first**, day heading with a
   hairline underline; within a day, rows **oldest-first** (top-to-bottom = chronological, the
   screen reads like the day happened; reversed from the first slice, 2026-07-13). **Idle time
   between two consecutive finished runs renders as a quiet gap row** between them (dimmed, no
   pills: just "gap" + its duration via `fmtDur`); zero idle → no row. **Only between two
   finished runs:** no trailing gap row from the last run to `now` (still forming — Lost Hours
   in analytics owns it), none before the day's first run. A gap spanning midnight splits at
   the day heading, each day showing its portion. Each row: absolute start–end range
   (upright — history is fact, never ~italic), title, neutral `Head · Sub-head` pill, an
   **outcome pill** (Completed / Soft-ended / Cancelled / Skipped — outcome is state, so these
   take a hue: completed = accent, soft-ended = hue-less, cancelled/skipped = danger-tinted /
   dimmed), and the duration (`fmtDur`; skipped = `00:00` zero-occupancy marker).
   - **Editor slice (shipped 2026-07-15, Stage 3).** The screen is no longer read-only. Commit is
     **immediate and per-entry** (no sandbox toggle): each entry **row is clickable** → a right-side
     editor drawer (reusing the task-drawer chrome) editing Title / Sub-head (head derived) / Start
     / End / Outcome / Sleep-kind; **Save** dispatches `EDIT_HISTORY` (full-history atomic replace,
     this entry changed) and **Delete** dispatches `EDIT_HISTORY` with the entry omitted. A header
     **"+ Add entry"** back-logs a fresh past entry via `BACKLOG` (the guarded single-entry insert).
   - **Time fields are smart-input with the HISTORY direction (§7.0.2).** A bare clock resolves into
     the **past** (`resolvePastTime`: today if `≤ now`, else the day before), a year-less date to the
     nearest past occurrence — the mirror of the planning drawer's forward-snap — never bumped
     forward, always `end ≤ now`. At commit, `fitPastInterval` makes **all valid snaps** to land a
     legal non-overlapping interval: Start snaps up to the **editable-window floor** (interim:
     yesterday's calendar-day start) and out of any entry it overlaps; **End snaps to the largest
     legal value `min(now, start-of-next-entry)`** (this also catches End-before-Start). Every
     meaning-change shows in the snap-notify strip, and a snap **asks for one more Save to confirm**
     (a clean interval saves in one tap). Footer button order/spacing matches the New Task drawer
     (primary left, Cancel right; Delete in the secondary slot, danger-tinted).
   - **Gap-fill affordance.** Any gap longer than **30 min** — interior (between two finished runs)
     **or the still-forming trailing gap from the last run to `now`** — carries a **"fill"** button
     opening the >30-min **GapFillModal** ("what happened?" → Activity / Sleep / Nap / Wasted /
     Leave→Lost, driving `BACKLOG`; §4.2). Surfacing the trailing gap is the editor's **one
     deliberate divergence** from the read-only "no trailing gap" rule (the read view still omits it;
     analytics' Lost Hours still owns the unfilled residue until SOD). Gaps ≤ 30 min stay quiet.

**Task entry:** FAB → drawer (Title / Sub-head / Start / End / Budget), live type-morph
chip, inline physics-snapping, `[Start now ⚡]`. Title accepts deterministic shorthand tokens
("1h30", "@18:00", "15:50-16:20", "#head") parsed by a plain grammar (`titleGrammar.ts`).
**Title shorthand grammar (rulings, grilled 2026-07-16).** The grammar is **purely
syntactic** — it recognizes and strips tokens, then hands the raw time/duration substrings to
the *same* casual parsers a typed field uses; it never re-implements time/duration parsing.
Recognition itself delegates to `casualTime` (`parseTimeOfDay`/`parseCasualDuration`), so a
token is only stripped once those confirm it really is a time/duration — ordinary title text
(`e-mail`, a bare `12`, a plain `18:00` with no `@`) is left in place.
- **Fires on Title commit** (blur/Enter), never per-keystroke (it must not fight the live
  title→sub-head suggester mid-type). Recognized tokens are **stripped from the title in
  place** — `Write report #work @18:00 1h30` → title `Write report`, whitespace collapsed.
- **Token → field map:** `@18:00`/`@6pm` → **start**; a `15:50-16:20` / `9am-11am` range →
  **start AND end** (a scheduled window); a unit-bearing `1h30`/`45m`/`2h`/`1d` → **budget**
  (a bare number is never a duration). Extracted times/duration are then run through the exact
  **§3.6 derivation + universal snap-notify pipeline** (`deriveDayAware`) — so forward-snap,
  overnight wrap, the tomorrow-offer chip, and the MIN_FRAGMENT floor all apply unchanged.
- **`#token` smart-resolves** against the head/sub-head registry: a confident **existing
  sub-head** wins (exact case-insensitive, else the tightest `fuzzy.ts` subsequence hit) and
  its head auto-derives; otherwise it's a **new sub-head** named as typed — and if the token
  also names an existing **head**, that head is seeded so the new sub-head lands under it.
  Single word only (`[A-Za-z0-9][\w-]*`); multi-word sub-heads stay in the dropdown. First
  `#token` wins; every `#token` is stripped.
- Grammar-filled sub-head/head is marked **user-sourced** (`subheadSource:"user"`) so ML never
  overwrites it (§7.0.1). A token **wins over an already-filled field** it names (typing it is
  an explicit act); fields it doesn't name are untouched. The whole grammar is **suppressed
  under an active preset** (Sleep/Nap/Food) — the preset's locked bundle owns those fields.
**AI/ML policy (amended 2026-07-10, supersedes "No AI/LLM anywhere"):** cloud LLM/AI only in
very late stages and only where it provides real value, always with local fallbacks — even
cloud-exclusive features must never block the app's regular functionality. **On-device ML
inference is permitted** — some features on by default, some opt-in, always overridable,
**never load-bearing for correctness: the app must work identically with ML off.**
Full design: §7.0.1.
Drawer behavior (see also `docs/drawer-reference.md`):
- **Chrome:** right-side slide-in card (max 440px) over a scrim. **Clicking the scrim does
  NOT dismiss (revised 2026-07-11** — half-typed tasks are too easy to lose to a stray
  click); close via **Escape**, the header ×, or Cancel only. Sticky header (title + ×),
  footer **`Add(primary) · Add & start now ⚡ · [space] ·
  Cancel(danger outline)`** — Cancel is not neutral-styled (it would recede to nothing next
  to the primary) and its accent must **match its meaning**: danger-toned outline, not the
  brand teal. General law in `docs/design-tokens.md` "semantic action-button colors".
- **Sub-head, not a flat head field** (§2.1 Head/Activity hierarchy — "flat heads" in §8
  means this two-level shape, one head per activity, not a single unstructured field):
  a searchable dropdown of existing **activities** (sub-heads, e.g. "Project — AI
  Automation"). Selecting a known activity **auto-derives and displays its head as a
  read-only line** (`Head: Labor Work`) the moment it's picked — never editable there.
  Typing a brand-new activity reveals one extra required field, "New sub-head's head" (pick
  an existing head or type a new one); submitting registers the pairing in the heads
  registry so it's remembered next time. Managed at the registry level via the full-screen
  **Heads & Sub-heads** configuration screen (below), not just inline creation.
- **Default on open: `budgeted` with budget prefilled 00:30** (DEFAULT_BUDGET = 30 min).
- **Type chips are always selectable** (the app never says no): the type is derived live
  from field presence (§3.6), and tapping a chip **pre-fills** its fields — budgeted →
  budget 00:30; semi-head → start `now`; semi-tail → end `now`+30; fixed → start `now` +
  budget 00:30 (end derives); unscheduled → all cleared. Fields a type excludes are cleared.
- **Field roles are shown minimally, never as words:** a **required** field gets a quiet
  accent dot after its label; **optional** shows nothing; a **not-used** field is dimmed
  (~45% opacity). The full role is still in the label tooltip. A **fixed** task treats
  start, end and budget as all required (symmetrical): all three are mandatory values,
  entered as any two with the third auto-derived per §3.6.
- **Time fields are day-aware & casual (§1.6).** Start/End hold an absolute epoch minute
  (the truth), not a today-relative clock — so multi-day entry works. Input is **casual**:
  the field parses loose forms and reformats on commit (blur/Enter) per the 12h/24h setting
  — `3pm`→`3:00 PM`, `1500`→`3:00 PM`, `150`→`1:50 AM`, `tom 7am`→`Tomorrow, 7:00 AM`,
  misspelled day words tolerated (`tmorow`). Rulings: hour>12 always reads 24h; digit-count
  disambiguates (`150`=H:MM, `1500`=HH:MM); a single minute digit is the tens place
  (`3:0`→`:00`). **Day coverage:** today & tomorrow are *typed* (`today`/`tom`/`tomorrow`);
  a **📅 affordance opens a month-grid calendar whose earliest selectable day is `now`+2**
  (day after tomorrow onward — today/tomorrow are never in the calendar). Budget is a
  **casual duration** (`1h30`, `1days 2.5hr`, `45m`) shown as `Nd Nh Nm`, zero-units
  trimmed, always ≥ minutes (`90m`→`1h 30m`, `30m`→`30m`). ±5-min stepper chevrons on all
  time **and duration** fields — on **every surface**, not only this drawer (ruled 2026-07-16,
  §7.0.5 symmetry; steppers skipped by tab order). Parser is deterministic-grammar-first with an
  ML fallback seam (§7.0.2); never load-bearing.
- **Preset pill row (directly under the timing-type chips).** Headed by a **`Presets` label** in
  the main view; the ⓘ glyph carries only the auto-select footnote. The row is the user's OWN
  configurable list (`settings.presetsConfig`, §11.1c/§2.10b — shipped default: Exercise, Food,
  Learning, Nap, Meditation, Sleep) — each pill pre-fills a bundle (locked Title/Sub-head/Head
  for Sleep/Nap, editable for the rest; `breakable` off; the preset's own timing type +
  budget/anchor, resolved from a flat value, the week plan, or Settings). Selecting a pill fills
  and locks those fields (locked inputs render read-only/disabled); tapping the active pill again
  deselects and **restores the pre-activate snapshot**. A title matching a preset auto-selects
  its pill (ML-tagged, undoable), unless the user has already toggled a pill this session
  (intent wins, §7.0.1). The **`auto` tag rides on the active pill's saturated fill** — rendered
  **pure white on dark**, and a white chip with dark text on light, so it reads on either theme.
  There is **no "ordinary" pill** — no pill selected *is* ordinary. (Settings' own preset
  CONFIGURATION screen is a compact table, not pills — §11.1c; every picker surface keeps pills.)
- **Snap-at-entry + universal snap-notify (binding pattern, all input fields — see §7.0.2).**
  A value that violates a floor/physics rule is **corrected the instant it is committed to the
  field**, and **every meaning-changing adjustment is announced** in the inline notice list —
  never accepted-then-rejected later, never silently changed. Flow: **casual formatting →
  adjustments/validation → notify**. Meaning-changes that notify: a Budget below MIN_FRAGMENT
  raised to the floor; an End earlier than its Start wrapped to the next day; a Start/End
  **earlier than `now`** kept today and snapped forward, **plus a one-tap "Did you mean
  Tomorrow HH:MM?" chip** (covers both "unaware of now" and "meant tomorrow"; the app never
  says no). Pure reformatting (`3pm`→`3:00 PM`) is **silent** — it's expected, not a
  correction. No invalid value ever enters state; the reducer's `snapTask` is the backstop.
- **Flags on one row**, terse: `OMMF` (uppercase), `slideable`, `breakable`.
- **Title, Sub-head, and the new-sub-head's-head field each carry a very subtle inline
  clear (×)** — appears only once non-empty, `ink-faint` at 50% opacity, brightens on
  hover; tab-skipped. Quiet by default, matching the house floating-icon-button style
  (`docs/design-tokens.md`), not a heavy always-visible affordance.
- **All behavior flags (§2.5) exposed:** ommf, slideable, breakable as checkboxes.
  Defaults derive from the type (slideable ← type ≠ fixed; breakable ← budgeted ∧ ¬ommf);
  the §2.5 validity matrix is enforced live by disabling invalid combinations
  (fixed → slideable off; budgeted → slideable on; breakable only for budgeted; ommf →
  breakable off).
- Time-field derivation runs on field commit per §3.6 (second field present derives the
  third; overnight end wraps +1 day); hard blocks (zero duration, missing title) surface
  as an inline error banner, never a browser alert.
- **Section headings ("Timing type", "Flags") are removed.** Each of those rows instead
  carries a **very subtle `ⓘ` glyph at its right edge** (ink-faint, ~35% opacity, brightens
  on hover/focus) whose tooltip holds the guidance.
- **Tooltips are custom and subtle** (never native `title`): trigger carries `data-tip`;
  a quiet paper-raised card with hairline border and ink-soft 11px text fades in above the
  element after a ~0.5s dwell. Used for the section glyphs and the remaining terse labels
  (field roles, Head, individual flags). No inline parenthetical hints or instructional
  label suffixes anywhere in the drawer.

**Splash screen (2026-07-11):** shown on every app open, held a **minimum of 3 seconds**
from first paint even if the store loads sooner, then fades out over 450ms. Composition,
top to bottom, centered on bare `--paper`: the serif wordmark ("maxtellar", 58px) rising
in with letter-spacing easing from wide to normal; beneath it the **now-seam motif** — a
280px accent-soft line that draws out from its center, carrying a 12px accent dot that
then sweeps end-to-end and back on a ~2.4s ease loop (the app's signature living element,
previewed before the app itself); last, the tagline **"every minute accounted"** (13px
uppercase, wide-tracked, ink-soft). Staggered entrances (wordmark → seam → tagline); same
visual language as everything else — no gradients, no glow. Exact timings/sizes in
`docs/design-tokens.md` ("splash").

**Global clock:** absolutely centered in the topbar (independent of side content width),
stacked layout — muted short date (e.g. "Mon, 9 Jul") **above** a bold serif time with
seconds. **12h with AM/PM by default**, 24h available. Hidden below 720px width. Ambient
only — it displays real wall time and is distinct from the scheduler's logical `now` /
the now-seam.

**Time formats:**
- Timeline/history → absolute times; pipeline cards → durations (absolute only on anchored
  edges); analytics → durations. **12h with AM/PM by default**, 24h available — one app-wide
  setting (below), not per-view.
- **Durations:** `MM:WW:DD:HH:MM`, with MM/WW/DD shown only when non-zero (90m → `01:30`;
  8d 2h → `01:01:02:00`).
- **Absolute dates:** current calendar date shows **no date label (not even "Today")** — bare
  time; previous → "yesterday"/exact; next → "tomorrow"/exact; farther → exact date.

**Settings panel:** gear icon in the topbar opens a panel using the same slide-in chrome as
the task drawer (right-side card, scrim, sticky header, `Done` footer, Escape closes it too).

**Transactional (draft/commit/revert).** Every change **reflects live** in the running app the
moment it is made (the plan re-lays-out, the clock reformats, etc.), but is **only committed on
`Done`**. **Esc, the header ×, and a scrim click all revert** every field to the values captured
when the panel opened. The snapshot is held **above** the panel so it **survives the round-trip
to the Heads & Sub-heads screen** ("Manage heads & sub-heads →" navigates away but keeps the
uncommitted changes; returning re-opens Settings with them still pending). Accepted consequence
(intentional, per the "no commit without an explicit Done" rule): leaving the Settings→Heads
flow by any path that never returns to Settings leaves those live changes **effectively
soft-committed** — neither a formal Done nor a revert fires. One lossy edge: raising
MIN_FRAGMENT re-snaps sub-floor budgets up; a later revert restores the *setting* but not
budgets that were never legal to store (they were snapped, not remembered).

Holds the **Minimum fragment (minutes)** setting (§3.7): the MIN_FRAGMENT floor, default 5,
min 1; dispatches `SET_MIN_FRAGMENT`. Raising it re-snaps every stored budget up to the new
floor and lifts the dependent floors (open cap, semi-tail floor) if it overtakes them.
Holds a **Presets** group: the **default timing type** for each of Sleep / Nap / Food (§2.9),
persisted (localStorage, not event-sourced — a UI preference); defaults Sleep=budgeted,
Nap=unscheduled, Food=budgeted.
Holds the **Open-task cap (hours)** setting (2026-07-11): the `openExtentCap` from §3.9 —
how far an open/budget-less task fills the day before lower-rank tasks land after it. Number
field in hours (default 10); dispatches `SET_OPEN_CAP` (minutes) into the event-sourced state.
Holds the **Semi-tail floor (hours)** setting (2026-07-12): the `semiTailFloor` from §3.9.1 —
the minimum span an open semi-tail's claim can be compressed to before it slides (slideable) or
pins as an obstacle. Number field in hours (default 1); dispatches `SET_TAIL_FLOOR` (minutes),
same chrome and validation as the Open-task cap field.
Holds the **Timeline grid** setting (2026-07-12, persisted `gridGranularity`): the sub-hour ruler
graduation granularity — chips **Off / 5 / 10 / 15 / 30 min**, **default Off** — a display-only
preference (localStorage, not event-sourced, like Clock format).
Holds a **Dev sandbox** toggle (2026-07-11, persisted `devSandbox`): testing affordances
only, never a semantics change. When on, a **dev clock** appears in the topbar at **3/4 of
the topbar width** (left: 75%, right of the centered global clock; 2026-07-12 — this
supersedes the running card's ⏩ +5m/+15m
speed-up buttons, removed as redundant): same stacked date-over-time layout as the global
clock but rendered in the budgeted hue, showing **logical `now`** (the scheduler clock)
plus a locally-held seconds remainder — sub-minute ticks accumulate in the component and
dispatch a batch `TICK` only when a whole-minute boundary is crossed (domain time stays
integer minutes; the event log never sees seconds). Clicking the dev clock opens a small
popover (Esc/outside-click closes it — top-level panel per the back-navigation rule) with
two chip rows:
- **Tick** — one click advances dev `now` by that step: **10s · 15s · 30s · 1m · 5m ·
  10m · 15m · 30m · 60m**.
- **Run** — auto-advance at a dev-time-per-real-second rate: **10s/1s · 30s/1s · 1m/1s ·
  5m/1s · 10m/1s**. **With no rate selected the dev clock still runs at the default
  1s/1s** (real pace — it is never frozen); clicking a rate accelerates it, clicking the
  active rate again (or the Stop chip) returns to the 1s/1s default. Only one rate runs
  at a time, and toggling Dev sandbox off removes the clock entirely.
Because the timeline (blocks, ticks, now-seam), pipeline cards, and hero metric all render
from logical `now`, they follow the dev clock as soon as it is used — no separate display
plumbing. Real wall-clock ticks are no-ops until wall time catches up with the
fast-forwarded `now` (monotonic clock, R11), after which normal minute ticking resumes.
Holds the app-wide **clock format** (12h/24h) as its first setting, applied uniformly to the
global clock, timeline tick labels, and pipeline card times — a single source, not
per-component toggles. Also links out to the Heads & Sub-heads screen below. Extend this
panel as more settings are added.

**Heads & Sub-heads configuration — a full screen, not a modal:** reached via the Settings
panel's "Manage heads & sub-heads →" link. Replaces the timeline+pipeline area entirely
(no overlay/scrim, this is real navigation, not a dialog).

**Back-navigation is a stack, not a jump-to-root (rule — applies to every screen/panel, now
and future):** **Esc and the back (‹) affordance do the same thing — return ONE level, to the
screen you came from**, never straight to `main`/root and never closing everything. So the
config screen's Esc/back returns to **Settings** (its opener), since that's where it was
launched from. **Innermost first:** if a sub-panel is open on a screen (e.g. the config
screen's reassign panel), Esc closes *that* first; the next Esc goes back a level. Only a
**top-level** panel's Esc closes it outright (Settings→closed, TaskDrawer→closed). Every new
nested screen wires this from the start via the shared `useEscClose` hook, pointed at its
opener. Two forms, **sub-head first** (revised 2026-07-10 — this is the primary flow: a
sub-head name, a head field (pick existing, type a new one, or leave it to the ML
suggester), Add), then **"Add a head" second**, explicitly scoped to the one case the
sub-head form can't cover — a head with no sub-heads yet (adding a sub-head above creates
its head automatically, existing or freshly typed, so this second form is the exception,
not the main path). Plus a listing of the registry grouped by head. Each sub-head chip
carries a quiet **× delete**
(ink-faint, turns danger on hover). **Heads carry the same quiet × delete, except the
built-ins.** The §2.10/§2.10a built-ins appear here and are undeletable: the **plannable**
ones (`Self-Management`, `Sleep`, `Nap`, `Food`, `Meditation`, `Exercise`, `Socialization`,
`Learning` — each its own head, §2.9/§11.1b) show **no note**; the **system** ones
(`Wasted Time`, `Lost Hours`, `Off-Periods`) show a quiet one-line note in front —
"system head — logged, never planned" / "system head — auto-booked at day close" — since
their non-plannability is the thing worth surfacing. (`Main Work` is a convenience default
seed, not a built-in, so it CAN be deleted — **and a deletion sticks across reloads**: the
persisted-registry merge re-guarantees only the undeletable built-ins, never the `Main Work`
seed, so it does not silently reappear once the user has removed it. The full default seed set
is used only on a first run with nothing stored. Fixed 2026-07-16.) **Built-in heads sort first** in the registry
listing, marked by a very subtle dot (`docs/design-tokens.md` "built-in marker") — the
delete button's absence is the primary signal, the dot and any note secondary. The system
built-ins are **excluded from the drawer's planning pickers** (Sub-head / head fields); only
plannable heads and their sub-heads appear there.

**Deletion guard — a sub-head or head still referenced by any task cannot be deleted
outright (revised 2026-07-10, supersedes the earlier "always low-stakes, no-confirm"
rule):** clicking × checks real usage across **plan, running, and history** (not just the
registry list, so a registry already out of sync with actual references can't be gamed).
- **Unused** → deletes immediately, still no confirm dialog (genuinely low-stakes when
  nothing references it).
- **In use** → opens an inline **reassign panel** instead of deleting: pick a target
  sub-head (existing, via the same fuzzy dropdown, or a brand-new one — which then also
  needs its head chosen, exactly like the drawer's new-sub-head flow). Confirming
  bulk-reassigns every plan/running/history reference from the old (head, sub-head) pair
  to the new one (`REASSIGN_HEAD` event, `packages/core`, a pure label swap — headId/
  activityId never influence placement/timing, so no resettle is needed), *then* deletes
  the now-unused registry entry.
- **Deleting an entire in-use head** reassigns **every distinct sub-head actually used
  under it** (scanned from real task data, not the registry) to the *same* chosen target,
  then deletes the head.
- Sub-head chip and head delete-button tooltips say "In use by a task — deleting will ask
  you to reassign first" when applicable, so the guard is discoverable before clicking.

This is where the head/activity registry that the drawer's sub-head field reads from is
authored and grown.

**Filtered/highlighted dropdowns — the one combobox pattern, used everywhere a dropdown
appears** (drawer's Sub-head and New-sub-head's-head fields; this screen's head picker for
adding a sub-head): opens on focus, filters live via **subsequence ("literal letters, in
order") matching** — typed characters must appear in the candidate in the same order, not
necessarily contiguous (e.g. "te" matches "The Exercise" via the T and e of "The") — with
matched letters **bolded**, not colored. Arrow-key navigable; Enter selects the highlighted
option; Escape closes only the open list (never the parent drawer — stops propagation
before the drawer's own Escape-closes handler sees it) **and never clears what was typed**;
the field is **free text** (a brand-new sub-head is a valid value), so blurring never
auto-commits the highlighted option over it. Implementation: `fuzzy.ts`
(`fuzzyMatch`/`fuzzyScore`) for matching/bolding + downshift's `useCombobox` for the state
machine and ARIA, in `components/FuzzyDropdown.tsx`. The last two behaviors above are
downshift defaults *inverted* in its `stateReducer` — the law wins over the library (§7.0.4).

**Dropdown option labels — Capital Case, everywhere (2026-07-18).** Every `<option>` in every
dropdown (native `<select>` or otherwise) renders its label in **Capital Case** ("Budgeted",
"Semi-Head", "Week Plan") — never the raw lowercase id. The underlying VALUE stays untouched
(ids keep round-tripping); only the display label passes through `capitalCase` (`text.ts`).
This is a global UI law for all current and future dropdowns.

---
