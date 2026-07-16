/**
 * Weekly-plan injection (§4.4 / §3.13) — pure helpers shared by the reducer.
 * Injection = instantiate today's matching templates as unstarted proposals,
 * ranked BELOW surviving leftovers, then let the ordinary settle-pass lay them
 * out (partly-past anchored → amputate head at birth G18; fully-past → perish).
 * Core stays Date-free: the caller passes today's local-midnight + weekday.
 */

import type { DatedTask, Dur, EndDayOffset, HistoryEntry, Min, State, TaskSpec, TemplateOverride, UnstartedTask, WeekPlan, WeekTemplate } from "./types.js";
import { SELF_MANAGEMENT, WASTED_TIME } from "./types.js";
import {
  budgetEntries,
  redistributeOvershoot,
  redistributeShortfall,
  weekDayShape,
  weeklyShare,
  type QuotaAdjustment,
} from "./budget.js";

const MIN_PER_DAY = 1440;

const fmtM = (m: Dur): string => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

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
 * §5.1: occupancy minutes per head within [start, end) (entries clipped),
 * **split by channel** per the §2.6 accounting identity.
 *
 * A task's wall is `spent + wasted + managed + breaks`, and those minutes do NOT
 * all belong to the task's own head:
 *  - **wasted → Wasted Time** (§2.6: "per-task wasted rolls up into the Wasted
 *    Time head"). Wasted is extra wall, not achievement — `end = start + budget +
 *    wasted` (E1), so removing it leaves the head its real budget.
 *  - **managed → Self-Management** (§2.6: the one sanctioned auto-log).
 *  - **breaks STAY with the task's head** — §5.2 is explicit: "Quotas count the
 *    whole pomodoro task (60m task = 60m to the head, breaks included)", and
 *    breaks eat the task's budget.
 * So the head keeps `span − wasted − managed` (= spent + breaks = its budget).
 *
 * Conservation: the three shares always re-sum to the clipped span (the head takes
 * the remainder, so integer rounding can never leak or invent minutes).
 */
export function achievedByHead(history: HistoryEntry[], start: Min, end: Min): Record<string, Dur> {
  const out: Record<string, Dur> = {};
  const add = (head: string, mins: Dur): void => {
    if (mins <= 0) return;
    out[head] = (out[head] ?? 0) + mins;
  };
  for (const h of history) {
    if (h.kind !== "occupancy") continue;
    const a = Math.max(h.start, start);
    const b = Math.min(h.end, end);
    if (b <= a) continue;
    const clipped = b - a;
    const span = h.end - h.start;
    // A partially-visible entry contributes its channels pro rata.
    const frac = span > 0 ? clipped / span : 0;
    const wasted = Math.min(Math.round(h.channels.wasted * frac), clipped);
    const managed = Math.min(Math.round(h.channels.managed * frac), clipped - wasted);
    add(WASTED_TIME, wasted);
    add(SELF_MANAGEMENT, managed);
    add(h.headId, clipped - wasted - managed); // the remainder — conserves exactly
  }
  return out;
}

/** Position of a weekday within the week that starts at `firstWeekday`. */
const weekdayPos = (wd: number, first: number): number => ((wd - first) % 7 + 7) % 7;

/** §4.4 one-time/ranged validity: whether a template's weekday set may fire on
 * the day at `midnight`. Absent validity = always. A `once` template that has
 * already fired (`firedOn` set) is retired; a `ranged` one fires only inside its
 * [from, to] window (either edge open). */
export function templateValidOn(t: WeekTemplate, midnight: Min): boolean {
  const v = t.validity;
  if (!v) return true;
  if (v.kind === "once") return v.firedOn === undefined;
  if (v.from !== undefined && midnight < v.from) return false;
  if (v.to !== undefined && midnight > v.to) return false;
  return true;
}

/**
 * §5.1 redistribution at SOD: the day the SOD sweep just sealed is compared
 * against each weekly-quota head's share on that day's weekday. at-least/exact
 * shortfalls spread forward over the head's remaining (non-OFF) weekdays of
 * the same week, availability-weighted (the %-residual absorbs them); exact
 * overshoot trims the remaining shares. Returns the quotaAdjust entries to
 * APPEND plus human notes ("Xh of Y could not be redistributed").
 * Pure + Date-free: the sealed day's weekday derives from the day gap between
 * its reportDate and today's midnight.
 */
export function quotaAdjustmentsAtSod(
  s: State,
  todayMidnight: Min,
  todayWeekday: number,
): { adjust: QuotaAdjustment[]; notes: string[] } {
  const adjust: QuotaAdjustment[] = [];
  const notes: string[] = [];
  const day = s.days[s.days.length - 1];
  if (!day || s.week.startedAt === null) return { adjust, notes };
  const diffDays = Math.round((todayMidnight - day.reportDate) / MIN_PER_DAY);
  const sealedWd = ((todayWeekday - diffDays) % 7 + 7) % 7;
  const first = s.week.firstWeekday ?? todayWeekday;
  const achieved = achievedByHead(s.history, day.start, day.end);
  const entries = budgetEntries(s.week);

  for (const b of entries) {
    if (b.kind !== "weekly" || !b.weekdays.includes(sealedWd)) continue;
    const type = b.quotaType ?? "atLeast";
    const share = weeklyShare(b, sealedWd);
    const ach = achieved[b.headId] ?? 0;
    // Remaining = this head's weekdays strictly AFTER the sealed day within the
    // same week (no wrap — the hard week boundary), skipping OFF days.
    const remaining = b.weekdays
      .filter((wd) => weekdayPos(wd, first) > weekdayPos(sealedWd, first) && !s.week.offDays.includes(wd))
      .map((wd) => ({ weekday: wd, share: weeklyShare(b, wd), netCore: weekDayShape(s.week, wd).netCore }));

    if ((type === "atLeast" || type === "exact") && ach < share) {
      const r = redistributeShortfall(share - ach, remaining);
      for (const d of r.deltas) adjust.push({ headId: b.headId, weekday: d.weekday, delta: d.delta });
      if (r.unplaced > 0) notes.push(`${fmtM(r.unplaced)} of “${b.headId}” could not be redistributed — reported as week-end shortfall.`);
    } else if (type === "exact" && ach > share) {
      const r = redistributeOvershoot(ach - share, remaining);
      for (const d of r.deltas) adjust.push({ headId: b.headId, weekday: d.weekday, delta: d.delta });
      if (r.unplaced > 0) notes.push(`“${b.headId}” overshot by ${fmtM(r.unplaced)} beyond what remaining days could absorb.`);
    }
  }
  return { adjust, notes };
}

/**
 * §5.1 Stage 6 — Pruning trims. `trims` name the share the user KEEPS for
 * today (post-redistribution); anything below the current effective share
 * becomes a `kind:"trim"` ledger entry (delta ≤ 0). Trims only reduce —
 * a request above the effective share is snapped down to it (no-op); below
 * zero snaps to 0. The cut never redistributes forward (the next SOD compares
 * achieved against the ALREADY-trimmed share) — it is the sticky deficit,
 * reported until week's end. Call with the redistribution ledger already
 * appended so "effective share" includes today's incoming pile-up.
 */
export function quotaTrimsAtPruning(
  week: WeekPlan,
  weekday: number,
  trims: { headId: string; shareMinutes: Min }[],
): { adjust: QuotaAdjustment[]; notes: string[] } {
  const adjust: QuotaAdjustment[] = [];
  const notes: string[] = [];
  const entries = budgetEntries(week);
  for (const t of trims) {
    const b = entries.find((e) => e.headId === t.headId && e.kind === "weekly");
    if (!b) continue;
    // at-least/exact only: at-most never accumulates (it never redistributes),
    // so a ceiling has no monster to trim — lowering one is a planning edit.
    if ((b.quotaType ?? "atLeast") === "atMost") continue;
    const share = weeklyShare(b, weekday);
    const kept = Math.min(Math.max(0, Math.round(t.shareMinutes)), share);
    if (kept >= share) continue; // trims only reduce; equal = no-op
    adjust.push({ headId: t.headId, weekday, delta: kept - share, kind: "trim" });
    notes.push(
      `Trimmed “${t.headId}” today to ${fmtM(kept)} — the ${fmtM(share - kept)} deficit stays visible (§5.1).`,
    );
  }
  return { adjust, notes };
}

export interface InjectionResult {
  tasks: UnstartedTask[];
  /** §11.7 spill: whole tasks that no longer fit their head's day budget —
   * the reducer pushes them to the NEXT day's dated adds, never drops them. */
  spilled: TaskSpec[];
  /** §4.4: ids of `once` templates that fired this injection — the reducer
   * marks them retired (`validity.firedOn = midnight`) so they never fire again.
   * The web's placement PREVIEW ignores this (it never retires). */
  firedOnceIds: string[];
  /**
   * Injected task id → the id of the **source** it was instantiated from (a
   * `WeekTemplate.id`, or a `DatedTask.id` for a §4.6 one-off add).
   *
   * Injection mints a FRESH id per task (`nextId()`), so an injected task's id is
   * NOT its template's. Anything that needs to get back to the source — the week
   * grid's click→edit, §4.6 skip/move — must map through here. Skipping this is
   * what made those three silently no-op (they compared a minted id against
   * `week.templates`, which never matches).
   */
  sourceIds: Record<string, string>;
  notes: string[];
}

/**
 * The unstarted tasks to inject for `weekday`, with anchors resolved to absolute
 * epoch minutes for the day starting at `midnight`. Ranks are assigned strictly
 * ABOVE `belowRank` (the lowest existing leftover rank) so injected tasks sit
 * below every surviving leftover (spec default, open-item 5). The reducer adds
 * these then settles/amputates.
 *
 * §11.7 budget honoring: templates are ordered by their HEAD's budget rank
 * (`week.budgets` array order, §11.5) first, template rank within a head, and
 * they draw down the head's resolved day budget in that order. A budgeted-
 * timing task that exceeds the remainder is trimmed to it (≥ minFragment) or
 * spilled whole to the next day. Pinned (fixed/semi/unscheduled) tasks draw
 * down but are never trimmed (§11.5 — not jostled). Heads without a budget
 * line are uncapped.
 */
export function injectTodayDetailed(
  s: State,
  midnight: Min,
  weekday: number,
  nextId: () => string,
  rankBelow: (prev: string | null) => string,
): InjectionResult {
  const notes: string[] = [];
  const spilled: TaskSpec[] = [];
  const raw = collectDue(s, midnight, weekday);
  // §4.4: `once` templates that fired this injection retire (reducer marks them).
  const firedOnceIds = raw.due.filter((t) => t.validity?.kind === "once").map((t) => t.id);
  // Head rank = position in week.budgets (§11.5); unbudgeted heads go last.
  const headIdx = new Map(s.week.budgets.map((b, i) => [b.headId, i] as const));
  const due = raw.due
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const ha = headIdx.get(a.t.headId) ?? Number.MAX_SAFE_INTEGER;
      const hb = headIdx.get(b.t.headId) ?? Number.MAX_SAFE_INTEGER;
      if (ha !== hb) return ha - hb;
      return a.i - b.i; // stable: template-rank order within a head
    })
    .map((x) => x.t);

  // Resolved day budget per head (weekly shares adjusted, % → minutes).
  const shape = weekDayShape(s.week, weekday);
  const remaining = new Map<string, Dur>();
  for (const l of shape.lines) if (headIdx.has(l.headId)) remaining.set(l.headId, l.minutes);

  const out: UnstartedTask[] = [];
  const sourceIds: Record<string, string> = {};
  let prevRank: string | null = null;
  /** `sourceId` = the WeekTemplate / DatedTask this task is instantiated FROM. */
  const push = (spec: TaskSpec, sourceId: string): void => {
    const rank = rankBelow(prevRank);
    prevRank = rank;
    const id = nextId();
    sourceIds[id] = sourceId;
    out.push(templateToTask(spec, midnight, id, rank));
  };

  for (const t of due) {
    const rem = remaining.get(t.headId);
    if (rem === undefined) {
      push(t, t.id);
      continue;
    }
    // §4.4: `end - start` went NEGATIVE for an overnight template (7am - 11pm =
    // -960), which credited quota back instead of spending it. `anchorSpan`
    // carries the day offset, so an 11pm→7am sleep costs its true 8h.
    const cost = t.budget ?? anchorSpan(t.anchorStartTod, t.anchorEndTod, t.anchorEndDayOffset) ?? 0;
    if (t.timing !== "budgeted" || cost <= rem) {
      remaining.set(t.headId, rem - cost);
      push(t, t.id);
      continue;
    }
    // Budgeted task over the head's remainder: trim to it, or spill whole.
    if (rem >= s.minFragment) {
      notes.push(`“${t.title}” trimmed to ${fmtM(rem)} — ${t.headId}'s day budget is drawn down in rank order.`);
      remaining.set(t.headId, 0);
      push({ ...t, budget: rem }, t.id);
      if (t.budget !== undefined && t.budget - rem >= s.minFragment) spilled.push({ ...t, budget: t.budget - rem });
    } else {
      notes.push(`“${t.title}” spilled to the next day — ${t.headId}'s day budget is exhausted.`);
      spilled.push(t);
    }
  }
  for (const d of raw.adds) push(d, d.id);
  return { tasks: out, spilled, firedOnceIds, sourceIds, notes };
}

/** Back-compat wrapper (the web's placement preview reads tasks only). */
export function injectToday(
  s: State,
  midnight: Min,
  weekday: number,
  nextId: () => string,
  rankBelow: (prev: string | null) => string,
): UnstartedTask[] {
  return injectTodayDetailed(s, midnight, weekday, nextId, rankBelow).tasks;
}

/** The recurring templates due for the day at `midnight` (OFF-day/skip/override
 * applied, template-rank order) plus the date's one-off adds (their own rank
 * order — always injected AFTER the templates). */
function collectDue(s: State, midnight: Min, weekday: number): { due: WeekTemplate[]; adds: DatedTask[] } {
  // §4.6: the dated override layer for THIS date (keyed by local-midnight).
  const entry = s.dated.find((e) => e.date === midnight);
  const skips = new Set(entry?.skips ?? []);
  const overrides = new Map((entry?.overrides ?? []).map((o) => [o.templateId, o] as const));

  // Recurring templates fire on their weekday — unless today is an OFF day
  // (rest: no recurring injection) or the template is skipped for this date.
  const isOff = s.week.offDays.includes(weekday);
  const due = isOff
    ? []
    : s.week.templates
        .filter((t) => t.weekdays.includes(weekday) && !skips.has(t.id) && templateValidOn(t, midnight))
        .slice()
        .sort(byRank)
        .map((t) => {
          const ov = overrides.get(t.id);
          return ov ? applyOverride(t, ov) : t;
        });
  // Dated one-offs fire regardless of OFF (you explicitly pinned them here).
  const adds = (entry?.adds ?? []).slice().sort(byRank);
  return { due, adds };
}

/**
 * §4.4 the span an anchored pair describes: `endDayOffset*1440 + end - start`.
 * THE one definition (§7.0.6) — the editor, the quota cost and the injector all
 * read it, so they cannot disagree about how long an overnight task is.
 *
 * `undefined` when it isn't a valid plan: never zero/negative, and never over 24h
 * (planning reaches no further). An END with `dayOffset: 1` at/before the start
 * is the overnight case (11pm → 7am = 8h).
 */
export function anchorSpan(
  startTod: number | undefined,
  endTod: number | undefined,
  endDayOffset: EndDayOffset = 0,
): Dur | undefined {
  if (startTod === undefined || endTod === undefined) return undefined;
  const raw = endDayOffset * MIN_PER_DAY + endTod - startTod;
  return raw > 0 && raw <= MIN_PER_DAY ? raw : undefined;
}

/** Instantiate one template/dated-task onto the day at `midnight`. Time-of-day
 * anchors (0..1439) become absolute. An END carrying `anchorEndDayOffset: 1`
 * lands on the NEXT day (§4.4 overnight) — it is NOT clamped back into the day,
 * which would silently drag an 11pm→7am sleep's end back to 23:59. Reads only the
 * shared TaskSpec fields, so a WeekTemplate and a DatedTask instantiate through
 * the identical path. */
export function templateToTask(
  t: TaskSpec,
  midnight: Min,
  id: string,
  rank: string,
): UnstartedTask {
  const abs = (tod: number): Min => midnight + Math.max(0, Math.min(MIN_PER_DAY - 1, tod));
  // §4.4: the end may legitimately sit on the next day; carry the offset rather
  // than clamping it into this one.
  const absEnd = (tod: number): Min => abs(tod) + (t.anchorEndDayOffset ?? 0) * MIN_PER_DAY;
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
    ...(t.anchorEndTod !== undefined ? { anchorEnd: absEnd(t.anchorEndTod) } : {}),
    ...(t.sleepKind !== undefined ? { sleepKind: t.sleepKind } : {}),
  };
  return task;
}
