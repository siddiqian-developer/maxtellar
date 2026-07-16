/**
 * Stage 6 — §5.1 quota trim during Pruning. Covers: the pure trim helper
 * (reduce-only with clamps, kind:"trim" ledger entries, deficit notes),
 * the sticky-deficit accessor, PRUNING_DONE applying trims AFTER the
 * redistribution pile-up, and the invariant that a trimmed share never
 * redistributes forward at the next SOD (the deficit dies at week's end).
 */
import { describe, it, expect } from "vitest";
import {
  budgetEntries,
  initialState,
  quotaAdjustmentsAtSod,
  quotaTrimsAtPruning,
  reduce,
  trimDeficit,
  weeklyShare,
  CORE_WORK,
  MAINTENANCE,
  type HeadBudget,
  type State,
} from "../src/index.js";

const H = 60;
const DAY0 = 0;
const MON = 1;
const TUE = 2;
const WED = 3;
const SUN = 0;
const WORKDAYS = [1, 2, 3, 4, 5];

const abs = (headId: string, categoryId: string, hours: number, weekdays = WORKDAYS): HeadBudget => ({
  headId,
  categoryId,
  kind: "absolute",
  minutes: hours * H,
  weekdays,
});

const jobSearch: HeadBudget = {
  headId: "Job",
  categoryId: CORE_WORK,
  kind: "weekly",
  quotaMinutes: 10 * H, // 2h/day over Mon–Fri
  quotaType: "atLeast",
  weekdays: WORKDAYS,
};

function withWeek(now: number, week: Partial<State["week"]>): State {
  const s = initialState(now);
  return { ...s, week: { ...s.week, startedAt: DAY0, firstWeekday: MON, offDays: [SUN], ...week } };
}

/** Monday sealed with `achievedMin` of Job against its 2h share. */
function sealedMonday(achievedMin: number): State {
  const base = withWeek(DAY0 + 30 * H, {
    budgets: [abs("Chores", MAINTENANCE, 4), jobSearch],
  });
  return {
    ...base,
    days: [{ id: "d1", start: DAY0, end: DAY0 + 24 * H, reportDate: DAY0 }],
    history: achievedMin > 0
      ? [{ id: "h1", taskId: null, title: "Job hunt", headId: "Job", activityId: "Job", kind: "occupancy", start: DAY0 + 9 * H, end: DAY0 + 9 * H + achievedMin, outcome: "completed", channels: { spent: achievedMin, wasted: 0, managed: 0, breaks: 0 } }]
      : [],
  };
}

const effShare = (s: State, headId: string, weekday: number): number =>
  weeklyShare(budgetEntries(s.week).find((b) => b.headId === headId)!, weekday);

describe("quotaTrimsAtPruning (§5.1 Stage 6)", () => {
  const week = withWeek(DAY0 + 30 * H, { budgets: [jobSearch] }).week;

  it("cuts today's share to the kept value with a kind:'trim' ledger entry", () => {
    const { adjust, notes } = quotaTrimsAtPruning(week, TUE, [{ headId: "Job", shareMinutes: 30 }]);
    expect(adjust).toEqual([{ headId: "Job", weekday: TUE, delta: 30 - 120, kind: "trim" }]);
    expect(notes[0]).toContain("deficit stays visible");
  });

  it("only reduces: a kept value at/above the share is a no-op", () => {
    expect(quotaTrimsAtPruning(week, TUE, [{ headId: "Job", shareMinutes: 120 }]).adjust).toEqual([]);
    expect(quotaTrimsAtPruning(week, TUE, [{ headId: "Job", shareMinutes: 500 }]).adjust).toEqual([]);
  });

  it("clamps a negative kept value to 0 (full trim)", () => {
    const { adjust } = quotaTrimsAtPruning(week, TUE, [{ headId: "Job", shareMinutes: -50 }]);
    expect(adjust).toEqual([{ headId: "Job", weekday: TUE, delta: -120, kind: "trim" }]);
  });

  it("ignores heads that are not weekly quotas", () => {
    const w = withWeek(DAY0, { budgets: [abs("Chores", MAINTENANCE, 4), jobSearch] }).week;
    expect(quotaTrimsAtPruning(w, TUE, [{ headId: "Chores", shareMinutes: 0 }]).adjust).toEqual([]);
  });
});

describe("trimDeficit (sticky visible deficit)", () => {
  it("sums only trim entries, as positive minutes", () => {
    const w = withWeek(DAY0, { budgets: [jobSearch] }).week;
    const week = {
      ...w,
      quotaAdjust: [
        { headId: "Job", weekday: TUE, delta: 30 }, // redistribution — not deficit
        { headId: "Job", weekday: TUE, delta: -90, kind: "trim" as const },
        { headId: "Job", weekday: WED, delta: -30, kind: "trim" as const },
      ],
    };
    expect(trimDeficit(week, "Job")).toBe(120);
    expect(trimDeficit(week, "Chores")).toBe(0);
  });
});

describe("PRUNING_DONE applies trims after redistribution (§5.1)", () => {
  it("trims the POST-redistribution share; effective share = kept; deficit visible", () => {
    // Monday sealed 1h short → Tuesday's share swells above the 2h base.
    const s0: State = { ...sealedMonday(60), ceremony: { phase: "pruning" } };
    const swollen = (() => {
      const { adjust } = quotaAdjustmentsAtSod(s0, DAY0 + 1440, TUE);
      const w = { ...s0.week, quotaAdjust: adjust };
      return weeklyShare(budgetEntries(w).find((b) => b.headId === "Job")!, TUE);
    })();
    expect(swollen).toBeGreaterThan(120);

    const s = reduce(s0, {
      type: "PRUNING_DONE",
      inject: { midnight: DAY0 + 1440, weekday: TUE },
      quotaTrims: [{ headId: "Job", shareMinutes: 90 }],
    });
    expect(effShare(s, "Job", TUE)).toBe(90);
    expect(trimDeficit(s.week, "Job")).toBe(swollen - 90);
    expect(s.notice?.text).toContain("Trimmed");
    // Stored budgets untouched — the reusable template is never mutated.
    expect(s.week.budgets.find((b) => b.headId === "Job")!.shares).toBeUndefined();
  });

  it("a trimmed share never redistributes forward at the next SOD", () => {
    // Tuesday's share trimmed 120 → 60; the day then achieves exactly 60.
    const base = withWeek(DAY0 + 54 * H, { budgets: [jobSearch] });
    const s: State = {
      ...base,
      week: { ...base.week, quotaAdjust: [{ headId: "Job", weekday: TUE, delta: -60, kind: "trim" }] },
      days: [{ id: "d2", start: DAY0 + 1440, end: DAY0 + 2 * 1440, reportDate: DAY0 + 1440 }],
      history: [{ id: "h2", taskId: null, title: "Job hunt", headId: "Job", activityId: "Job", kind: "occupancy", start: DAY0 + 1440 + 9 * H, end: DAY0 + 1440 + 10 * H, outcome: "completed", channels: { spent: 60, wasted: 0, managed: 0, breaks: 0 } }],
    };
    // Sealed day = Tuesday, today = Wednesday: 60 achieved vs trimmed share 60 → no shortfall.
    const { adjust } = quotaAdjustmentsAtSod(s, DAY0 + 2 * 1440, WED);
    expect(adjust).toEqual([]);
    expect(trimDeficit(s.week, "Job")).toBe(60); // …but the deficit stays visible
  });
});
