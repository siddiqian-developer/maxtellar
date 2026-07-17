/**
 * Ceremony helpers (§4.2 SOD) — pure selectors shared by the reducer and the
 * web guided flow. The day is Sleep-start → Sleep-start (§4.1): a "forming day"
 * is the history after the last sealed DayRecord.end; SOD closes it at the next
 * Finished Sleep.
 */

import type { HistoryEntry, Min, State, UnstartedTask } from "./types.js";
import { SLEEP_ID } from "./budget.js";

/** [start,end) intersection width, clamped ≥ 0. */
export function clip(start: Min, end: Min, winStart: Min, winEnd: Min): Min {
  return Math.max(0, Math.min(end, winEnd) - Math.max(start, winStart));
}

/**
 * The start of the still-forming day — the floor the SOD sweep and the forming-
 * day hero metric measure from, and the history editor's editable-window floor
 * (§7.0.2, refined 2026-07-15 from the interim "yesterday"). In order: the last
 * sealed DayRecord.end; else the current day's head Sleep start; else the
 * earliest occupancy; else `now` (empty history).
 */
export function formingDayStart(s: State): Min {
  if (s.days.length) return s.days[s.days.length - 1]!.end;
  const occ = s.history
    .filter((h) => h.kind === "occupancy" && h.end > h.start)
    .sort((a, b) => a.start - b.start);
  const firstSleep = occ.find((h) => h.headId === SLEEP_ID);
  if (firstSleep) return firstSleep.start;
  if (occ.length) return occ[0]!.start;
  return s.now;
}

export interface SodPrecondition {
  /** Whether SOD may proceed — ≥2 Finished Sleep items in the forming day. */
  ok: boolean;
  /** The forming-day start the sleeps are counted after. */
  formingStart: Min;
  /** Finished Sleep occupancy entries in the forming day, earliest-first. */
  sleeps: HistoryEntry[];
  /** Topmost (earliest) Finished Sleep — this day's head. */
  sleepA?: HistoryEntry;
  /** The next Finished Sleep — becomes the new day's head after the sweep. */
  sleepB?: HistoryEntry;
}

/**
 * §4.2 precondition. Counts Finished Sleep occupancy (headId===SLEEP_ID) in
 * the forming day (history with `start ≥ formingDayStart`). Scoping ruling
 * (grilled 2026-07-15): 0 or 1 → not ok (UI opens the missing-data GapFillModal
 * to log the missing sleep); exactly 2 → sweep [A,B); **3+ → sweep the first two**
 * (a missed prior SOD), leftover sleeps stay in the new forming day so each SOD
 * advances one boundary iteratively. So `ok` ⇔ ≥2 sleeps, and A/B are the first
 * two.
 */
export function sodPrecondition(s: State): SodPrecondition {
  const formingStart = formingDayStart(s);
  const sleeps = s.history
    .filter(
      (h) =>
        h.kind === "occupancy" &&
        h.end > h.start &&
        h.headId === SLEEP_ID &&
        h.start >= formingStart,
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const ok = sleeps.length >= 2;
  return {
    ok,
    formingStart,
    sleeps,
    ...(sleeps[0] ? { sleepA: sleeps[0] } : {}),
    ...(sleeps[1] ? { sleepB: sleeps[1] } : {}),
  };
}

/**
 * The unaccounted [start,end) gaps inside a window, given occupancy entries —
 * exactly the spans SOD books as Lost Hours (open-item 10: one entry per span).
 * Occupancy is non-overlapping (invariant), so a sort suffices.
 */
export function unaccountedGaps(
  occ: { start: Min; end: Min }[],
  winStart: Min,
  winEnd: Min,
): { start: Min; end: Min }[] {
  const clipped = occ
    .map((h) => ({ start: Math.max(h.start, winStart), end: Math.min(h.end, winEnd) }))
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  const gaps: { start: Min; end: Min }[] = [];
  let cur = winStart;
  for (const iv of clipped) {
    if (iv.start > cur) gaps.push({ start: cur, end: iv.start });
    cur = Math.max(cur, iv.end);
  }
  if (cur < winEnd) gaps.push({ start: cur, end: winEnd });
  return gaps;
}

/**
 * §4.2 pruning: "dead leftovers" that can no longer legally occur, auto-discarded
 * at PRUNING_DONE (grilled 2026-07-15 — auto-dead ∪ user-chosen). A slideable
 * non-fixed task rides under pressure (§3.2/G28) and is never dead. Otherwise a
 * task is dead once its anchored window has fully passed (`end ≤ now`), or an
 * ommf task whose anchored start is already behind `now`. Parents (brackets) are
 * excluded — they carry no window of their own. Most such tasks are already gone
 * via tick amputation; this catches the residue between the last tick and SOD.
 */
export function deadLeftovers(s: State): UnstartedTask[] {
  const now = s.now;
  const parentIds = new Set<string>();
  for (const i of s.plan) if (i.kind === "task" && i.parentId) parentIds.add(i.parentId);
  return s.plan.filter((i): i is UnstartedTask => {
    if (i.kind !== "task" || parentIds.has(i.id)) return false;
    if (i.slideable && i.timing !== "fixed") return false;
    const end =
      i.timing === "fixed" || i.timing === "semi-tail"
        ? i.anchorEnd
        : i.timing === "semi-head" && i.anchorStart !== undefined && i.budget !== undefined
          ? i.anchorStart + i.budget
          : undefined;
    if (end !== undefined && end <= now) return true;
    if (i.ommf && i.anchorStart !== undefined && i.anchorStart < now) return true;
    return false;
  });
}
