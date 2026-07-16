# PART II — DATA MODEL

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
  - **BOOKING BUILT (Stage R8, 2026-07-16) — `useManagedTime`.** While a task is running, time
    with an editing/planning surface open (the task drawer, the SOD ceremony) reattributes
    `spent → managed` on close via `LOG_CHANNEL`. Measured on the APP clock (`state.now`), never
    `Date.now()`, so the dev-sandbox clock stays authoritative; `LOG_CHANNEL` clamps to `spent`
    (physics E3) so a long edit can never over-book. Effect: **editing no longer eats R's work
    budget** — its countdown stops consuming while your hands are in the app.
    With **nothing running there is no managed channel** (it is a channel OF the running task) —
    that time is simply unaccounted and becomes Lost Hours at the next SOD. No Self-Management
    occupancy is invented for it.
  - **ROLL-UP BUILT (2026-07-16).** Both `achievedByHead` roll-ups (core §5.1 and Analytics',
    incl. Analytics' weekly-quota achieved) are **channel-aware**: a task's head keeps
    `span − wasted − managed` (= `spent + breaks`), `wasted` → **Wasted Time**, `managed` →
    **Self-Management**. **`breaks` stay with the task's head** — §5.2 is explicit ("Quotas count
    the whole pomodoro task: 60m task = 60m to the head, breaks included") and breaks eat its
    budget. A partially-visible entry contributes its channels **pro rata**; the head takes the
    remainder, so the split always re-sums to the clipped span exactly (integer rounding can
    neither leak nor invent a minute). This necessarily moves §5.1 quota math — wasted/managed
    minutes no longer count as a head's achievement, which is precisely what the identity says.
    Guarded by `channel-rollup.test.ts`.
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

**Build model (Stage 2, settled 2026-07-15):**
- **Flat representation.** Composition is a single `parentId?` on a task; the plan stays one
  flat rank list. A task named by another's `parentId` is a **parent** — never placed on the
  spine; the settle-pass lays out only leaves, then derives the parent's placement as the
  **bracket `[min(leaf start), max(leaf end)]`**. Children rank contiguously just below their
  parent so the bracket is a contiguous group.
- **One atomic decomposition event: `SET_SUBTASKS { parentId, children }`.** Re-issuing
  replaces the whole prior decomposition (one direction, R5); empty `children` recomposes the
  parent into an ordinary leaf. Children need only a title — head/activity inherit the parent's,
  timing defaults to budgeted. A leaf's committed size is its budget (a Fixed leaf's is its
  anchor span).
- **Zero-sum is recursive.** A parent's budget is recomputed as Σ of its children bottom-up to
  a fixpoint (a child's own decomposition ripples up to the grandparent). During *execution* a
  started/completed leaf leaves the plan and a paused remainder shrinks, so the always-true
  invariant is `parent.budget ≥ Σ remaining children` (equality holds only for a pristine, un-run
  decomposition).
- **Running lifecycle.** START on a parent resolves to its first unstarted leaf; the leaf's
  ancestors are exempt from the mid-queue cancel-above sweep (§3.10) so the composition survives
  while the leaf runs. A running leaf carries its `parentId`; a paused remainder keeps it (stays a
  child). While a leaf runs, its ancestors remain **brackets even with no plan child** — a
  decomposed task never reverts to a schedulable task mid-execution. Completing the last leaf
  removes the parent bracket (and any now-childless ancestor); the parent writes **no history of
  its own** — each leaf's occupancy is the sole record (analytics split for free).
- **Views.** The pipeline renders a parent as a **bracket header** (↳, title, head, N subtasks,
  spanned window, Σ budget, Start-<pos> / Cancel-tree) with its leaves nested one level deeper;
  the timeline draws the bracket as a thin left-rail spanning the leaves and each leaf block
  shows its parent title + ordinal. The task drawer's **Subtasks** section lets a task be
  decomposed at creation (title + casual budget per leaf).
- **At least two subtasks.** Composition requires ≥2 leaves — one "subtask" is just the task
  itself. The drawer blocks Add on a single subtask (with a message) before creating anything.
- **Leaf ordinals & Start label (feedback 2026-07-15).** A parent stores `subtaskCount` at
  decomposition (display only). Because starting *or cancelling* a leaf keeps the remaining set a
  **suffix** of the numbering (starting cancels earlier siblings; cancelling decrements the count
  so survivors renumber contiguously), the next leaf's front ordinal `k = subtaskCount −
  remaining + 1`. Leaves are numbered by plain ordinal (**1, 2 …**); the parent's Start button
  names the exact leaf: **"first", "2nd", "3rd", … , "2nd last", "last"**.
- **Explicit "Composed" marker.** The parent card carries a **Composed** badge (distinct from the
  leaf-derived state pill) so composition is legible independent of state.
- **Lifecycle state pill (feedback 2026-07-15).** The card's state capsule is a **single word**,
  no category/substate split: **Planned** (was "Unstarted"), **Running**, **Overrun**, **Paused**.
  A **composed parent has no state of its own** — it shows the state of its **active leaf**: a
  running descendant → Running/Overrun; else a paused remainder among the leaves → Paused; else
  Planned. "Composed" is conveyed by the ↳ glyph + "N subtasks" badge, not a state.
- **Composed persists in the pipeline while running.** A running leaf's ancestors are classified
  as brackets in the pipeline too (not just the settle/invariants layer). While the *sole* leaf
  runs, the empty bracket is hidden (the running card in "Now" represents it); the instant a leaf
  returns to the plan — e.g. **pausing** the last running leaf — the parent reappears **composed**
  with the paused remainder nested under it.
- **Composition survives into the record (timeline rail).** Each leaf's history entry carries the
  composition link (`parentId` + `parentTitle` on `HistoryEntry`), so the timeline draws one
  **left-rail per parent spanning all its leaves across time** — completed/paused leaves in the
  record (above the seam), the running one, and still-planned ones below — persisting after the
  parent task object is gone. Past leaf blocks are tagged with their parent title. The rail is a
  *historical record* that those tasks were one composed task.
- **Subtask budget is a smart-input field (§1.6/§7.0.2 parity).** Every field that accepts a
  time/date/duration — including each subtask's budget — runs the same casual-parse → snap →
  reformat pipeline with universal snap-notify. This is a **law, not a per-field choice**: a new
  time/duration input inherits smart-input by default, never a raw parse.

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
- **Preset pills (task drawer).** Sleep and Nap (and Food, §2.10) are entered from a **preset
  pill row** directly under the timing-type chips — not a free-form flag. A pill pre-fills a
  bundle of fields, some **locked**, some **editable**:

  | Field | Sleep | Nap | Food | Locked? |
  |---|---|---|---|---|
  | Title | Sleep | Nap | Food | 🔒 for Sleep/Nap; ✏️ **editable for Food** (Lunch/Dinner/…) — ML auto-switch still applies |
  | Sub-head | Sleep | Nap | Food | 🔒 locked |
  | Head | Recharge | Recharge | Food | 🔒 locked |
  | `sleepKind` | `sleep` | `nap` | — | 🔒 (set by pill) |
  | `breakable` | off | off | off | 🔒 locked off (never split by the scheduler) |
  | timing type | **budgeted** | **unscheduled** | **budgeted** | ✏️ editable; **default configurable** in Settings |
  | `slideable` | on | on | on | ✏️ editable (default on — a slideable Sleep *rides* under pressure, G28, rather than being amputated) |
  | `ommf` | off | off | off | ✏️ editable (default off — a missed bedtime must slide, not perish; an OMMF nap is a legitimate choice) |

  - **Deselect restores.** Tapping the active pill again toggles it off and **restores the
    field values captured just before it was activated** (snapshot-on-activate) — no data loss
    from a stray tap.
  - **ML auto-switch.** A title matching a preset (the preset's keywords, exact or ML-similar)
    **auto-activates** that pill, tagged with the existing suggestion styling and one-click
    undo. **Intent wins (§7.0.1):** once the user has manually toggled any pill this drawer
    session, auto-switch stays silent.
  - Naps and Food are **mostly back-logged**, so their pills earn most of their keep in the
    gap-fill/back-log flow (§4.1), less in the planning drawer.

### 2.10 Built-in heads
All built-in heads are **real heads, undeletable**, and sort first in the registry. They split
into two kinds by whether the user may *plan* a task under them:

**Plannable built-ins** (schedulable like any head; **no** "system" note in the config):
- **Self-Management** — ceremonies, planning, in-app edit time.
- **Recharge** — sleep and rest. Sleep is a body-maintenance necessity, not a luxury or a
  waste; its head name says so. Ships with built-in sub-heads **Sleep** and **Nap** (§2.9).
- **Food** — eating. Sub-head **Food**.

**System built-ins** (never plannable; shown in the config as locked, with a one-line note):
- **Wasted Time** — *explicitly logged* waste (loggable in back-log/gap-fill — a one-tap fill
  type in the §4.1 GapFillModal alongside Activity/Sleep/Nap/Leave→Lost — never plannable;
  never in the drawer's planning pickers; at-most quota on it is an intended feature). Note:
  *"system head — logged, never planned."*
- **Lost Hours** — the gutter: *unaccounted* time, **system-booked at SOD** (§4.2); never
  user-selectable anywhere. Note: *"system head — auto-booked at day close."* **Booked (Stage 4):**
  the SOD event writes one Lost Hours **occupancy** entry per unaccounted span in the swept day
  (`headId = LOST_HOURS`, `taskId: null`), so a sealed `DayRecord` tiles fully and
  wall = accounted + lost is explicit history. Analytics **excludes** Lost Hours from "accounted"
  and reports it as the Lost figure.

- **Off-Periods** — where §4.5 off-period time books (illness, travel, abrupt breaks). An
  off-period is a real Inviolable running block on the spine; its occupancy accrues here. **Never
  plannable** as an ordinary task (started only via the off-period mechanism). Note: *"system head
  — booked by off-periods, never planned."* (Stage 5.)

(**Lost ≠ Wasted:** Lost = unlogged gutter; Wasted = user-declared waste.)

**Pattern — inevitable-necessity heads (binding for the future).** Sleep, Nap, Food and their
kin are **built-in, undeletable, AND plannable** — not optional, not left to user discretion,
because no productive routine exists without them. When a future category is a biological/
structural inevitability of a day (not a preference), it joins this class rather than being a
user-created head. This is distinct from the *system* built-ins (Wasted/Lost), which are
undeletable because the accounting model owns them, not because they're inevitable.

---
