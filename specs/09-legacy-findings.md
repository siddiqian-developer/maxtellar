# PART IX — LEGACY SYSTEM FINDINGS (the 8-yr Sheet + AppScript, studied 2026-07-08)

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
