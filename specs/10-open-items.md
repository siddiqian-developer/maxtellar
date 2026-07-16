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
- **`firstWeekday` vs the derived 1st working day (raised 2026-07-16).** §4.4b's derivation (first
  non-off day after the weekend run, labelled where the user *wakes*) is authoritative for the
  calendar's working-day numbering and **wins** over the `firstWeekday` declared at `START_WEEK`.
  But `week.firstWeekday` still drives weekly-quota week-position (`weekdayPos`, §11), so the two
  can disagree — e.g. `WeekView` currently declares `firstWeekday: todayWeekday`, which may land on
  an OFF day. Reconciling quota positioning to the §4.4b definition is deliberately **not** done
  silently (it would change quota behavior); settle it explicitly.
- ~~**BUG (found 2026-07-16 during R7, PRE-EXISTING — not caused by the RBC swap).** `weekPreview`
  blocks carried the **preview task id** in a field named `templateId`, so click→edit, §4.6
  "Edit template…" and "Skip this day" all silently failed.~~ **RESOLVED (2026-07-16).** Injection
  mints a fresh id per task (`nextId()`), which matches no template — the id was never recoverable
  downstream. Fixed at the source: `InjectionResult` now carries **`sourceIds`** (injected task id →
  the `WeekTemplate.id`/`DatedTask.id` it was instantiated from), and `weekPreview` maps each block's
  `templateId` through it. All three behaviors verified working in-browser (skip removes the block
  AND its cross-midnight tail; click→edit and Edit-template open the right template). Guarded by
  `weekPreviewSource.test.ts`, which fails if a block ever carries a minted id again.
