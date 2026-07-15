# PART IV — DAY, WEEK & CEREMONIES

### 4.1 Two-chunk structure & the day boundary — G6/G14
- **Two-chunk invariant:** history above `now`, plan below — obeying different laws (history
  append-only, scheduler-immune; plan is the scheduler's domain).
- **Day = Sleep-start → Sleep-start, by construction.** The live tasklist **always begins with
  a Finished Sleep** (the day's head). Days may run 30–100+ hours (no sleep, no new day).
- **Back-logging:** past tasks born directly into history; time after last SOD editable in the
  main view, earlier via the history editor; no-overlap enforced throughout.
  - **Mechanism (Stage 3, 2026-07-15).** "Earlier via the history editor" = the History screen's
    editor slice (§6.4): per-entry immediate edit/delete via the `EDIT_HISTORY` event (atomic,
    validated full-history replace — occupancy non-overlapping, `end ≤ now`, `start ≤ end`; illegal
    edges snap, overlap throws and discards, live untouched — the same pure-reduce backstop as the
    fork's `EDIT_COMMIT`); fresh back-log via the single-entry `BACKLOG` insert.
  - **The >30-min missing-data ceremony is ONE component — `GapFillModal`.** "Unaccounted time
    between X and Y — what happened?" with fill types **Activity / Sleep / Nap / Wasted / leave →
    Lost** (§2.9/§2.10). It has **two entry points**: the History editor's gap rows (interior and
    the forming trailing gap) ship now (Stage 3); the **SOD missing-data precondition (§4.2) reuses
    the exact same modal** (Stage 4). Filling drives `BACKLOG`; leaving it books nothing — the
    residue becomes Lost Hours at the next SOD.

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

**Mechanism (Stage 4, 2026-07-15) — event-sourced state machine.**
- **State.** `ceremony: null | { phase: "pruning" | "planning" }` (null = Live) and
  `days: DayRecord[]` are event-sourced core State (open-item 7 — stored via the SOD event,
  reproduced by deterministic replay, NOT re-derived each render). `ceremony` persists, so a
  mid-ceremony reload resumes at the right step.
- **`DayRecord` is MINIMAL** (grilled 2026-07-15): `{ id, start, end, reportDate }` — boundary
  facts only. `start` = Sleep A start, `end` (exclusive) = Sleep B start, `reportDate` =
  local-midnight Min of the SOD press day (the web computes it; core stays Date-free). No cached
  aggregates: accounted/lost/per-head are a **derived selector** over `history`, because SOD books
  Lost Hours so a sealed day tiles fully (Σ occupancy over `[start,end)` = span), and nothing
  cached can go stale if a forming-day entry is later edited.
- **Precondition = ≥2 Finished Sleeps in the forming day** (`sodPrecondition`). The **forming day**
  is history with `start ≥ formingDayStart` = the last `DayRecord.end` (or, before any SOD, the
  day's head sleep / earliest occupancy). Scoping ruling (grilled 2026-07-15): **0 or 1 → not ok**
  (the UI opens the missing-data GapFillModal on the trailing unaccounted span to log the sleep);
  **exactly 2 → sweep [A,B)**; **3+ → sweep the FIRST two** (a missed prior SOD), leftover sleeps
  stay in the new forming day so each SOD advances one boundary iteratively (never blocks on an
  excess). A/B are the two earliest sleeps.
- **SOD event.** Sweeps `[Sleep A start … Sleep B start)` into a new `DayRecord`; books every
  **unaccounted gap** in that span as a **Lost Hours occupancy** entry (`headId = LOST_HOURS`,
  `taskId: null`, one per span — open-item 10); leaves **unstarted leftovers untouched**; enters
  phase `"pruning"`. History is append-only/scheduler-immune — nothing is moved, so B (the next
  sleep) becomes the new forming-day head emergently (`formingDayStart` = the new record's end).
  Booking is atomic (validated against the whole history; adjacency to Sleep B is not overlap).
- **PRUNING_DONE event `{ discardIds }`.** Discards **dead leftovers ∪ user-chosen** (grilled
  2026-07-15 — auto-dead PLUS a manual keep/discard list with Discard-all / Carry-all). "Dead" =
  `deadLeftovers`: a leftover that can no longer legally occur (a non-slideable anchored task whose
  window is fully past, or an ommf task whose anchored start has passed) — a slideable non-fixed
  task rides and is never dead, and most past-window tasks are already gone via tick amputation.
  Discards go through the existing `CANCEL_TASK` path (records a cancelled entry, cleans up parent
  brackets). Quota trim (Stage 6) and weekly-plan injection (Stage 5) are **shipped as no-ops**.
  → phase `"planning"`.
- **PLANNING_DONE event.** → `ceremony = null` (Live). Ad-hoc tasks are added via the ordinary New
  Task drawer during the planning step.
- **Zero-width occupancy guard.** COMPLETE/PAUSE of a task in the same minute it started occupied
  nothing and is **not** recorded (a `[t,t]` point would read as an overlap against a Lost Hours
  span or the no-overlap scan).
- **Zero-sum invariant.** `day-record-zero-sum`: within each sealed `DayRecord`, Σ occupancy over
  `[start,end)` = `end − start` (wall = accounted + lost, made explicit history, not a live
  subtraction).

### 4.3 EOD — ritual only — G12
User-activated, never automatic; processes nothing; work after EOD is legal. If a task is
Running → modal **[Complete] / [Pause] / [Keep working]**. Real rollover is the next SOD.
- **EOD pre-computation (optimization):** activating EOD may pre-compute the day's temporary
  aggregates/report structures. If the user then sticks to plan until the next SOD, that cached
  work serves as already-calculated data, saving computation at SOD. (Invalidated if the day
  changes materially after EOD.)
- **Mechanism (Stage 4, 2026-07-15) — UI-only, NO core event.** EOD "processes nothing", so it is
  a pure UI affordance (`EodButton`): pressing it with a task **Running** opens a modal
  **[Complete] / [Pause] / [Keep working]** that maps to the existing `COMPLETE_RUNNING` /
  `PAUSE_RUNNING` events; with nothing running it just shows a transient "day marked done" notice.
  No `EOD` event exists (nothing to reduce). EOD pre-computation stays an optional future
  optimization — skipped now because the minimal `DayRecord` caches no aggregates to pre-fill.

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
