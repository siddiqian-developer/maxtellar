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
