# PART III — SCHEDULER

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

### 3.9 Presumed extent — a real capped reservation — G22 (re-grilled & settled 2026-07-11)
A budget-less **open** task (unscheduled, or a semi-head/semi-tail with no budget) reserves a
**real capped extent**, not just MIN_FRAGMENT. *(This supersedes the earlier "display-only,
scheduler reserves MIN_FRAGMENT" reading — a 5-minute reservation let a later budgeted task
land right behind an open task and visually crush it to 5 min, which is wrong: the open task
is the one meant to fill the free time.)*
- **The reservation = up to `openExtentCap` (default 10 h; user-configurable in Settings,
  `SET_OPEN_CAP`), clamped by the next wall.** An open unscheduled task fills the current free
  slot up to the cap; lower-rank tasks are placed **after** it, not on top of it.
  Example (now = 2:00 PM, one unscheduled "Read", then a budgeted 30-min "Email"): Read fills
  2:00 PM → 12:00 AM (10 h cap), Email lands after at 12:00–12:30 AM. Read does not shrink.
- **Rank wins.** Layout is strict priority-rank order; timing type does not reorder. An open
  task ranked above a budgeted one sits first and pushes the budgeted after its capped extent
  (that is the meaning of "honor the drag").
- **Open tasks still yield to real WALLS.** The capped fill stops at the next fixed/semi
  anchored commitment, so a fixed meeting still shows at its time and the open task fills only
  up to it. A budget-less semi-head/semi-tail is itself a *soft* wall: its presumed side is
  clamped to the neighbouring wall so it never overlaps a real commitment.
- **Still forward-only / terminating (R10 preserved in spirit):** a finite capped reservation
  consumes space forward like any placement; it never induces backward motion. The cap keeps
  it bounded.
- **Labeled "open", never a number** — same never-disguise rule as the ML tags: a presumption
  must not read as data. Pipeline cards show "open" where a budget would sit; the block shows
  its capped span but is edge-styled as floating (§6), not as a committed duration.

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
