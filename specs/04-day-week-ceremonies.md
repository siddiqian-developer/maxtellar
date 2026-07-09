# PART IV — DAY, WEEK & CEREMONIES

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
