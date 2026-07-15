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
- **Overrun vs the task below — G28 (settled 2026-07-13):** overrun is just another *pressure
  from above* and reuses the **same slide mechanics as the tick** (one mechanic, never a bespoke
  overrun path). **`isSlideable = true` → the task below SLIDES later**, never consumed —
  **under ANY pressure front: bare `now` on a regular tick, a running task's span, or overrun
  (corrected 2026-07-13: slideable is never crushed; a slideable task's moment never silently
  passes — it rides until the user starts or cancels something).** An open semi-tail first
  deflates from its floating start down to its floor (§3.9.1), then rides **as a whole**
  (floor-span preserved); a budgeted semi-tail / slideable semi-head rides whole immediately
  (definite need, never compressed). **The ride IS a move (§3.2): the anchor coordinate moves
  with it, live, every tick** — the stored anchor always equals the placed edge, so the end is
  an **exact fact and reads upright** (never `~italic`; ~ is reserved for scheduler-presumed
  values, and a moved anchor is not a presumption). There is **no commit moment**: when the
  pressure stops (runner ends, or the user acts), the anchor simply rests where it moved — no
  re-balloon, no spring-back (no backward motion; the user may edit it back). Example
  (now = 7 PM, runner in overrun, slideable open semi-tail at floor 7–8 PM anchored 8 PM): each
  overrun minute pushes it 1 min later; runner ended at 8:40 PM → semi-tail 8:40–9:40 PM,
  anchor now 9:40 PM. **`isSlideable = false` (ANY task — fixed, floor-pinned, unslideable
  semi-tail, …) → overrun CONSUMES it completely**: progressive amputation as `now` advances
  through it; fully covered → one zero-occupancy **Skipped** history entry, **no remainder**
  (record-is-certain: never silently deleted, never resurrected — its moment passed under real
  time). No wrap, no frogleap: overrun is elapsed reality, not a plan-time contest, so G27's
  wrap/frogleap obstacle branch does **not** apply (generalizes §3.7's "running past a fixed
  task amputates it" and R4's floor-pinned amputation).
- **At the floor:** a **non-slideable** anchored/unscheduled task compressed to MIN_FRAGMENT
  under continued pressure behaves like fixed → **amputates in place** (R4). *(A slideable one
  never reaches this — it rides instead, G28.)*
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

### 3.9 Presumed extent — fair-share of contested free space — G22 (settled 2026-07-11)
A budget-less **open** task (unscheduled, or a semi-head/semi-tail with no budget) reserves a
**real capped extent**, not MIN_FRAGMENT *(a 5-min reservation let a later task land right
behind an open task and crush it to 5 min — wrong; the open task is the one meant to fill the
free time)*. **The size of that reservation is a *space-sharing* rule, NOT an ordering/priority
rule** — it decides only how much of the free time an open task grabs, calibrated to what (if
anything) is contending for that same region below it (= next in time). It never crowds out a
neighbour with a definite need, and shares fairly with equals.

**The law — an open task grabs its fair share of the free space below it:**
- **Nothing below → the full default (`openExtentCap`, 10 h; user-configurable, `SET_OPEN_CAP`).**
  Nobody's competing, so take it all. Example (now = 2 PM, one unscheduled "Read"): fills 2 PM →
  12 AM.
- **A FIRM task below (fixed / budgeted / semi-head — each has a definite space claim) → yield
  to a small slice (`CROWDED_CAP`, 2 h).** Example: unscheduled "Read" then a budgeted "Email"
  → Read keeps only 2 h (2 PM–4 PM), Email lands after; the rest of the day is left for the
  commitment.
- **Open peers below (another unscheduled, or a semi-tail — indefinite, equal claims) → split
  the space evenly.** Example: two unscheduled tasks, nothing else → each 5 h (10 h ÷ 2). A run
  of N consecutive open peers shares one cap, `⌊cap ÷ N⌋` each (cap = 10 h uncontested, else
  2 h).

**Not an ordering rule.** Which task is placed *first* is still decided by priority rank
(§3.11); this only sizes an open task's claim. **Firm vs open is the whole axis** — an open
task's greed is scaled to its neighbour's *need*, never to who outranks whom.

- **Open tasks still yield to real WALLS.** The fill is additionally clamped by the next
  fixed/semi anchored commitment, so a fixed meeting still shows at its time. A budget-less
  semi-head/semi-tail is itself a *soft* wall clamped to its neighbour so it never overlaps a
  real commitment.
- **Still forward-only / terminating:** a finite capped reservation consumes space forward like
  any placement; never backward motion.
- **Labeled "open", never a number** — same never-disguise rule as the ML tags. Pipeline cards
  show "open" where a budget would sit; the block shows its capped span, edge-styled as floating
  (§6), never as a committed duration.
- **Scope note (partial, 2026-07-11):** implemented for **unscheduled** subjects (the demonstrated
  cases: vs nothing / vs firm / split among unscheduled). Still TODO: a budget-less **semi-head**
  as *subject* uses the older soft-wall clamp, not yet the 10 h/2 h/split rule; and a **semi-tail**
  *below* is currently treated as firm (2 h) rather than an even split — its anchored-end geometry
  needs its own pass. (A **firm task contesting an open semi-tail's claim** is settled — G27.)

### 3.9.1 Semi-tail compression floor & slide-at-floor — G27 (settled 2026-07-12)
An **open semi-tail's** ballooned claim (start floats, end anchored) is **compressible from its
floating start side** when a **firm** new task (fixed / budgeted / semi-head) contests the space —
down to a **floor** (`semiTailFloor`, **1 h default; user-configurable, `SET_TAIL_FLOOR`**). The
anchored end never moves during compression. Everything else about §3.9 is unchanged — this only
adds the floor and what happens when it is reached:
- **Above the floor:** the contesting task takes the freed earlier space; the semi-tail keeps
  `max(floor, remaining)` ending at its anchor.
- **At the floor, `isSlideable = true` → the semi-tail SLIDES:** it moves later *as a whole*
  (anchored end yields, span stays at the floor), giving the contesting task **contiguous**
  space before it. The new task never wraps around a slideable semi-tail.
- **At the floor, `isSlideable = false` → firm obstacle, old business:** the pinned floor-span
  semi-tail is an obstacle and the existing motions apply unchanged — a breakable contester
  wraps itself around it; an unbreakable one frogleaps (§3.2/§3.3 discipline: the neighbor
  reshapes itself, never applies force).
- **A budgeted semi-tail is NOT compressed** — its budget is a definite need (the firm side of
  G22's firm-vs-open axis); the floor is the open semi-tail's "definite need" equivalent.
- **Open contesters don't trigger this** — an unscheduled/budget-less peer still goes through
  G22's fair-share split, not compression.
- Example (now = 2 PM, open semi-tail anchored to end 8 PM, ballooned 2 PM–8 PM, floor 1 h):
  budgeted 2 h task → semi-tail 4 PM–8 PM, task 2 PM–4 PM. Budgeted 7 h task → semi-tail
  compresses to its floor (7 PM–8 PM), 5 h freed is not enough → slideable: semi-tail slides to
  9 PM–10 PM, task takes 2 PM–9 PM whole; unslideable: task wraps 2 PM–7 PM + 8 PM–10 PM.

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
  - **An anchored END survives starting (2026-07-13):** starting a task with an anchored end
    (fixed OR semi-tail) runs a **countdown to that anchor** — `budget = anchorEnd − now`
    (≥ MIN_FRAGMENT; a late start runs the remainder; the anchor outranks a stored budget).
    Never a stopwatch that erases the end.
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
