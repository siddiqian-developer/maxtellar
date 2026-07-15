/**
 * Weekly-plan injection (§4.4 / §3.13) — pure helpers shared by the reducer.
 * Injection = instantiate today's matching templates as unstarted proposals,
 * ranked BELOW surviving leftovers, then let the ordinary settle-pass lay them
 * out (partly-past anchored → amputate head at birth G18; fully-past → perish).
 * Core stays Date-free: the caller passes today's local-midnight + weekday.
 */

import type { Min, State, UnstartedTask, WeekTemplate } from "./types.js";

const MIN_PER_DAY = 1440;

/** Whether structural weekly planning is allowed right now (§4.4). Locked
 * mid-week; open before the first week starts, on an OFF weekday, or via the
 * urgent bypass. `weekday` is today's local weekday (0=Sun); pass null when the
 * caller can't compute it (treated as "not an OFF day"). */
export function canPlanWeek(s: State, weekday: number | null, urgent = false): boolean {
  if (urgent) return true;
  if (s.week.startedAt === null) return true; // no week committed yet
  if (weekday !== null && s.week.offDays.includes(weekday)) return true; // OFF-day window
  return false;
}

/**
 * The unstarted tasks to inject for `weekday`, with anchors resolved to absolute
 * epoch minutes for the day starting at `midnight`. Ranks are assigned strictly
 * ABOVE `belowRank` (the lowest existing leftover rank) so injected tasks sit
 * below every surviving leftover (spec default, open-item 5). Order preserves
 * template rank. The reducer adds these then settles/amputates.
 */
export function injectToday(
  s: State,
  midnight: Min,
  weekday: number,
  nextId: () => string,
  rankBelow: (prev: string | null) => string,
): UnstartedTask[] {
  const due = s.week.templates
    .filter((t) => t.weekdays.includes(weekday))
    .slice()
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  const out: UnstartedTask[] = [];
  let prevRank: string | null = null;
  for (const t of due) {
    const rank = rankBelow(prevRank);
    prevRank = rank;
    out.push(templateToTask(t, midnight, nextId(), rank));
  }
  return out;
}

/** Instantiate one template onto the day at `midnight`. Time-of-day anchors
 * (0..1439) become absolute; a `tod` past 1440 (overnight) is clamped inside
 * the day. */
export function templateToTask(
  t: WeekTemplate,
  midnight: Min,
  id: string,
  rank: string,
): UnstartedTask {
  const abs = (tod: number): Min => midnight + Math.max(0, Math.min(MIN_PER_DAY - 1, tod));
  const task: UnstartedTask = {
    kind: "task",
    id,
    rank,
    title: t.title,
    headId: t.headId,
    activityId: t.activityId,
    tier: t.tier,
    timing: t.timing,
    ommf: t.ommf,
    slideable: t.slideable,
    breakable: t.breakable,
    ...(t.budget !== undefined ? { budget: t.budget } : {}),
    ...(t.anchorStartTod !== undefined ? { anchorStart: abs(t.anchorStartTod) } : {}),
    ...(t.anchorEndTod !== undefined ? { anchorEnd: abs(t.anchorEndTod) } : {}),
    ...(t.sleepKind !== undefined ? { sleepKind: t.sleepKind } : {}),
  };
  return task;
}
