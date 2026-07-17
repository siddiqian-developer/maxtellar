/**
 * Stage 2 — §11 data model: SET_BUDGETS (lock + coercion), SET_SLEEP_BUDGET
 * (sync + clamp), the START_WEEK 24h gate, the quotaAdjust week-instance
 * ledger, and the WeekPlan selectors.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  budgetEntries,
  weekBudgetValidity,
  weekDayShape,
  CORE_WORK,
  MAINTENANCE,
  SLEEP_ID,
  SELF_MANAGEMENT,
  MIN_PER_DAY,
  type HeadBudget,
  type State,
} from "../src/index.js";

const H = 60;
const DAY0 = 0;
const MON = 1;
const SUN = 0;
const WORKDAYS = [1, 2, 3, 4, 5];

const abs = (headId: string, categoryId: string, hours: number, weekdays = WORKDAYS): HeadBudget => ({
  headId,
  categoryId,
  kind: "absolute",
  minutes: hours * H,
  weekdays,
});

/** A balanced workday shape: Sleep 8h (default, real entry §11.4) + Chores 4h
 * + SM 2h + Deep 100%. Default offDays is Sunday only, so every OTHER
 * weekday — including Saturday — is "planned" and must balance too. */
const ALL_BUT_SUN = [1, 2, 3, 4, 5, 6];
const balanced: HeadBudget[] = [
  abs("Chores", MAINTENANCE, 4, ALL_BUT_SUN),
  abs(SELF_MANAGEMENT, CORE_WORK, 2, ALL_BUT_SUN),
  { headId: "Deep Work", categoryId: CORE_WORK, kind: "percent", pct: 100, weekdays: ALL_BUT_SUN },
];

describe("SET_BUDGETS (§11)", () => {
  // §11.4 (revised 2026-07-21): Sleep's real budget entry is always present —
  // SET_BUDGETS re-injects it if the caller's own list omits it (same guard
  // SET_WEEK_PLAN has for its template), so `balanced`'s 3 entries store as 4.
  it("replaces the budget set before a week starts", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "SET_BUDGETS", budgets: balanced, weekday: MON });
    expect(s.week.budgets).toHaveLength(4);
  });

  it("obeys the mid-week structural lock (OFF day / urgent bypass)", () => {
    let s = initialState(DAY0);
    // §11.2 gate: START_WEEK itself needs a balanced day to actually roll
    // over (Sleep alone isn't enough) — otherwise `startedAt` stays null and
    // the mid-week lock this test is about never actually engages.
    s = reduce(s, { type: "SET_BUDGETS", budgets: balanced, weekday: SUN });
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, offDays: [SUN] });
    const locked = reduce(s, { type: "SET_BUDGETS", budgets: balanced, weekday: MON });
    expect(locked.week.budgets).toHaveLength(4); // no-op — same as `s`, `balanced` already applied
    const off = reduce(s, { type: "SET_BUDGETS", budgets: balanced, weekday: SUN });
    expect(off.week.budgets).toHaveLength(4);
    const urgent = reduce(s, { type: "SET_BUDGETS", budgets: balanced, weekday: MON, urgent: true });
    expect(urgent.week.budgets).toHaveLength(4);
  });

  it("coerces an illegal percent (non-core / Self-Management) to absolute", () => {
    let s = initialState(DAY0);
    s = reduce(s, {
      type: "SET_BUDGETS",
      budgets: [
        { headId: "Cleaning", categoryId: MAINTENANCE, kind: "percent", pct: 50, weekdays: WORKDAYS },
        { headId: SELF_MANAGEMENT, categoryId: CORE_WORK, kind: "percent", pct: 10, weekdays: WORKDAYS },
      ],
      weekday: MON,
    });
    expect(s.week.budgets.every((b) => b.kind === "absolute")).toBe(true);
    expect(s.week.budgets.every((b) => b.pct === undefined)).toBe(true);
  });
});

describe("SET_SLEEP_BUDGET (§11.4 — one global value)", () => {
  it("updates the single source of truth (always allowed, even mid-week)", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, offDays: [SUN] });
    s = reduce(s, { type: "SET_SLEEP_BUDGET", minutes: 7 * H });
    expect(s.week.sleepMinutes).toBe(7 * H);
    // reflected in every day shape via the real Sleep budget entry (§11.4 revised 2026-07-21)
    const line = weekDayShape(s.week, MON).lines.find((l) => l.headId === SLEEP_ID);
    expect(line?.minutes).toBe(7 * H);
  });

  it("clamps to [0, 1440]", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "SET_SLEEP_BUDGET", minutes: 2000 });
    expect(s.week.sleepMinutes).toBe(1440);
    s = reduce(s, { type: "SET_SLEEP_BUDGET", minutes: -5 });
    expect(s.week.sleepMinutes).toBe(0);
  });
});

describe("START_WEEK 24h gate (§11.2)", () => {
  it("blocks the rollover while a planned weekday is unbalanced", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "SET_BUDGETS", budgets: [abs("Chores", MAINTENANCE, 4)], weekday: SUN });
    const blocked = reduce(s, { type: "START_WEEK", firstWeekday: MON, startedAt: DAY0 });
    expect(blocked.week.startedAt).toBeNull(); // 8h+4h ≠ 24h → no-op
  });

  it("starts when every planned weekday balances by construction", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "SET_BUDGETS", budgets: balanced, weekday: SUN });
    expect(weekBudgetValidity(s.week).ok).toBe(true);
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, startedAt: DAY0 });
    expect(s.week.startedAt).toBe(DAY0);
  });

  it("a fresh week (Sleep's own seed entry only) is NOT exempt — it must still balance (revised 2026-07-21)", () => {
    // §11.4: Sleep's real budget entry is always present, so "no budgets" no
    // longer exists as a state — the old blanket exemption (any week.budgets
    // === [] skipped the 24h gate entirely) is gone with it. A brand-new
    // week genuinely needs the rest of the day budgeted before it can start.
    let s = initialState(DAY0);
    expect(s.week.budgets).toHaveLength(1); // Sleep only
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, startedAt: DAY0 });
    expect(s.week.startedAt).toBeNull(); // blocked — Sleep alone ≠ 24h
  });
});

describe("quotaAdjust ledger (§5.1 / §11.7)", () => {
  const weekly: HeadBudget = {
    headId: "Job Search",
    categoryId: CORE_WORK,
    kind: "weekly",
    quotaMinutes: 10 * H,
    quotaType: "atLeast",
    weekdays: WORKDAYS,
  };

  it("folds into effective shares without touching stored budgets", () => {
    const s: State = { ...initialState(DAY0) };
    const week = {
      ...s.week,
      budgets: [weekly],
      quotaAdjust: [{ headId: "Job Search", weekday: 4, delta: 30 }],
    };
    const entries = budgetEntries(week);
    const js = entries.find((b) => b.headId === "Job Search")!;
    expect(js.shares?.[4]).toBe(2 * H + 30); // even 2h + 30m adjustment
    expect(js.shares?.[2]).toBe(2 * H);
    expect(week.budgets[0]!.shares).toBeUndefined(); // template untouched
  });

  it("is reset by START_WEEK (per week instance)", () => {
    let s = initialState(DAY0);
    s = {
      ...s,
      week: {
        ...s.week,
        // Balances every non-Sunday day alongside Sleep's 8h seed entry, so
        // START_WEEK's own 24h gate actually lets the rollover through here
        // (this test is about the quotaAdjust reset, not the gate itself).
        budgets: [...s.week.budgets, abs("Chores", MAINTENANCE, 16, ALL_BUT_SUN)],
        quotaAdjust: [{ headId: "Job Search", weekday: 4, delta: 30 }],
      },
    };
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, startedAt: DAY0 });
    expect(s.week.quotaAdjust).toEqual([]);
  });
});

describe("weekBudgetValidity (§11.2 gate selector)", () => {
  it("reports the first failing weekday", () => {
    const s = initialState(DAY0);
    // Sleep's own seed entry (8h) rides along — kept explicit here (rather
    // than relying on the initialState default) so the expected delta below
    // stays self-evident from the fixture alone.
    const week = { ...s.week, budgets: [...s.week.budgets, abs("Chores", MAINTENANCE, 4, [MON])] };
    const v = weekBudgetValidity(week);
    expect(v.ok).toBe(false);
    expect(v.firstBad?.weekday).toBe(MON);
    expect(v.firstBad?.delta).toBe(MIN_PER_DAY - 12 * H);
  });

  it("OFF days are exempt from the gate", () => {
    const s = initialState(DAY0);
    const week = { ...s.week, offDays: [MON], budgets: [abs("Chores", MAINTENANCE, 4, [MON])] };
    expect(weekBudgetValidity(week).ok).toBe(true);
  });
});
