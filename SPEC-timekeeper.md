# Time-Management App — Consolidated Specification v2.0

**Date:** 2026-07-08 · **Status:** Design complete (3 grilling sessions consolidated)
**Supersedes:** v1, `SPEC.md`, `features/*.feature` (early generic drafts — reference only)

> This is the single source of truth. Rule tags (G#, E#, R#) trace to the design-session log
> in the plan file. No code exists yet; this spec is the contract the build will follow.

---

## PART I — PHILOSOPHY & SOUL

### 1.1 What this is
A personal, highly opinionated time-management instrument. Not a to-do list — a **truthful
model of where your time actually goes**, built on sleep-anchored day cycles, weekly planning,
and a strict no-overlap timeline that bends in real time as life deviates from the plan.

### 1.2 Core metaphor
Organizing a messy, uncertain world. **The plan never goes according to plan** — so below
`now` the plan is provisional, soft, and constantly reflowing; above `now` the record is
certain and known. Time is a flowing river; `now` is the knife-edge where uncertain plan
crystallizes into certain history. The app dramatizes that crossing.
- **The past is editable but can never "push" `now`.** History is not frozen — the user may
  correct it (reality-check edits) — but no edit to the past may ever move `now` or place a
  task's end beyond `now`. `now` is a one-way wall the past cannot cross.

### 1.3 Non-negotiable principles
- **Strict no-overlap** — the one inviolable law (precisely, an *occupancy* law, §5.1).
- **Hyper-realism** — 100% completion is rare; leftovers are normal, not failure.
- **Nothing auto-starts; nothing is assumed** — the app records what the human *declares*
  (one principled exception: it may auto-log its *own* observed usage, §E2).
- **The app never says "no"** — it relocates, proposes, snaps-to-legal, and asks; it never
  refuses a human action.
- **The week is the most central time period** — nothing carries beyond it.
- **No regard for calendar days** internally — the unit is the sleep-to-sleep cycle. Calendar
  dates exist only for reports and collaboration.
- **Strictness IS the product** — the model never bends to be liked; the UI reduces friction,
  the laws do not.
- **Multitasking is bad, but still allowed** — the single-lane model discourages concurrency
  (and MVP forbids it structurally), yet the philosophy *names* multitasking as a negative
  rather than pretending it doesn't happen. The future multilane model exists to *measure* it
  honestly, not to bless it.
- **Maximal editability (gsheets DNA).** The author's 8-year Google-Sheets practice worked
  because *everything* was editable. This app preserves that freedom: **make as much editable
  as possible** — fields, flags, past history, types. The known risk (a spreadsheet lets you
  corrupt it) is contained NOT by locking things down but by a **validation-and-snap layer**:
  edits are accepted freely, then snapped to the nearest legal value (E3) or blocked only when
  truly contradictory (§2.5). Freedom first; guardrails as physics, not as permission walls.

### 1.4 Design soul (drives every UI decision)
- **Audience:** the author first, a public product later — architect with future users in mind.
- **Success — the real "why":** the author is self-employed, juggling projects across
  **immediate / short / medium / long-term** horizons. The core problem is **time-budgeting
  each project** during weekly planning, with the freedom to **drift** from the budget in
  practice while **logging everything for analysis**. This app is intended as the author's
  **lifelong master orchestration tool** — for work *and* life — seamlessly absorbing even a
  future job's tasks. It replaces (and supersedes) an 8-year-old Google Sheets system (see
  §6.x Analytics — that sheet is the ground-truth reference for the analytics model).
- **Emotional posture: neutral mirror** — calm, non-judgmental truth; never praises or scolds.
- **Home = the present** (the now-seam): open → what's running, what's next.
- **Hero metric: Time Accounted vs Unaccounted.**
- **Density: spacious & focused** — one thing at a time; depth via navigation, not cramming.

### 1.5 Visual language
- **Inspiration:** Claude's own theme — warm ivory/cream, charcoal text, a single terracotta
  accent reserved for *living* elements (now-seam, running task, primary action).
- **Bar:** very premium, subtle, clean, professional, sharp, work-focused (Linear × Things 3 ×
  Claude's warmth). Hairline borders over shadows; strict type scale; **tabular-lining
  numerals** for all times/durations; minimal corner radius; quiet, composed empty states.
- **Seam duality (strong):** below `now` = lighter, softer, dashed/provisional, gently
  reflowing; above `now` = solid, settled, frozen. The now-seam is the signature moment.
- **Motion: pervasive fluidity, meaningful not decorative.** Reflow is *gently witnessed* —
  cards ease to new positions so the user sees the plan bending under reality. Invest most in
  three signature moments: reflow easing, the now-seam crossing, task start/complete.

---

## PART II — DATA MODEL

### 2.1 Core vocabulary
| Term | Meaning |
|---|---|
| **Spine** | The single non-overlapping timeline of everything (past + future) |
| **`now`** | The live edge; a hard membrane — history above, plan below |
| **Head** | Flat category (e.g. Sports); quotas attach here |
| **Activity** | Reusable identity under exactly one head (e.g. Cycling) |
| **Task** | An instance on the spine, belonging to one activity |
| **Subtask** | User decomposition of a task (recursive) |
| **Segment** | System-made split of a task (wrap part, paused remainder, skipped head) |
| **Rider** | Background task anchored to a primary (podcast-while-cycling) |
| **Gap** | Inert empty-time placeholder; consumed by `now`/overrun or user drag |
| **Budget** | A task's planned duration — an estimate, expected to under/overrun |
| **Leading task** | Topmost unstarted task |
| **Slide / Wrap / Frogleap / Amputation** | The four scheduler motions (§5) |
| **Sleep / Nap** | Main day-defining sleep vs any other sleep; both are tasks |
| **ommf** | "Once missed, missed forever" — on-miss property |

### 2.2 Four distinct parent-child mechanisms (never conflate) — G26
1. **Categorization:** Head → Activity (heads FLAT in MVP; activity in exactly one head).
2. **Composition:** Task → Subtask → … (recursive; unlimited in schema, UI ~3 levels MVP).
3. **Segmentation:** Task → parts/remainders (system-only: wrap, pause, amputation).
4. **Riders:** anchored background tasks (schema provision in MVP; lane 2 hidden).

### 2.3 Timing types — G-types
For any task `budget = end − start` ⇒ you can know **0, 1, or all 3** of {start, end, budget}
(never exactly 2). Type = which you know:

| Known | Type | Motion |
|---|---|---|
| all three | **Fixed** | Immovable by any task; only `now` amputates it |
| start only | **Semi-scheduled (head-anchored)** | Start anchored; tail floats |
| end only | **Semi-scheduled (tail-anchored)** | Tail anchored; shifts whole, then compresses |
| budget only | **Budgeted** | Slides freely; the only breakable type |
| none | **Unscheduled** | Free; floats; presumed extent for display only |

A task with only a start OR only an end is a valid **"one-sided balloon"** (semi-scheduled).

### 2.4 Lifecycle states
- **Unstarted** (the four schedulable types) → once started:
- **Running** (sub-state **Overrun**) / **Paused** / **Completed** / **Skipped** / **Cancelled**.
  ("Completed" is the chosen word, not "Finished" — E-naming.)
- **Proposed vs Committed (G4):** during entry/injection a task is a *proposal* — the scheduler
  may place it anywhere legal. Once committed it freezes under §5 laws.

### 2.5 Behavior flags (computed after creation, but editable — E)
- `isSlideable`, `isBreakable`, `OMMF`.
- **`OMMF = true → isBreakable = false`, permanently.** A non-ommf task *may* still be
  unbreakable (a meeting you can attend late but not split). `isBreakable` is both settable and
  derived, with validation.
- Flags derive from type + edges; **editing a flag can migrate the type** (§3.6). Three
  transition classes: (1) drop-properties → silent; (2) inferable → infer + snap; (3) needs
  explicit values → open full edit UI.
- **VALIDITY MATRIX (resolved).** Flags are **stored and editable** (per the maximal-editability
  principle), guarded by a **`isValid(type, state, flags)` validation function** invoked on every
  write — contradictions are snapped or blocked, never persisted. Confirmed-invalid combinations:
  Fixed + isSlideable=true; Budgeted + isSlideable=false; non-Budgeted + isBreakable=true;
  OMMF=true + isBreakable=true. **Types are Unstarted-only** — once a task starts (Running/
  Paused/Completed/Skipped/Cancelled) it carries no timing type; the 4 types describe only how an
  *unstarted* task wants to be placed. This collapses the matrix to {4 types × flags} for
  unstarted, and {flags only} for started. (Full enumerated table to be produced at build time
  as the validation function's spec.)

### 2.6 The accounting identity (running & done tasks) — E1/E2/E3
```
wall-clock (now − start, or end − start when done)
   = spent(work) + wasted(per-task) + managed(in-app edit time) + breaks(pomodoro)
budget            = end − start − wasted        (for fixed/known)
end               = start + budget + wasted     ⇒ WASTED PUSHES END LATER (E1)
remaining         = budget − spent              (clamped ≥ 0 in overrun)
```
- **Per-task wasted** rolls up into the **Wasted Time** head. Exists only for running/done
  tasks, never planned ones.
- **Managed** (minutes the user's hands were literally in the app editing/planning) is credited
  to the **Self-Management** head — the one sanctioned auto-log (the app observed it directly).
  It is an **internal ledger channel of the running task: R is NEVER split** (stays one
  continuous card) — the managed minutes are simply attributed to Self-Management in the 24h
  ledger, not counted as R's work. (Same mechanism as pomodoro break/modal time.)
- **Channel set LOCKED (post sheet-study, §9.2):** `wall = spent + wasted + managed + breaks`
  is the complete task-level partition. The sheet's other buckets (Exclusion, Rest, Sleepless-
  Bedtime, Meditation, …) are heads/activities — day-level, handled by the spine — not task
  channels.
- **Physics-of-time snapping (E3):** any user value violating temporal arithmetic snaps to the
  nearest legal value with a warning (never rejected). Manual `spent` edits clamp to
  `[0, now − start]`; natural overrun exceeds budget freely.

### 2.7 Subtasks (composition) — G24
- **Leaves occupy the spine; the parent is a bracket** spanning its children. Scheduler laws
  apply per-leaf. Start parent = start first leaf; completing the last leaf completes ancestors.
- A child may be **Fixed inside a Budgeted parent** (parent's slideability is constrained by
  its most-anchored descendant).
- **Zero-sum budgets: Parent budget = Σ(children), always.** Once decomposed, the parent budget
  is derived; adding/editing/removing a child rebalances it (one transaction, one direction —
  R5). Decomposition is therefore also a scheduling event.
- A subtask may carry its **own head** (e.g. "travel" → Transport); **analytics attribute each
  leaf's time to the leaf's own head** — one composed task can split across heads. Default:
  inherit the parent's head.

### 2.8 Riders (provision only in MVP) — G9
- A rider is a full task softly bound to a primary; placement derived from the primary; moves/
  deletes with it; own budget allowed.
- **Spill policy** per rider: `dismount` (tail → normal lane-0 budgeted task) | `re-anchor`
  (attach to next primary; fallback dismount).
- MVP: schema + hidden lane 2; no rider UI.

### 2.9 Sleep model — G14
- **Sleep** (main, day-defining) and **Nap** (any other) are ordinary tasks — **explicit type
  at logging, never inferred**; mostly back-logged, occasionally planned. A 20-min Sleep and a
  6-hour Nap are both legal.
- Wearable provision: sleep/wake from a pluggable source (`manual` | `wearable`); detected
  sleep only ever *proposes* (never auto-commits).

### 2.10 Built-in heads
- **Self-Management** — ceremonies, planning, in-app edit time.
- **Wasted Time** — *explicitly logged* waste (loggable, never plannable; at-most quota on it
  is an intended feature).
- **Lost Hours** — the gutter: *unaccounted* time, system-booked at SOD.
- Real heads with sub-activities; undeletable. (**Lost ≠ Wasted:** Lost = unlogged gutter;
  Wasted = user-declared waste.)

---

## PART III — SCHEDULER

### 3.1 No-overlap (the inviolable law) — G7/§5.1
At most one task **occupies** any instant (per lane; MVP = one lane). Skipped segments occupy
**zero minutes** (markers that plan-time went elsewhere). Enforced in **past and future
alike** — even back-logged history is a reconciled non-overlapping timeline; genuine
concurrency must be serialized (model over mess).

### 3.2 The four motions — G2/G3
- **Slide** — a neighbor pushes a task along the timeline (= moving it).
- **Wrap-around** — a *breakable* (budgeted) neighbor splits **itself** around an obstacle.
  (Future: wrap-split parts can **rejoin** back into one task when the obstacle clears.)
- **Frogleap** — an *unbreakable* neighbor jumps **itself** wholesale over an obstacle.
- **Amputation** — `now` consumes a task's elapsed head into a Skipped segment. *Amputation is
  not moving.*

### 3.3 Fixed-task invariant — G3
A committed fixed task's coordinates are immutable. **A neighbor may only reshape/relocate
itself** (wrap, frogleap); it may never apply force to a fixed task. Only `now` amputates it.
Slogan: *"No task may displace a fixed task, but `now` may amputate its past."*
(The **user** may still directly edit a fixed/ommf task — human outranks scheduler; §3.6.)

### 3.4 Objective = signal hierarchy — G1
The scheduler realizes user intent; it never compresses-to-fit or reorders to optimize.
1. **Explicit time coordinate** (fixed times / semi-scheduled anchored edge) — strongest;
   defines order absolutely.
2. **List position** (LexoRank) — governs order only among tasks with no time of their own.

### 3.5 Placement of proposals (entry & injection) — G5
1. Candidate slots must lie in the future (`slot.start ≥ now`).
2. Place at the nearest slot **preserving the order implied by the requested time** vs the
   obstacle's start: requested-after → push forward; requested-before → push backward (never
   across `now`).
3. "Start right now" conflicts → user picks **[Override]** or **[See conflicts]**.

### 3.6 Editing & field calculation — E/§3.6
- **Creation/edit calculation table** (same theme for both):
  | User sets | If… | Then |
  |---|---|---|
  | Budget | no start/end | set budget |
  | Budget | start present | recalc end |
  | Start | budget missing | leave budget/end blank (one-sided balloon) |
  | Start | budget present | recalc end |
  | End | budget missing, start missing | **tail-anchored semi-scheduled** (one-sided balloon) |
  | End | budget present | recalc start |
  | End | budget missing, start present | recalc budget |
- **All-three-present, user edits one field** (deterministic, not "oldest recalculates"):
  edit **Start → End changes**; edit **Budget → End changes**; edit **End → Budget changes**.
  (Start and Budget are the retained anchors; End is the derived value under edits.)
- **User edit is sacred:** the user may edit fixed and ommf tasks directly; edits can migrate
  type live (the entry card's type chip morphs while typing).
- **Editing done history:** allowed as a reality-check, via the history editor; ripple stays
  within history; **hard wall: the last done task's end ≤ now, never beyond.** Impossible edits
  snap (E3).
- **Editing a running task:** extend budget mid-run OK; moving its start → history editor;
  `spent` editable within physics limits.

### 3.7 Tick mechanics (every minute) — G10/G11
- Leading task start > now → nothing happens.
- **Nothing ever auto-starts.** A fixed task reached by `now` amputates its head into Skipped;
  the remainder awaits an explicit Start.
- **Budgeted leading task** slides while the task below is gap/tail-anchored/unscheduled/
  budgeted. Against a fixed obstacle: **squeeze up to MIN_FRAGMENT−1 min, then wrap** — split
  part-1/part-2 around the obstacle; per tick part-1 −1 / part-2 +1 (total conserved); when
  part-1 would fall below MIN_FRAGMENT it vanishes (residue → gap) and the task reunifies
  beyond the obstacle.
- **Overrun:** a Running task past budget keeps occupying and squeezes/wraps everything below,
  live; running past a fixed task amputates it (zero-occupancy) — legal per §3.1.
- **At the floor:** an anchored/unscheduled task compressed to MIN_FRAGMENT under continued
  pressure behaves like fixed → **amputates in place** (R4).
- **MIN_FRAGMENT:** global setting, default **5 min**, **settable in Settings**. **No task's
  budget — nor any fragment — may ever be below MIN_FRAGMENT.** All checks, validations, and
  physics-snaps enforce this floor at creation, edit, split, and compression. (Per-task
  override lives in the schema; no MVP UI.)
- **Frogleap:** unbreakable + can't wrap → jump whole to the far side.

### 3.8 Gaps — §5.7 (corrected, R1)
Gaps are **inert**: they never move or jump over tasks; they are consumed only by `now`/overrun
or by explicit user drag. **User-creatable** as deliberate buffers. *(The v1 "budgeted absorbs
adjacent gaps equally" rule is deleted — it was the only backward-motion rule and broke
termination.)*

### 3.9 Presumed extent (display only) — G22
A floating tail / unscheduled task is drawn to the **remaining nominal day** (24h cycle
assumption, §3.11). **Never** a runtime clamp; the scheduler never reads it (render-only, R10).

### 3.10 Pause — G23/G25
Pause splits: occupied part → history segment; unspent budget → a **budgeted "remainder"** in
the unstarted chunk, inheriting the parent's priority rank. Analytics see one identity.
- **ommf remainders cannot shift** — a new runner amputates them in place; past their end they
  cease (no glide).
- Idle time after a pause → **Lost Hours** unless back-logged.
- **One-tap "pause X, start Y"** shortcut exists. The running task is always snapped to `now`,
  above all undone tasks.
- **Starting rules (locked from sheet study):**
  - **Start-over-running default = PAUSE the running task** (remainder survives, resumable);
    ending it instead stays one tap away. (Gentler than the sheet's SOFT_TERMINATE.)
  - **Starting a mid-queue task CANCELS all unstarted tasks above it** (sheet behavior kept —
    8-yr muscle memory): they become Cancelled (strikethrough), moving to the history chunk, so
    the two-chunk invariant holds. Deliberate skip-over = a decision that those tasks' moment
    has passed.

### 3.11 Priority — E4
**LexoRank + tiers.** A hidden fractional/lexicographic rank *is* the stored priority
(drag-to-reorder computes a between-key; infinite insert-between; no visible numbers). Plus 3
displacement tiers: **Normal < Protected (fixed) < Inviolable (Sleep, Off-periods)** — tiers
break only the ties the timing-type laws don't already decide. (1–100 rejected: double-governs
and invites per-task micro-decisions.)

### 3.12 Editing/injection architecture — THE FORK — E5
The legacy died from live-ticking (gliding) and editing mutating one list concurrently.
**Fix = fork:**
- **Fork on mutate:** any edit OR injection snapshots the live list into a **sandbox**; only
  the sandbox is mutated.
- **Live keeps ticking in the background** (wall clock never stops; running task stays visible),
  but the **sandbox's `now` is locked** at the fork instant for scheduling math — gaps can't
  glide under the user's hands.
- **The settle-pass runs inside the sandbox** (§3.13). New tasks created during the session
  join the sandbox batch.
- **Commit = re-settle at REAL `now`, then atomic swap.** Discard the frozen `now`, re-run the
  settle-pass at the advanced real `now`, apply as one batch. Tasks that became past during the
  edit amputate naturally (G18). **Live wins:** the running task's real elapsed is ground truth;
  the edited unstarted chunk re-settles *below* the running task's real position — edits never
  rewrite live elapsed (record-is-certain). **Cancel = discard sandbox** (zero corruption).
- **Place-and-notify:** commit always lands nearest-legal; the diff is informational, never a
  blocking confirm.
- **Cancel OR any error → discard sandbox (zero corruption).** Any exception mid-edit throws the
  sandbox away; the live list was never touched, so a bug can never corrupt real state.
  **This is React's DOM-diffing pattern applied to scheduling:** mutate a cheap virtual copy,
  reconcile/commit atomically, and on any failure drop the copy — the "real DOM" (live spine)
  only ever receives validated, complete batches. Elegant and robust.
- Maps the user's state machine: {New Task, Injection, Live Ticking, Progress, Editing} are all
  **events** → one **Scheduling** step → Updated List. The Temp-List instinct was right; it only
  needed to be *frozen*.

### 3.13 The unified settle-pass (injection = this, not a bespoke algorithm)
`settle(unstartedSet, now) → laid-out unstarted chunk`. **One function** serves tick,
edit-commit, and injection.
1. **Pin anchors** — fixed coords + semi-scheduled anchored edges take explicit positions.
2. **Fill budgeted/unscheduled by LexoRank priority** into inter-anchor space; on collision →
   wrap (breakable) or frogleap (unbreakable).
3. Pack no-overlap, forward-only, `slot.start ≥ now`.
- **Injection = add weekly proposals to the unstarted set, then settle** — on a frozen sandbox
  at SOD (ticks queue behind; atomic). Injected task partly past → amputate head at birth
  (G18); fully past → perish (fixed/ommf) or quota-shortfall (budgeted).
- **Ripple is strictly downward** (forward-only lemma — the termination guarantee).
- *Default:* injected weekly budgeted tasks rank below surviving pruned leftovers; user drags
  to re-rank.

---

## PART IV — DAY, WEEK & CEREMONIES

### 4.1 Two-chunk structure & the day boundary — G6/G14
- **Two-chunk invariant:** history above `now`, plan below — obeying different laws (history
  append-only, scheduler-immune; plan is the scheduler's domain).
- **Day = Sleep-start → Sleep-start, by construction.** The live tasklist **always begins with
  a Finished Sleep** (the day's head). Days may run 30–100+ hours (no sleep, no new day).
- **Back-logging:** past tasks born directly into history; time after last SOD editable in the
  main view, earlier via the history editor; no-overlap enforced throughout.

### 4.2 SOD — the commit ceremony (state machine) — G13/G15
Precondition: **exactly two Finished Sleep items, topmost = Sleep A.** If missing → the
missing-data ceremony ("unaccounted time between X and Y — what happened?"; Sleep is a fill
type; same flow as the >30-min-gap modal).
1. **Press SOD** → sweep archives **[Sleep A … Sleep B)** — that span is the old day; B becomes
   the new topmost (invariant restored). Occupancy history only; **unstarted leftovers survive**.
2. **Under Pruning** state → discard dead leftovers, trim accumulated quotas → **[Pruning Done]**.
3. **Auto-inject** today's weekly-plan tasks (settle-pass on the frozen list).
4. **Planning Today** state → add ad-hoc tasks → **[Planning Done]**.
5. **Live.** Tracking = explicit Start taps.
- Report date = calendar day SOD was pressed. Gaps > 30 min → missing-data modal. Unaccounted
  residue → Lost Hours.

### 4.3 EOD — ritual only — G12
User-activated, never automatic; processes nothing; work after EOD is legal. If a task is
Running → modal **[Complete] / [Pause] / [Keep working]**. Real rollover is the next SOD.
- **EOD pre-computation (optimization):** activating EOD may pre-compute the day's temporary
  aggregates/report structures. If the user then sticks to plan until the next SOD, that cached
  work serves as already-calculated data, saving computation at SOD. (Invalidated if the day
  changes materially after EOD.)

### 4.4 Weekly planning — weekend tail only — G19
- Runs on OFF day(s) (setting; default Sunday; ≥1 OFF day; seamlessly overrideable). If slept
  through, runs *inside* the first weekday (time → Self-Management).
- Back-logs when the weekend started; declares the **First Weekday** of the week ahead.
- **Mid-week structural re-planning is strictly forbidden** (the week is a commitment). Daily
  tactical reflow (§3.7) is automatic — a different altitude.
- Week-view screen (Google-Calendar-week-inspired); recurrence per task: specific weekdays
  (Tue/Thu), daily shortcut, weekend toggle, one-time or ranged.
- **"Start New Week" button** — explicit week rollover. Three realities accepted:
  1. **Planned week** → start with the plan (ideal).
  2. **No plan at rollover** → the week can still be started **without weekly planning**
     (reality: planning often slips to the first working day). Planning can be done later,
     inside the first weekday (time → Self-Management).
  3. **A whole week with no weekly planning at all** → the app does **best-effort**: no injected
     quota structure, ad-hoc daily tasks only, analytics still track achieved hours against
     whatever quotas persist from prior weeks (or none). Degrade gracefully, never block.

### 4.5 Off-periods (abrupt, mid-week) — G-off
- **Real tasks on the spine** (Inviolable tier), UX-distinct from ordinary tasks. Known end →
  fixed block; unknown end → head-anchored running block.
- On initiation: app asks known/unknown end, and offers a **displaced-tasks flow reusing the
  pruning UI** (perish / carry / push).
- Ceremonies auto-suspend while off (they're user-performed; no SOD = suspended).
- **Weekend OFF day ≠ abrupt off-period:** resumption from a weekend expects weekly planning
  (a hidden urgent bypass exists). Off-periods are pausable and OMMF-capable.

---

## PART V — QUOTAS, POMODORO, ALARMS

### 5.1 Weekly quotas (budgeted recurring) — G17
- **Minimum weekly hours per head**, distributed across weekdays.
- Types: **at-least** (more is better) · **at-most** (ceiling; *track, warn, report — never
  block*) · **neutral**.
- Shortfall **redistributes over remaining days of the same week** — weighted by availability
  first (nominal 24h − planned occupancy), then original shape if availability is equal.
- Monster accumulations trimmed by the user during Pruning; **after trim, the deficit stays
  visible on every such item**.
- **Hard boundary: nothing carries beyond the week.** Unfulfilled quota dies at week's end
  (reported as shortfall).

### 5.2 Pomodoro (per running task) — G-pomo
- **Modal-driven, zero automation (G11-pure).** Work interval ends → modal **[Take break] /
  [Keep working: +5 / +10 / +15 / +1 pomodoro]** → cycle repeats. Break end is symmetric: alarm
  + modal **[Resume work] / [Extend break +5/+10/+15]**.
- **Accounting:** breaks **eat budget** (a pomodoro task's budget = work + sanctioned breaks).
  Modal-decision minutes → **Self-Management**. Post-break idle (never resumed) → **per-task
  wasted** (end pushes later, unbounded — the honest mirror; app never auto-pauses).
- **Quotas count the whole pomodoro task** (60m task = 60m to the head, breaks included).
- Phases (work/break) are **internal ledger channels of the running task**, not spine segments.
- **Config:** global presets (25/5×4+15, 50/10, …) + per-task override at Start.

### 5.3 Alarms
- **Ship best-effort in MVP:** in-app sound + system notifications where the installed PWA
  allows; documented honestly (the mobile app later makes them reliable).
- Events: fixed-start approaching, leading-start arrived, overrun, at-most-quota warning,
  pomodoro transitions, SOD reminder.

---

## PART VI — VIEWS

One spine, multiple projections.
1. **Active timeline (MAIN):** Google-Calendar day view; **pinned now-seam** (~35% height, day
   flows upward through it); left time axis; box heights ∝ duration; ticks every minute; strong
   seam duality; gently-witnessed reflow. Gaps = hatched empty space. Overrun = box tail past a
   budget mark.
2. **Pipeline:** Running + unstarted only; uniform cards; gaps as subtle spacing; a **control
   surface** (Start/Pause/Cancel sync to timeline unconditionally; scroll-sync only when
   co-displayed). Desktop shows timeline + pipeline side-by-side; mobile uses bottom tabs.
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
   - **Sheet mapping (reference):** sheet "heads" (Main Work, Self-Management, Health, Job,
     Core Work, Self-Learning, Kitchen Work, Sleep, Rest, Meditation, …, Time-Wasted subtree)
     → app **Heads**; sheet per-day columns → app **days (sleep-cycles)**; sheet Budgeting
     block → app **quotas** (§5.1); sheet Aggregates (Sleeping/Waking/Work/Productive/Wasted/
     Lost) → app **built-in aggregate rows**. The sheet's Wasted subtree (WhatsApp/YouTube/
     Sleepless-Bedtime/…) confirms **Wasted Time** needs user-defined sub-activities.
4. **History:** exact as-happened flow; history editor for pre-SOD edits (no-overlap enforced;
   end ≤ now wall). Cloud-offload provision (e.g. Drive) for unbounded growth.

**Task entry:** FAB → four-field drawer (Title / Start / End / Budget + head), live type-morph
chip, inline physics-snapping, `[Start now ⚡]`. Title accepts deterministic shorthand tokens
("1h30", "@18:00", "15:50-16:20", "#head") parsed by a plain grammar. **No AI/LLM anywhere —
100% local & offline.**

**Time formats:**
- Timeline/history → absolute times; pipeline cards → durations (absolute only on anchored
  edges); analytics → durations. 24h default; 12h setting.
- **Durations:** `MM:WW:DD:HH:MM`, with MM/WW/DD shown only when non-zero (90m → `01:30`;
  8d 2h → `01:01:02:00`).
- **Absolute dates:** current calendar date shows **no date label (not even "Today")** — bare
  time; previous → "yesterday"/exact; next → "tomorrow"/exact; farther → exact date.

---

## PART VII — ENGINEERING

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

## PART VIII — MVP BOUNDARY

**In:** single lane; flat heads/activities; all 5 timing types; subtasks; full scheduler +
fork + settle-pass; SOD/EOD/weekly ceremonies; quotas; pomodoro; best-effort alarms; timeline +
pipeline + analytics + history; back-logging & pruning; off-periods; the premium Claude-themed
UI. Schema *provisions* for riders, multilane, wearable, cloud, per-task MIN_FRAGMENT.

**Dogfood bar: whole system or nothing** — adoption begins only when weekly planning, injection,
and quotas all work. (Build is incremental; there is no "usable early slice" milestone.)

**Out (provisioned):** visible multilane; rider UI; wearable integration; cloud sync;
collaboration/calendar interop; per-task MIN_FRAGMENT UI; onboarding for external users.

---

## PART IX — LEGACY SYSTEM FINDINGS (the 8-yr Sheet + AppScript, studied 2026-07-08)

The author's Google-Sheets system ("Runtime Tasklist" + weekly budgeting sheet + AppScript) is
the proven ancestor. Findings, mapped:

### 9.1 What the AppScript CONFIRMS (already independently specced — strong validation)
- **Sliding wall** (`ripplePlannedTasks`): a planning task anchors to the previous task's end,
  but `now` pushes past it → **our slide/settle-pass (§3.13), verbatim.**
- **"Sacred floor"** (`handleTaskStartEdit`): start = max(now, prevEnd, requested) → **G5
  future-only + no-overlap.** (The word "sacred" is the author's own.)
- **Physics snapping**: budget < spent → snap to spent; spent clamped to [0, now−start] → **E3
  exactly.**
- **Edit semantics**: Budget→End recalcs; End→Budget recalcs; resume → end = now + remaining
  (pause gap absorbed) → **§3.6 and the E1 end-pushes-later pivot, exactly.**
- **Delta-based timer** (`updateTimers`: spent += now − refTimestamp) → validates **R11 batch
  catch-up** (robust to missed ticks by construction).
- **close_day()** = manual destructive reset → our **SOD sweep**, but ours archives instead of
  destroying (improvement retained).
- **Quota redistribution divisor** (`Settings!B2`, `remaining/(7−B2)`) = equal split over
  remaining days → our §5.1 availability-weighted rule is a superset (equal split is its
  degenerate case when availability is uniform).

### 9.2 What the AppScript ADDS to the spec (adopted)
- **Two timer modes for Running tasks (adopt, name in UI):**
  - **Countdown** — budget known: `remaining` ticks down; end = now + remaining.
  - **Stopwatch** — no budget: `spent` ticks up; end stays open (head-anchored running).
- **Two-stage completion gesture** (Done-toggle cycle white→red→green): first tap ends the task
  *now* without classifying (sheet: red / SOFT_TERMINATED), second confirms full completion
  (green). Maps to our states: red ≈ Skipped/Cancelled-pending-classification, green =
  Completed. **Adopt as UX**: one tap ends, classification can follow — never block the flow.
- **Day-level accounting identity (from the weekly sheet), locking the analytics rows:**
  `24h = Sleeping + Waking`; `Waking = Work + OTW-Productive + Wasted + Lost`. The sheet's
  `Exclusion` row (awake time inside the sleep window) needs no special channel in the app —
  back-logged tasks inside the night handle it naturally on the spine.
- **Task-level channel set — now LOCKED (sheet adds no further task channels):**
  `wall = spent + wasted + managed + breaks`. Sheet rows like Rest/Meditation/Sleepless-Bedtime
  are **heads/activities** (day-level buckets), not task channels.

### 9.3 What the app deliberately does DIFFERENTLY (improvements over the sheet)
- Sheet **auto-SOFT-TERMINATES** every other active task when one starts; app default is the
  gentler **pause-and-start** (recoverable remainder) — see open question §X.2.
- Sheet **CANCELS all planned tasks above** a newly-started row (strikethrough); app has real
  re-ranking machinery — see open question §X.1.
- Sheet's close_day destroys; app's SOD archives (event log is append-only).
- Sheet needs manual `Settings!B2` weekday updates; app derives remaining days structurally.

## PART X — RESIDUAL OPEN ITEMS (safe to settle during build)
- Exact single-tick op order when many events coincide (R3 gives the frame; edge sequencing
  finalizes in code).
- Frogleap trigger details for unbreakable non-budgeted types (rare).
- Whether the missing-data ceremony fully merges with the >30-min-gap modal in UI (assumed yes).
- Default pomodoro preset shipped.
- Injected-leftover relative priority default (assumed: injected ranks below leftovers).
