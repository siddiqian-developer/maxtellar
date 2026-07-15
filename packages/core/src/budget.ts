/**
 * Time budgeting — the Category tier + 24h zero-sum day-shape math (§11, §5.1).
 * Pure, Date-free, integer minutes. Stage 1: math only — no events/reducer wiring.
 *
 * Model (locked 2026-07-16):
 *  - Each budgeted head is EITHER daily (absolute minutes; or % of netCore when
 *    its Category is Core Work) OR weekly (quota minutes + at-least/at-most/
 *    exact type, projected as per-weekday shares — default even split).
 *  - A day's plan must sum to EXACTLY 1440 (the 24h gate, §11.2). Weekly shares
 *    count as ordinary absolute lines in that day's sum.
 *  - netCore = 1440 − Sleep − Σ(non-core absolute+weekly shares) − Self-Management.
 *    % is literally % of netCore; absolute Core heads claim from the same
 *    envelope: Σ(absolute core) + Σ(pct)/100 × netCore === netCore (§11.3).
 *  - Quota shortfall redistributes over remaining days weighted by availability
 *    (netCore − existing share), then original shape; the %-residual absorbs it.
 */

import { SELF_MANAGEMENT, type Dur, type WeekPlan } from "./types.js";

export const MIN_PER_DAY = 1440;

/** §11.1 Category tier (names locked 2026-07-16). */
export const CORE_WORK = "Core Work";
export const MAINTENANCE = "Maintenance";
export const NOT_WORK = "Not Work";
export const TIME_WASTED = "Time Wasted";
export const CATEGORIES = [CORE_WORK, MAINTENANCE, NOT_WORK, TIME_WASTED] as const;

/** §11.4 Sleep — the head of the day. A first-class budget line (stored as
 * `week.sleepMinutes`, synced with Settings) rendered under its own pseudo-
 * category so Category roll-ups stay honest (it is not a Maintenance head). */
export const SLEEP_HEAD = "Sleep";
export const SLEEP_CATEGORY = "Sleep";

export type QuotaType = "atLeast" | "atMost" | "exact"; // §5.1 (exact was "neutral")
export type BudgetKind = "absolute" | "percent" | "weekly";

/** One budgeted head — the math-level shape (Stage 2 wires it into State). */
export interface HeadBudget {
  headId: string;
  categoryId: string;
  kind: BudgetKind;
  /** absolute: per-day minutes (same every planned weekday). */
  minutes?: Dur;
  /** percent: % of netCore (Core Work only, never Self-Management). May be fractional. */
  pct?: number;
  /** weekly: the week's quota in minutes + its type. */
  quotaMinutes?: Dur;
  quotaType?: QuotaType;
  /** weekly: per-weekday share override; missing weekdays use the even split. */
  shares?: Record<number, Dur>;
  /** absolute: per-weekday minutes override (§11.2 "each weekday may carry a
   * different shape"); missing weekdays use `minutes`. */
  perDay?: Record<number, Dur>;
  /** Weekdays (0=Sun…6=Sat) this head participates in. */
  weekdays: number[];
}

/** §5.1 redistribution ledger — a week-instance share adjustment for a weekly-
 * quota head. Lives OUTSIDE the head budget (the reusable template is never
 * mutated, §11.7); reset at START_WEEK. */
export interface QuotaAdjustment {
  headId: string;
  weekday: number;
  delta: Dur;
}

const EPS = 1e-6;

/* ----------------------------- weekly shares ----------------------------- */

/** Even integer split of a weekly quota over its weekdays; the first
 * `quota % n` weekdays (ascending) carry the extra minute. Deterministic. */
export function evenShares(quotaMinutes: Dur, weekdays: number[]): Record<number, Dur> {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  const out: Record<number, Dur> = {};
  if (days.length === 0) return out;
  const base = Math.floor(quotaMinutes / days.length);
  let extra = quotaMinutes - base * days.length;
  for (const d of days) out[d] = base + (extra-- > 0 ? 1 : 0);
  return out;
}

/** A weekly head's share on `weekday` (0 when not planned there). */
export function weeklyShare(b: HeadBudget, weekday: number): Dur {
  if (!b.weekdays.includes(weekday)) return 0;
  const explicit = b.shares?.[weekday];
  if (explicit !== undefined) return explicit;
  return evenShares(b.quotaMinutes ?? 0, b.weekdays)[weekday] ?? 0;
}

/** The FIXED (non-percent) minutes a head claims on `weekday`. Percent heads
 * return 0 here — their minutes come out of the resolved day shape. */
export function fixedShare(b: HeadBudget, weekday: number): Dur {
  if (!b.weekdays.includes(weekday)) return 0;
  if (b.kind === "absolute") return b.perDay?.[weekday] ?? b.minutes ?? 0;
  if (b.kind === "weekly") return weeklyShare(b, weekday);
  return 0;
}

/* ------------------------- subtraction chain (§11.3) ------------------------ */

const isCore = (b: HeadBudget): boolean => b.categoryId === CORE_WORK;
const isSelfMgmt = (b: HeadBudget): boolean => b.headId === SELF_MANAGEMENT;

/** netCore = 1440 − Σ(non-core fixed shares, Sleep included as an ordinary
 * absolute line) − Self-Management. Clamped ≥ 0 (an over-committed overhead
 * yields 0 elastic residual; the 24h gate reports the breach). */
export function netCore(entries: HeadBudget[], weekday: number): Dur {
  let overhead = 0;
  for (const b of entries) {
    if (!isCore(b) || isSelfMgmt(b)) overhead += fixedShare(b, weekday);
  }
  return Math.max(0, MIN_PER_DAY - overhead);
}

/** Largest-remainder apportionment of percent entries against `pool` minutes:
 * real_i = pct_i/100 × pool, integerized to sum to round(Σ real_i). */
function apportionPercents(pcts: number[], pool: Dur): Dur[] {
  const real = pcts.map((p) => (p / 100) * pool);
  const target = Math.round(real.reduce((a, b) => a + b, 0));
  const floors = real.map(Math.floor);
  let left = target - floors.reduce((a, b) => a + b, 0);
  const order = real
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = floors.slice();
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

/* ---------------------------- resolved day shape --------------------------- */

/** One head's resolved line in a day shape. */
export interface DayLine {
  headId: string;
  categoryId: string;
  kind: BudgetKind;
  /** Resolved minutes this head claims on the day. */
  minutes: Dur;
  /** Echoed for percent lines (the % text always stays shown, §11.3). */
  pct?: number;
}

/** The core-envelope fit (§11.3):
 * Σ(absolute core) + Σ(pct)/100 × netCore === netCore, i.e. pctSum === requiredPctSum. */
export interface CoreFit {
  netCore: Dur;
  /** Fixed core claims (absolute core heads + weekly core shares), Self-Management excluded. */
  absCore: Dur;
  pctSum: number;
  /** The Σpct that would exactly fill the envelope: 100 × (netCore − absCore) / netCore. */
  requiredPctSum: number;
  ok: boolean;
}

export interface CategoryTotal {
  categoryId: string;
  minutes: Dur;
  /** Explicit target (§11.6) — present only when the user typed one. */
  target?: Dur;
  /** true when no target, or when minutes === target. */
  ok: boolean;
}

export interface DayShape {
  weekday: number;
  lines: DayLine[];
  netCore: Dur;
  coreFit: CoreFit;
  /** Σ of all lines (incl. Sleep). The 24h gate: ok ⇔ total === 1440. */
  total: Dur;
  /** 1440 − total: >0 → "needs X more", <0 → over by X, 0 → balanced. */
  delta: Dur;
  ok: boolean;
  categories: CategoryTotal[];
}

/**
 * Resolve one weekday's shape: fixed shares as-is, percent heads apportioned
 * against netCore (largest remainder — when the core fit holds, percent minutes
 * sum to exactly netCore − absCore, so the day balances by construction).
 * `targets` are the explicit per-Category hard fits (§11.6).
 */
export function resolveDay(
  entries: HeadBudget[],
  weekday: number,
  targets?: Record<string, Dur>,
): DayShape {
  const active = entries.filter((b) => b.weekdays.includes(weekday));
  const nc = netCore(entries, weekday);

  const pctEntries = active.filter((b) => b.kind === "percent");
  const pctMinutes = apportionPercents(pctEntries.map((b) => b.pct ?? 0), nc);

  const lines: DayLine[] = active.map((b) => {
    if (b.kind === "percent") {
      const i = pctEntries.indexOf(b);
      return { headId: b.headId, categoryId: b.categoryId, kind: b.kind, minutes: pctMinutes[i] ?? 0, pct: b.pct ?? 0 };
    }
    return { headId: b.headId, categoryId: b.categoryId, kind: b.kind, minutes: fixedShare(b, weekday) };
  });

  const absCore = active
    .filter((b) => isCore(b) && !isSelfMgmt(b) && b.kind !== "percent")
    .reduce((a, b) => a + fixedShare(b, weekday), 0);
  const pctSum = pctEntries.reduce((a, b) => a + (b.pct ?? 0), 0);
  const requiredPctSum = nc > 0 ? (100 * (nc - absCore)) / nc : 0;
  const coreFit: CoreFit = {
    netCore: nc,
    absCore,
    pctSum,
    requiredPctSum,
    // With no % heads there is no %-layer constraint — the 24h gate covers it.
    ok: pctEntries.length === 0 || Math.abs(pctSum - requiredPctSum) < EPS,
  };

  const total = lines.reduce((a, l) => a + l.minutes, 0);
  const byCat = new Map<string, Dur>();
  for (const l of lines) byCat.set(l.categoryId, (byCat.get(l.categoryId) ?? 0) + l.minutes);
  const categories: CategoryTotal[] = [...byCat.entries()].map(([categoryId, minutes]) => {
    const target = targets?.[categoryId];
    return { categoryId, minutes, ...(target !== undefined ? { target } : {}), ok: target === undefined || minutes === target };
  });

  return { weekday, lines, netCore: nc, coreFit, total, delta: MIN_PER_DAY - total, ok: total === MIN_PER_DAY, categories };
}

/* ------------------------------- snap targets ------------------------------ */
/* Snap-at-entry (§11.10.6): given a breach, compute the value that restores the
 * fit for the entry just edited; the caller snaps + notifies + flashes. */

/** The absolute/weekly-share minutes for `headId` on `weekday` that would make
 * the day total exactly 1440. Clamped ≥ 0; null when the head has no line. */
export function snapTo24h(entries: HeadBudget[], weekday: number, headId: string): Dur | null {
  const shape = resolveDay(entries, weekday);
  const line = shape.lines.find((l) => l.headId === headId);
  if (!line) return null;
  return Math.max(0, line.minutes + shape.delta);
}

/** The pct for `headId` that restores the core-envelope fit (§11.3). Clamped
 * to [0,100]; null when the head isn't a percent line on the day. */
export function snapPctToCoreFit(entries: HeadBudget[], weekday: number, headId: string): number | null {
  const active = entries.filter((b) => b.weekdays.includes(weekday));
  const edited = active.find((b) => b.headId === headId && b.kind === "percent");
  if (!edited) return null;
  const shape = resolveDay(entries, weekday);
  const others = shape.coreFit.pctSum - (edited.pct ?? 0);
  return Math.min(100, Math.max(0, shape.coreFit.requiredPctSum - others));
}

/** The minutes for `headId` that make its Category total exactly `target`
 * (§11.6 hard fit). Clamped ≥ 0; null when the head has no line that day. */
export function snapToCategoryTarget(
  entries: HeadBudget[],
  weekday: number,
  headId: string,
  target: Dur,
): Dur | null {
  const shape = resolveDay(entries, weekday);
  const line = shape.lines.find((l) => l.headId === headId);
  if (!line) return null;
  const cat = shape.categories.find((c) => c.categoryId === line.categoryId);
  if (!cat) return null;
  return Math.max(0, line.minutes + (target - cat.minutes));
}

/* --------------------------- redistribution (§5.1) -------------------------- */

/** A remaining day of the week, as redistribution sees it. */
export interface RemainingDay {
  weekday: number;
  /** The quota head's existing share on this day. */
  share: Dur;
  /** The day's netCore — its elastic capacity is netCore − share. */
  netCore: Dur;
}

export interface Redistribution {
  /** Per-weekday share change (positive for shortfall, negative for overshoot). */
  deltas: { weekday: number; delta: Dur }[];
  /** Minutes that found no home (capacity exhausted / shares hit 0). Reported,
   * never silently dropped — the week-end shortfall report picks these up. */
  unplaced: Dur;
}

/** Integerize non-negative real allocations to sum to `total`, respecting
 * integer `caps` (largest-remainder; ties by index). */
function integerize(real: number[], total: Dur, caps: number[]): Dur[] {
  const out = real.map((r, i) => Math.min(caps[i] ?? 0, Math.floor(r)));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = real
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  while (left > 0) {
    let placed = false;
    for (const { i } of order) {
      if (left <= 0) break;
      if ((out[i] ?? 0) < (caps[i] ?? 0)) {
        out[i] = (out[i] ?? 0) + 1;
        left -= 1;
        placed = true;
      }
    }
    if (!placed) break;
  }
  return out;
}

/**
 * §5.1 shortfall redistribution (at-least / exact): spread `shortfall` minutes
 * over the remaining days. Weights: availability (netCore − share) first; when
 * every availability is equal, the original shape (existing shares); even as the
 * last resort. Each day absorbs at most its availability (the %-residual is the
 * shock absorber — a share can't outgrow the elastic envelope).
 */
export function redistributeShortfall(shortfall: Dur, days: RemainingDay[]): Redistribution {
  if (shortfall <= 0 || days.length === 0) return { deltas: [], unplaced: Math.max(0, shortfall) };
  const avail = days.map((d) => Math.max(0, d.netCore - d.share));
  const capacity = avail.reduce((a, b) => a + b, 0);
  const placeable = Math.min(shortfall, capacity);

  const allEqual = avail.every((a) => a === avail[0]);
  let weights: number[];
  if (!allEqual) weights = avail;
  else {
    const shareSum = days.reduce((a, d) => a + d.share, 0);
    weights = shareSum > 0 ? days.map((d) => d.share) : days.map(() => 1);
  }
  // Water-fill: proportional by weight, capped at availability, re-spreading
  // any capped excess among the days that still have room.
  const alloc = days.map(() => 0);
  let remaining = placeable;
  let activeIdx = days.map((_, i) => i).filter((i) => (avail[i] ?? 0) > 0);
  while (remaining > EPS && activeIdx.length > 0) {
    const wSum = activeIdx.reduce((a, i) => a + (weights[i] ?? 0), 0);
    const next: number[] = [];
    let progressed = false;
    for (const i of activeIdx) {
      const want = wSum > 0 ? (remaining * (weights[i] ?? 0)) / wSum : remaining / activeIdx.length;
      const room = (avail[i] ?? 0) - (alloc[i] ?? 0);
      const take = Math.min(want, room);
      alloc[i] = (alloc[i] ?? 0) + take;
      if (take > EPS) progressed = true;
      if ((avail[i] ?? 0) - (alloc[i] ?? 0) > EPS) next.push(i);
    }
    remaining = placeable - alloc.reduce((a, b) => a + b, 0);
    activeIdx = next;
    if (!progressed) break;
  }
  const ints = integerize(alloc, placeable, avail);
  return {
    deltas: days.map((d, i) => ({ weekday: d.weekday, delta: ints[i] ?? 0 })).filter((d) => d.delta !== 0),
    unplaced: shortfall - ints.reduce((a, b) => a + b, 0),
  };
}

/**
 * §5.1 exact-match overshoot: reduce remaining days' shares by `overshoot`
 * minutes, proportional to the original shape (existing shares), clamped ≥ 0.
 * at-least never calls this (overshoot is fine); at-most never redistributes.
 */
export function redistributeOvershoot(overshoot: Dur, days: RemainingDay[]): Redistribution {
  if (overshoot <= 0 || days.length === 0) return { deltas: [], unplaced: Math.max(0, overshoot) };
  const caps = days.map((d) => Math.max(0, d.share));
  const capacity = caps.reduce((a, b) => a + b, 0);
  const placeable = Math.min(overshoot, capacity);
  const weights = capacity > 0 ? caps : days.map(() => 1);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const real = days.map((_, i) => (wSum > 0 ? (placeable * (weights[i] ?? 0)) / wSum : 0));
  // Proportional cut can't exceed a day's own share when weighted by shares,
  // but integerize guards the cap regardless.
  const ints = integerize(real, placeable, caps);
  return {
    deltas: days.map((d, i) => ({ weekday: d.weekday, delta: -(ints[i] ?? 0) })).filter((d) => d.delta !== 0),
    unplaced: overshoot - ints.reduce((a, b) => a + b, 0),
  };
}

/* --------------------------- week-plan selectors ---------------------------- */
/* Pure views over WeekPlan — the reducer and the web both read through these. */

/** The Sleep budget as an ordinary absolute line (§11.4). */
export function sleepEntry(minutes: Dur): HeadBudget {
  return {
    headId: SLEEP_HEAD,
    categoryId: SLEEP_CATEGORY,
    kind: "absolute",
    minutes,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };
}

/** The full budget-entry list for a week: Sleep + head budgets, with the §5.1
 * redistribution ledger folded into weekly heads' effective shares (the stored
 * budgets — the reusable template — stay untouched, §11.7). */
export function budgetEntries(week: WeekPlan): HeadBudget[] {
  const adjusted = week.budgets.map((b) => {
    if (b.kind !== "weekly") return b;
    const deltas = week.quotaAdjust.filter((q) => q.headId === b.headId);
    if (deltas.length === 0) return b;
    const shares: Record<number, Dur> = {};
    for (const wd of b.weekdays) {
      const base = weeklyShare(b, wd);
      const delta = deltas.filter((q) => q.weekday === wd).reduce((a, q) => a + q.delta, 0);
      shares[wd] = Math.max(0, base + delta);
    }
    return { ...b, shares };
  });
  return [sleepEntry(week.sleepMinutes), ...adjusted];
}

/** One weekday's resolved shape for a week plan (targets = §11.6 hard fits). */
export function weekDayShape(week: WeekPlan, weekday: number): DayShape {
  return resolveDay(budgetEntries(week), weekday, week.categoryTargets);
}

export interface WeekBudgetValidity {
  ok: boolean;
  /** Shapes for every planned (non-OFF, budget-bearing) weekday, in weekday order. */
  days: DayShape[];
  /** The first failing weekday, when !ok (drives the gate indicator). */
  firstBad?: DayShape;
}

/** §11.2 planning gate: every planned weekday must resolve to exactly 24h with
 * the core fit and every explicit Category target holding. A week with NO head
 * budgets is exempt (the §4.4 "three realities" — planning may not happen). */
export function weekBudgetValidity(week: WeekPlan): WeekBudgetValidity {
  if (week.budgets.length === 0) return { ok: true, days: [] };
  const planned = [...new Set(week.budgets.flatMap((b) => b.weekdays))]
    .filter((wd) => !week.offDays.includes(wd))
    .sort((a, b) => a - b);
  const days = planned.map((wd) => weekDayShape(week, wd));
  const bad = days.find((d) => !d.ok || !d.coreFit.ok || d.categories.some((c) => !c.ok));
  return { ok: !bad, days, ...(bad ? { firstBad: bad } : {}) };
}
