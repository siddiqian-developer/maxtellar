/**
 * Weekly-plan injection (§4.4 / §3.13) — pure helpers shared by the reducer.
 * Injection = instantiate today's matching templates as unstarted proposals,
 * ranked BELOW surviving leftovers, then let the ordinary settle-pass lay them
 * out (partly-past anchored → amputate head at birth G18; fully-past → perish).
 * Core stays Date-free: the caller passes today's local-midnight + weekday.
 */

import type { Min, State, TaskSpec, TemplateOverride, UnstartedTask, WeekTemplate } from "./types.js";

const MIN_PER_DAY = 1440;

const byRank = (a: { rank: string }, b: { rank: string }): number =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;

/** §4.6: apply a per-date override to a template (anchor move / budget resize).
 * Undefined override fields inherit the template. */
function applyOverride(t: WeekTemplate, o: TemplateOverride): WeekTemplate {
  return {
    ...t,
    ...(o.anchorStartTod !== undefined ? { anchorStartTod: o.anchorStartTod } : {}),
    ...(o.anchorEndTod !== undefined ? { anchorEndTod: o.anchorEndTod } : {}),
    ...(o.budget !== undefined ? { budget: o.budget } : {}),
  };
}

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
  // §4.6: the dated override layer for THIS date (keyed by local-midnight).
  const entry = s.dated.find((e) => e.date === midnight);
  const skips = new Set(entry?.skips ?? []);
  const overrides = new Map((entry?.overrides ?? []).map((o) => [o.templateId, o] as const));

  // Recurring templates fire on their weekday — unless today is an OFF day
  // (rest: no recurring injection) or the template is skipped for this date.
  const isOff = s.week.offDays.includes(weekday);
  const due = isOff
    ? []
    : s.week.templates.filter((t) => t.weekdays.includes(weekday) && !skips.has(t.id)).slice().sort(byRank);
  // Dated one-offs fire regardless of OFF (you explicitly pinned them here),
  // ranked below the recurring templates, preserving their own order.
  const adds = (entry?.adds ?? []).slice().sort(byRank);

  const out: UnstartedTask[] = [];
  let prevRank: string | null = null;
  for (const t of due) {
    const rank = rankBelow(prevRank);
    prevRank = rank;
    const ov = overrides.get(t.id);
    out.push(templateToTask(ov ? applyOverride(t, ov) : t, midnight, nextId(), rank));
  }
  for (const d of adds) {
    const rank = rankBelow(prevRank);
    prevRank = rank;
    out.push(templateToTask(d, midnight, nextId(), rank));
  }
  return out;
}

/** Instantiate one template/dated-task onto the day at `midnight`. Time-of-day
 * anchors (0..1439) become absolute; a `tod` past 1440 (overnight) is clamped
 * inside the day. Reads only the shared TaskSpec fields, so a WeekTemplate and a
 * DatedTask instantiate through the identical path. */
export function templateToTask(
  t: TaskSpec,
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
