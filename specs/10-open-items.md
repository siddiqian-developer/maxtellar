# PART X — RESIDUAL OPEN ITEMS (safe to settle during build)

- Exact single-tick op order when many events coincide (R3 gives the frame; edge sequencing
  finalizes in code).
- Frogleap trigger details for unbreakable non-budgeted types (rare).
- ~~Whether the missing-data ceremony fully merges with the >30-min-gap modal in UI (assumed
  yes).~~ **RESOLVED (Stage 3/4):** yes — one `GapFillModal` with two entry points (history
  editor gap rows; the SOD missing-data precondition, §4.2).
- **RESOLVED (Stage 4):** `DayRecord` shape is minimal `{ id, start, end, reportDate }` (aggregates
  derived, not cached); SOD sleep-count scoping is 0/1 → GapFill, 2 → sweep, 3+ → sweep first two;
  pruning discards auto-dead ∪ user-chosen (per-item + Discard-all/Carry-all). See §4.2.
- Default pomodoro preset shipped.
- ~~Injected-leftover relative priority default (assumed: injected ranks below leftovers).~~
  **RESOLVED (Stage 5):** injected weekly tasks rank strictly below surviving leftovers (§4.4);
  user drags to re-rank. Recurrence is a weekday set (one-time/ranged: deferral lifted 2026-07-16 —
  template validity, see §4.4); mid-week planning
  is locked (open on OFF days / pre-week / urgent); off-periods book to a new built-in Off-Periods
  head. See §4.4/§4.5.
- ~~**`firstWeekday` vs the derived 1st working day (raised 2026-07-16).**~~ **RESOLVED
  (2026-07-16).** It was worse than a mismatch: `WeekView` declared `firstWeekday: todayWeekday`,
  and §4.4 has weekly planning run ON an OFF day — so the declared "First Weekday" was
  systematically an OFF day, shifting the weekly-quota week window (`weekdayPos`, §5.1 — its only
  consumer) by the weekend's length. Fixed by declaring the §4.4b **derivation** at `START_WEEK`
  and on every OFF-day toggle: the web computes it (it owns `weekendDays`) and passes it in, so
  core's value IS the first working day and no second definition exists. Guarded by
  `firstWeekday.test.ts`.
- ~~**BUG (found 2026-07-16 during R7, PRE-EXISTING — not caused by the RBC swap).** `weekPreview`
  blocks carried the **preview task id** in a field named `templateId`, so click→edit, §4.6
  "Edit template…" and "Skip this day" all silently failed.~~ **RESOLVED (2026-07-16).** Injection
  mints a fresh id per task (`nextId()`), which matches no template — the id was never recoverable
  downstream. Fixed at the source: `InjectionResult` now carries **`sourceIds`** (injected task id →
  the `WeekTemplate.id`/`DatedTask.id` it was instantiated from), and `weekPreview` maps each block's
  `templateId` through it. All three behaviors verified working in-browser (skip removes the block
  AND its cross-midnight tail; click→edit and Edit-template open the right template). Guarded by
  `weekPreviewSource.test.ts`, which fails if a block ever carries a minted id again.

## Audit findings — the "silent no-op" class (2026-07-16)

Two bugs (the `pv-` ids, the declared `firstWeekday`) were found **by accident** while porting the
week grid; both were silent, user-facing, in features marked DONE, and untested. A deliberate sweep
for the same class turned up two more, **both verified**, plus one by inspection. The common shape:
a value that looks right, is never checked, and fails without an error.

- ~~**BUG (verified, 2026-07-16): toggling an OFF day RESTARTS THE WEEK and wipes the §5.1 ledger.**~~
  **FIXED 2026-07-16** — new `SET_OFF_DAYS` event edits the OFF set + §4.4b First Weekday only;
  `START_WEEK` stays the rollover. Guarded by `off-days-invariants.test.ts` (incl. a test pinning
  that START_WEEK *does* still reset them) + a static guard failing any call site that sends
  `START_WEEK` with `offDays`. Original report:
  `WeekView.toggleOffDay` dispatches **`START_WEEK`** — the week-**rollover** event ("marks the
  boundary", §4.4) — merely to edit `offDays`. The reducer therefore also does
  `startedAt: event.startedAt ?? state.now` and `quotaAdjust: []`. Proven in a reducer test:
  `startedAt 5000 → 10000`, `quotaAdjust 1 → 0` from one chip click. Blast radius: `week.startedAt`
  is the WEEK WINDOW for weekly quotas (`alarms.ts`) and Analytics' "this week"
  (`AnalyticsScreen.tsx`), so both silently reset; every §5.1 redistribution + pruning trim is
  discarded. Fix direction: a dedicated event (e.g. `SET_OFF_DAYS { offDays, firstWeekday? }`) that
  changes ONLY the OFF set — `START_WEEK` should stay the rollover.
- ~~**BUG (verified, 2026-07-16): marking a day "weekend" in Settings does not make it OFF.**~~
  **FIXED 2026-07-16** — `toggleWeekend` unions the weekend into core's `offDays` via
  `SET_OFF_DAYS`; unmarking leaves the day OFF (offDays may exceed the weekend). Settings stays
  transactional: `weekendDays` + `offDays` joined the snapshot, so Cancel reverts both (they were
  not snapshotted at all before — a second, latent §06 violation). Browser-verified: Friday marked
  weekend → blocks 1→0, off false→true; Cancel restores 1/false. Guarded by
  `weekend-invariant.test.ts`. Original report: marking a day "weekend" in Settings did not make it OFF —
  §4.4a's `weekend ⊆ offDays` invariant is broken.** `SettingsPanel.toggleWeekend` calls
  `setWeekendDays` (web/localStorage) only; it never syncs core's `week.offDays`, though the panel
  already holds `dispatch`. Verified in-browser: marking Friday weekend leaves
  `friWeekend: true, friOff: false, friBlocks: 1` — the day is tinted as weekend and drops its
  working-day number (§4.4b), yet **still injects its recurring templates**. Exactly what §4.4a
  forbids: "you cannot mark a day 'weekend' yet have it inject." The UI contradicts itself.
  Needs a ruling first: syncing `offDays` is a STRUCTURAL change, and §4.4 locks those mid-week —
  so does the weekend setting become OFF-day-gated, or does it only take effect at the next
  `START_WEEK`?
- ~~**SUSPECTED: toggling an OFF day is a silent no-op when budgets don't balance.**~~
  **RESOLVED 2026-07-16** by the `SET_OFF_DAYS` split — it is deliberately not gated on
  `weekBudgetValidity` (that gate belongs to the rollover, and still disables the Start-Week
  button), so the chip always responds. Original report: `START_WEEK` gates on `weekBudgetValidity(probe).ok` and otherwise
  `return state` (reducer.ts). The Start-Week button is disabled in that state; the OFF-day chips
  are not, but dispatch the same event — so the chip would just not respond, with no feedback
  (§7.0.2 snap-NOTIFY says a rejected input must say so). Same root as the first item; a dedicated
  event resolves the coupling.

Swept clean: minted-id-vs-source lookups (the `pv-` class) — the three week-grid sites were the
only instances; other `.find(x => x.id === …)` sites resolve real ids in real collections.
- ~~**GAP (found 2026-07-16 building R8): the per-head ledger is not channel-aware.**~~
  **FIXED 2026-07-16** — both roll-ups now split by channel (head keeps `spent + breaks`;
  `wasted` → Wasted Time; `managed` → Self-Management), pro rata for clipped entries and exactly
  conserving. `breaks` needed no ruling after all: §5.2 already pins them to the task's head.
  Browser-verified: a drawer session while running now shows `Self-Management 00:05` beside
  `Recharge 00:05` with `Accounted 00:10`. Original report: §2.6 says
  per-task **wasted** "rolls up into the Wasted Time head" and **managed** "is credited to the
  Self-Management head". Neither happens: both roll-ups — core's `achievedByHead` (§5.1) and
  `AnalyticsScreen`'s — add a task's ENTIRE occupancy span to its own `headId` and never read
  `channels`. So managed/wasted minutes stay invisible under the task's head. (Analytics shows a
  separate top-line Wasted figure from `channels.wasted`, but the per-head table does not credit
  Wasted Time.) Fix direction: attribute `span − wasted − managed − breaks` to the task's head,
  `wasted` → Wasted Time, `managed` → Self-Management. **Not done silently: core's `achievedByHead`
  drives §5.1 quota redistribution**, so making it channel-aware moves quota math — and `breaks`
  has no specced head, which needs a ruling too.
- ~~**BUG (verified 2026-07-16, widened audit): the §06 transactional-Settings law covered only
  half the panel.**~~ **FIXED 2026-07-16.** §06: "Esc, the header ×, and a scrim click all revert
  **every field**". Seven were editable but absent from App's snapshot, so they silently survived
  a cancel: `showWeekday`, `mlMode`/`aiLevels`, `pomodoroDefault`, `alarmsEnabled`, `alarmBehavior`,
  `alarmSound`, `customSounds`. Verified in-browser BEFORE the fix (toggled `showWeekday` 1→0,
  pressed Escape, it stayed 0) and after (returns to 1). The same defect as the `weekendDays` gap
  fixed earlier that day — that fix was incomplete. Needed two new bulk setters (`setAiLevels`,
  `setCustomSounds`): `setAiLevel(feature, …)` and `addCustomSound`/`removeCustomSound` cannot undo
  a cancelled session. Guarded by `settings-transactional.test.ts` — a STATIC guard, because the
  bug lives in the GAP BETWEEN two files (a setting is added to the panel and nobody remembers
  App); it names the unrestored setter and was verified to fail when one restore is removed.
- ~~**GAP (widened audit 2026-07-16): §4.5's displaced-tasks flow is unbuilt.**~~ **BUILT
  2026-07-16.** The Off dialog now lists the displaced top-level plan tasks with per-item
  Keep(push)/Discard(perish via CANCEL_TASK) chips, pruning-list style. Verified in-browser:
  two tasks, one discarded — the discard left the pipeline, the keep pushed below the running
  Off block. Core sequence pinned in `weekly.test.ts`.
- ~~**GAP (widened audit 2026-07-16): §4.6's third power (per-date override / "move") has no
  UI.**~~ **BUILT 2026-07-16.** The Calendar day-menu grew "On this day" smart fields writing a
  minimal-diff `TemplateOverride` via `putDated` (`diffOverride`, tested — incl. that the
  override moves the block on that date ONLY through `weekPreview`). Verified in-browser: a
  Mon–Fri 9–10am template moved to 2–3pm on one date; the other four occurrences untouched.
- ~~**BUG (widened audit 2026-07-16): Calendar-mode "Edit template…" silently discarded mid-week
  saves.**~~ **FIXED 2026-07-16.** `locked` exempted Calendar mode entirely, but the reducer gates
  SET_WEEK_PLAN on `canPlanWeek` regardless — so mid-week on a working day the editor opened,
  saved, the drawer closed as if saved, and the reducer silently `return state`d. The Edit-template
  button now carries the same structural lock + tooltip as Add-template (per-date Skip stays
  available — SET_DATED is never gated).
- **LATENT (2026-07-16): one observed forward-only violation in the property suite.** The
  `forward-only: ticking never moves a surviving placement earlier` property failed ONCE in a
  randomized run (fast-check, no fixed seed) and passed on re-runs. The generator emits only
  long-standing events (tick/create/start/pause/complete/cancel/log/decompose), so the
  counterexample is a latent settle/tick bug, not from the day's changes. The failing seed was
  lost to output filtering. Next occurrence will be capturable: record the printed seed +
  shrunk counterexample verbatim, pin it as a regression test, then fix.
- **DEFERRED (2026-07-21): the Core Work / Upgrading two-way elastic-pool percentage redesign —
  spec first, implement next, NOT yet built.** User-specified math (verbatim, for the eventual
  spec pass): `net = 24 − Σ(all categories EXCEPT Core Work and Upgrading) − Self-Management`;
  this `net` splits BETWEEN "net Core Work" (`= Core Work − Self-Management`) and Upgrading by a
  user-set percentage pair that must sum to 100 (setting one auto-derives the other); percentage
  TARGETS are additionally allowed for individual heads AND sub-heads within those two
  categories, with the rule "the sum of a parent's children must equal the parent's own budget,
  and if a parent HAS a target, its children are restricted to summing to it (or the target is
  removed)." A worked example the user gave: with `net = 11h`, Self-Management `1h`, Core Work
  target `60%` (Upgrading auto-derives `40%`) → net Core Work `= 60% × (11−1)h = 6h`, Upgrading
  `= 4h`. This is a genuine revision of §11.3's CURRENTLY LOCKED law (today: ONE elastic pool,
  Core Work only, `netCore = 1440 − Sleep − Σ(non-core) − Self-Management`; percent budgeting
  exists ONLY at the head tier, never sub-head, §11.6's own note: "Budgets at HEAD level only for
  now; sub-head depth is §11.10" — this item picks that thread back up). Deliberately NOT
  implemented in the same turn as the 2026-07-21 bug fixes/smart-input parity/Sleep-trio work — a
  core-law change this size (touches `netCore`, `resolveDay`, `coreFit`, the snap-restore chain,
  AND needs a new sub-head-level budget-entry concept that doesn't exist in the schema at all
  today) needs its own dedicated §11.3 rewrite, reviewed BEFORE code, not folded into an unrelated
  turn's diff.
