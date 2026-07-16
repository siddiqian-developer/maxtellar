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
- **BUG (found 2026-07-16 during R7, PRE-EXISTING — not caused by the RBC swap).** `weekPreview`
  blocks carry the **preview task id** in a field named `templateId`: `injectTodayDetailed` mints
  ids via `nextId()` (`pv-<date>-<n>`) in `templateToTask(spec, midnight, nextId(), rank)`, and
  `weekPreview` then stores `templateId: t.id` — the generated id, never the source template's.
  Everything that looks a template up by that id therefore silently fails:
  1. **Week Plan: click a block → edit its template** — `week.templates.find(x => x.id === "pv-…")`
     is always `undefined`; the editor never opens (verified in-browser).
  2. **§4.6 Skip this day → SILENT NO-OP** (verified: block count unchanged after skipping).
     `SET_DATED` stores the `pv-` id in `skips`; `collectDue` filters `!skips.has(t.id)` against
     REAL template ids, so the skip never matches.
  3. **§4.6 "Edit template…" (move)** — same failed lookup.
  Fix direction: carry the **source** id through the preview (e.g. `injectTodayDetailed` returns a
  taskId→sourceId map, or `WeekBlock` gains a `sourceId` distinct from the render id) and point the
  three call sites at it. Needs a core change; deliberately NOT bundled into the R7 grid swap.
