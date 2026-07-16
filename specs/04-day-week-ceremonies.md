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
- **Overlay dismissal (back-navigation law, fixed 2026-07-16).** The guided-ceremony overlay is
  **dismissable at any phase** — Escape, the header Back (‹/×), and the scrim all just close the
  overlay one level back to the Day, **without aborting the ceremony**: the committed sweep,
  `DayRecord`, and `ceremony` phase all survive, and the Day header's **"Resume day setup"** button
  re-opens the overlay at the phase left off. Visibility is driven **solely by the web's transient
  `sodOpen` flag** (not by `state.ceremony`, which only re-opens the overlay ONCE on a mid-ceremony
  reload) — so Esc can dismiss it in every phase. Aborting/discarding a ceremony is a distinct
  action, never what Back does; Back is always non-destructive (consistent with the Esc==back law).
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
  brackets). Then, in order: **§5.1 redistribution** (the sealed day's weekly-quota
  shortfall/exact-overshoot appends to the week-instance ledger) → **quota trims** (§5.1 Pruning
  trim, built 2026-07-16 — the event carries per-head kept shares; each cut lands as a `kind:
  "trim"` ledger entry and a sticky visible deficit) → **weekly-plan injection** (§11.7, drawing
  against the redistributed-then-trimmed shares). → phase `"planning"`.
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
  - **The declared First Weekday is the DERIVED first working day (§4.4b), fixed 2026-07-16** —
    the first non-off weekday after the weekend run — **not** the weekday the user planned on.
    Planning runs ON an OFF day by design (above), so "today" is systematically an OFF day;
    declaring it shifted the weekly-quota week window (`weekdayPos`, §5.1) by the weekend's
    length. The web derives it (it owns `weekendDays`, §4.4a) and declares it on `START_WEEK`
    **and on every OFF-day toggle** (which re-dispatches `START_WEEK`, so the run may have moved).
    One definition of "first working day" (§4.4b), declared into core — never two.
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

**Mechanism (Stage 5, 2026-07-15) — event-sourced weekly plan + injection.**
- **State `week: WeekPlan` = `{ startedAt, firstWeekday, offDays, templates }`** (event-sourced).
  A **`WeekTemplate`** is a reusable task spec: title, head/activity, timing, tier, ommf,
  slideable, breakable, budget?, **anchor time-of-day** `anchorStartTod`/`anchorEndTod` (0..1439 —
  a "9am meeting", NOT an absolute epoch), sleepKind?, `weekdays: number[]` (0=Sun…6=Sat), and a
  LexoRank. Recurrence = the weekday set (daily = all 7, weekend = [0,6]); **one-time/ranged:
  ruled IN scope (2026-07-16, supersedes the 2026-07-15 "future extension" deferral).** A template
  gains an optional **validity**: **one-time** (fires on its next weekday occurrence, then retires —
  never fires again; the retired template stays listed, marked, until deleted) or **ranged**
  (`from`/`to` local-midnight dates, inclusive, bounding when the weekday set fires; either edge may
  be open). `injectToday` filters templates by validity for the injection date; the WeekView
  template editor gains the control (date fields are smart-input + 📅 per §7.0.5, future-direction).
  Validity dates use the same local-midnight epoch-minute keys as the §4.6 dated layer.
- **`SET_WEEK_PLAN { templates, weekday?, urgent? }`** replaces the template set. **LOCKED
  mid-week** (`canPlanWeek`): accepted only before the first week starts, when today's weekday is an
  **OFF day** (default Sunday; ≥1 required), or with the **urgent bypass**; otherwise a no-op. The
  reducer stays Date-free — the web passes today's `weekday`.
- **`START_WEEK { firstWeekday?, offDays?, startedAt? }`** marks the boundary + First Weekday + OFF
  days. It does **not** instantiate anything — daily SOD injection does (the three realities above
  all just start). **It is the ROLLOVER**: it resets `startedAt` (the week WINDOW weekly quotas and
  Analytics measure from) and clears the §5.1 `quotaAdjust` ledger (per week instance).
- **`SET_OFF_DAYS { offDays, firstWeekday? }` (added 2026-07-16)** edits the OFF set + the §4.4b
  First Weekday **without** rolling the week over. Off-day edits must NOT borrow `START_WEEK`:
  doing so silently restarted the week and discarded the §5.1 ledger on every chip click (audit
  finding, §10). Not gated on `weekBudgetValidity` — the §11.2 gate stops a week STARTING
  unbalanced (it still disables the Start-Week button); gating here would make the chip a silent
  no-op instead. Guarded by `off-days-invariants.test.ts` + a static check that no call site sends
  `START_WEEK` with `offDays`.
- **Injection at `PRUNING_DONE { inject: { midnight, weekday } }`** (§3.13). `injectToday`
  instantiates every template whose `weekdays` includes today's weekday, resolving time-of-day
  anchors to absolute epoch for `midnight`, ranked **strictly below the surviving leftovers**
  (open-item 5), then settles + amputates. Injected anchored tasks keep their **true** coordinates
  (no proposal relocation), so **G18** holds: partly-past → head amputated at birth; fully-past →
  perish (fixed/ommf) or quota-shortfall (budgeted). No week started → no-op.
- **Web `WeekView`** (full-page): a **placed week grid** (§4.4 "Google-Calendar-week-inspired") +
  template editor (smart-input on anchor time-of-day and budget, §7.0.2), OFF-day chips, First
  Weekday, **Start New Week**. Locked mid-week with an urgent override toggle.
- **Placed-week grid (feedback 2026-07-15).** Recurring tasks are shown **placed** across the week,
  not as a flat list. `weekPreview` (pure, web-only) runs the **same core `settle`-pass** per
  weekday on that day's instantiated templates, so anchored tasks pin at their time and budgeted/
  unscheduled tasks fill **by rank order** from the day-start cursor — exactly as a daily task lands
  in the timeline (the user's ask: "order still matters, same as daily tasks in the timeline view";
  **no separate 'anytime' band**). This is a **visual preview only** — it does NOT instantiate onto
  the spine; real placement still happens per-day at SOD injection (the sleep-cycle-day law is
  unchanged). 7 day-columns share one time axis; a block is clickable → edit its template.

### 4.5 mechanism — off-periods (Stage 5, 2026-07-15)
- **`START_OFF_PERIOD { title?, knownEnd? }`** begins an **Inviolable running block** on the spine
  (`RunningTask.isOff`, tier `inviolable`, head **Off-Periods**, §2.10). Known end → a countdown
  block `[now, knownEnd]`; unknown → an **open stopwatch**. Any current runner is paused (its
  remainder survives); **plan tasks push below** the block (default "push") — the perish/carry
  disposition is a UI choice via `CANCEL_TASK` (reuses the pruning-style list). Off-Periods is a new
  **built-in head** (undeletable, system-owned, never a planning-picker option, §2.10).
- **`END_OFF_PERIOD`** completes the running off-period (books its Off-Periods occupancy), no-op
  otherwise. Pause/resume works via the ordinary PAUSE/START; ceremony suspension stays **emergent**
  (no SOD pressed = suspended).

### 4.5 Off-periods (abrupt, mid-week) — G-off
- **Real tasks on the spine** (Inviolable tier), UX-distinct from ordinary tasks. Known end →
  fixed block; unknown end → head-anchored running block.
- On initiation: app asks known/unknown end, and offers a **displaced-tasks flow reusing the
  pruning UI** (perish / carry / push). **BUILT (2026-07-16):** the Off dialog lists the
  top-level unstarted plan tasks (children ride with their bracket, as in SOD pruning) with a
  per-item **Keep / Discard** chip — Keep = push (default; the task settles below the block and
  resumes after), Discard = perish (`CANCEL_TASK` dispatched after `START_OFF_PERIOD`). "Carry"
  IS the push default here: unlike SOD pruning there is no day boundary to carry across — a
  pushed task survives the block by construction.
- Ceremonies auto-suspend while off (they're user-performed; no SOD = suspended).
- **Weekend OFF day ≠ abrupt off-period:** resumption from a weekend expects weekly planning
  (a hidden urgent bypass exists). Off-periods are pausable and OMMF-capable.

### 4.4a Weekend vs OFF day (feedback 2026-07-15)
Two distinct concepts, deliberately not merged:
- **Weekend days** — a *cultural marker* (which days your week rests on). **Configurable; default
  Sat + Sun; ≥1 required.** A **web setting** (`weekendDays`, localStorage) — purely presentational
  + a seed. It drives the special **weekend column background** and forces those days OFF.
- **OFF days** — the *functional* set (`week.offDays`, core, event-sourced). An OFF day (a) opens
  the mid-week structural-planning lock (§4.4) and (b) **skips recurring injection** (rest: no
  templates instantiate at that day's SOD; **dated one-offs still fire**, §4.6).
- **Invariant `weekend ⊆ offDays`** — enforced at both edit points (2026-07-16; it was broken).
  Every weekend day is always an OFF day (you cannot mark a day "weekend" yet have it inject).
  Marking a day weekend in **Settings** unions it into core's `offDays` (`SET_OFF_DAYS`) — without
  this the day was tinted weekend, dropped its §4.4b number, and **still injected its templates**.
  **Unmarking** does not un-OFF it: `offDays` may exceed the weekend, so it simply becomes a
  non-weekend off the planner can toggle. Settings stays transactional (§06) — a cancelled weekend
  edit reverts the setting AND the OFF set together. OFF days may **exceed** the weekend — the user pre/post-pends extra
  OFF days to **lengthen the weekend** (Fri off before a Sat/Sun weekend). In the planner, weekend
  chips are OFF and **locked-on**; non-weekend days toggle freely; the set can never drop below the
  weekend or below one OFF day. Toggling OFF a day **clears that column's placement in the preview**
  but **preserves the templates** (re-enabling the day restores them — nothing is deleted).
- **Adjacent OFF days are automatically weekend (locked 2026-07-16).** An OFF day directly adjacent
  (pre or post, wrapping the week) to the weekend set is **counted as weekend** — that is what
  "lengthen the weekend" means. The rule is transitive: the **weekend run** = the maximal contiguous
  run of OFF weekdays reachable from `weekendDays` by adjacency. Those days get weekend treatment
  (styling included), not merely weekend arithmetic. An OFF day **not** reachable that way is a
  **non-weekend off** (a mid-week rest, e.g. Thursday) — see §4.4b.

### 4.4b Working days — the numbering shown on the calendar (locked 2026-07-16)
The week's working days are **numbered**, and the number is written in full on every calendar
column head: **"1st working day"**, "2nd working day", … (full label, not abbreviated).

- **The 1st working day is where the user WAKES.** After the weekend run's last day, the user
  sleeps — that sleep is the **head sleep of the 1st working day's cycle** (§4.1: day =
  Sleep-start → Sleep-start, so the sleep *opens* the day it heads). The day the sleep *starts* on
  is **not** the 1st working day; the calendar day the user **wakes up on** is, because that is
  where work begins. Generally: a cycle's label sits on the column where its head sleep **ends**.
- **Counting.** Walk forward from the first working day after the weekend run. Each day that is
  neither a weekend-run day nor a non-weekend off takes the next number.
- **Non-weekend offs are skipped — no number, and no reset.** Example (OFF = Sat, Sun + Mon, Tue
  lengthening the weekend; Thursday taken off): run = Sat→Tue, so **Wed = 1st working day**, Thu is
  skipped, **Fri = 2nd working day**. A non-weekend off may be a **recurrence** (every Thursday) or
  a **one-off** (this Thursday only) — the user gets both; numbering treats them identically.
- **Weekend-run columns carry no number.**
- **This definition WINS over the declared `firstWeekday` (ruling 2026-07-16) — and they no longer
  disagree.** `START_WEEK` now **declares this derivation** (§4.4), so the value core holds in
  `week.firstWeekday` — the one that drives weekly-quota week-position (`weekdayPos`, §5.1) — IS the
  first working day defined here. There is one definition, computed in one place (`workingDays.ts`)
  and declared into core; core needs no knowledge of `weekendDays` (a web setting, §4.4a).
- **The numbering is plan-side and nominal.** Calendar columns are wall-clock dates, one cycle each;
  lived days drift (30–100h — no sleep, no new day, §4.1). Real cycles are counted in Analytics
  (§6), which uses sealed `DayRecord`s. The label is the intended cycle, not the lived one.

### 4.6 Dated override layer — the Calendar screen — G28 (feedback 2026-07-15)
The Week Plan is the **recurring** structure for the **coming week only**. Alongside it, a
**Calendar** view attaches activities to a **specific calendar date** (navigable across weeks). It is
a **dated override layer** on top of the recurring plan — three powers per date:
- **Add** a one-off `DatedTask` (a `TaskSpec` pinned to a date, not a weekday) — e.g. a dentist appt.
- **Skip** a recurring template on that date only (skip Friday standup this once).
- **Override** a template's anchor/budget on that date only (gym at 11 instead of 9 this Thursday).
  **BUILT (2026-07-16):** clicking a recurring block in Calendar mode opens the day-menu, whose
  "On this day" fields (smart TodField / DurInput — only the fields the template itself
  anchors/budgets are shown) edit a `TemplateOverride`. **Save stores just the DIFF from the
  template** (`diffOverride`): undefined fields inherit, so a later template edit still flows
  through to dates the user never touched; nothing differs → the override is cleared. A "moved"
  badge + "Reset to the template's time" appear while one exists. Never gated (`SET_DATED`);
  "Edit template…" remains the structural, all-weeks escape.

**Model.** `State.dated: DatedEntry[]`, one entry per date that has any add/skip/override, keyed by
that date's **local-midnight epoch-minute** (`date`) — the same key SOD injection uses (core stays
Date-free; the web computes it). **`SET_DATED { date, adds, skips, overrides }`** replaces the whole
entry for one date (adds get ids/ranks assigned in order); an entry that ends up empty is dropped.
Dated edits are **always allowed** — a specific date is never structurally "locked" the way the
recurring week is.

**Injection (`injectToday`).** For the injection date it consults the day's `DatedEntry`: recurring
templates fire on their weekday **unless** the day is OFF or the template is skipped; matched
templates apply their per-date override; then the date's **adds** are appended, ranked **below** the
templates (and both below surviving leftovers). One instantiation path (`templateToTask` over the
shared `TaskSpec`) serves templates and dated one-offs alike.

**Placement horizon (feedback 2026-07-15).** A dated activity that **falls within the coming week is
shown placed in the weekly-planning preview at its time** — not merely parked. `weekPreview` is
**date-aware**: each column maps to an **actual date** of the coming week, applies that date's
adds/skips/overrides, and settles. **Conflicts are surfaced (notify the user)** — a dated add that
collides with the recurring plan (a fixed-anchor overlap or a squeezed placement) raises a preview
warning naming the day. Dates **beyond** the coming week are stored and shown on the Calendar, and
inject at their own SOD (they are not placed on the live spine early).

**Rendering — our days laid OVER the calendar (clarified 2026-07-16).** The grid is **wall-clock
truth**: a block draws where it actually occurs. Our sleep-cycle days (§4.1) are laid **over** those
standard calendar days, so the two do not align 1:1 — a head sleep starts on the previous calendar
column and runs into the one it heads. Therefore **a block that crosses midnight legitimately spans
two calendar columns**, and one column legitimately shows two different cycles' material (the tail of
today's head sleep in the morning, the start of tomorrow's at night — they never overlap). This is
correct, not a conflict. Implementation: react-big-calendar with `showMultiDayTimes` and
`allDayAccessor={() => false}` (§7.0.4) — the default all-day banner row is **forbidden here**: it
would strip the day's head sleep off the time axis entirely.

**Navigation.** The grid screen hosts a segmented **`[ Week Plan | Calendar ]`** toggle (same grid
chrome, seamless): *Week Plan* = recurring, coming-week, heading **"Weekly Planning"** (toggle label stays "Week
Plan"; heading renamed 2026-07-16); *Calendar* = the dated
view with **‹ prev / next ›** week arrows and a date header over each column, heading "Calendar".
Both are reachable from the **main-screen nav**.

---
