/**
 * §4.4a/§4.4b — the weekend run and the working-day numbering shown on the
 * calendar column heads. Pure; no React, no state.
 *
 * The model (locked 2026-07-16):
 *  - `weekendDays` is the CULTURAL marker (§4.4a, a web setting). `offDays` is the
 *    FUNCTIONAL set (core, event-sourced). Invariant: weekend ⊆ offDays.
 *  - An OFF day directly adjacent (pre or post, wrapping) to the weekend is
 *    AUTOMATICALLY weekend — that is what "lengthen the weekend" means. Transitively:
 *    the WEEKEND RUN is the maximal contiguous run of OFF weekdays reachable from
 *    `weekendDays` by adjacency.
 *  - An OFF day not reachable that way is a NON-WEEKEND OFF (a mid-week rest). It is
 *    skipped in the numbering: no number, and NO reset.
 *  - Counting starts at the first working day after the run. §4.4b: the number lands
 *    on the day the user WAKES — which is the calendar day the cycle's head sleep
 *    ENDS on — so it is simply the working calendar column itself.
 *  - This derivation WINS over the declared `week.firstWeekday` (§4.4b ruling).
 */

const WEEK = 7;
const norm = (wd: number): number => ((wd % WEEK) + WEEK) % WEEK;

/**
 * The weekend run (§4.4a): `weekendDays` grown through adjacent OFF days, pre and
 * post, wrapping the week. Returns the set of weekday numbers in the run.
 */
export function weekendRun(weekendDays: number[], offDays: number[]): Set<number> {
  const off = new Set(offDays.map(norm));
  const run = new Set<number>();
  // Weekend days are always OFF (§4.4a invariant) — seed the run with them even if a
  // caller's offDays hasn't caught up, so the run is never empty.
  for (const w of weekendDays.map(norm)) run.add(w);
  // Grow outward from the seeds until no adjacent OFF day is left to absorb.
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of [...run]) {
      for (const next of [norm(d - 1), norm(d + 1)]) {
        if (!run.has(next) && off.has(next)) {
          run.add(next);
          grew = true;
        }
      }
    }
  }
  return run;
}

/**
 * The weekday the working-day count starts on (§4.4b): the first weekday after the
 * weekend run that is not itself off. Returns null when there are no working days.
 */
export function countStartWeekday(weekendDays: number[], offDays: number[]): number | null {
  const run = weekendRun(weekendDays, offDays);
  const off = new Set(offDays.map(norm));
  if (run.size >= WEEK) return null; // every day is weekend
  // Walk forward from any run day; the first non-run, non-off weekday opens the count.
  const seed = [...run][0] ?? 0;
  for (let i = 1; i <= WEEK; i++) {
    const wd = norm(seed + i);
    if (run.has(wd)) continue; // still inside the run
    if (off.has(wd)) continue; // a non-weekend off right after the run — skip, no number
    return wd;
  }
  return null;
}

/**
 * Working-day number for `weekday` (§4.4b), 1-based; null when the day carries no
 * number (a weekend-run day, or a non-weekend off — both are skipped).
 * Non-weekend offs are skipped WITHOUT resetting the count.
 */
export function workingDayNumber(weekday: number, weekendDays: number[], offDays: number[]): number | null {
  const wd = norm(weekday);
  const run = weekendRun(weekendDays, offDays);
  const off = new Set(offDays.map(norm));
  if (run.has(wd) || off.has(wd)) return null;
  const start = countStartWeekday(weekendDays, offDays);
  if (start === null) return null;
  let n = 0;
  for (let i = 0; i < WEEK; i++) {
    const cur = norm(start + i);
    if (run.has(cur) || off.has(cur)) continue; // skipped: no number, no reset
    n++;
    if (cur === wd) return n;
  }
  return null;
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/** §4.4b: the FULL label written on the column head — "1st working day". */
export function workingDayLabel(n: number | null): string | null {
  return n === null ? null : `${ORDINAL[n] ?? `${n}th`} working day`;
}
