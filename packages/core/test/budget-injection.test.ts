/**
 * Stage 4 — §11.7 SOD injection honoring head budgets/rank + §5.1
 * redistribution at SOD + spill-to-next-day. Covers: head-rank ordering,
 * budget draw-down in rank order (trim / spill), pinned timings never
 * trimmed, redistribution ledger appended from a sealed day's shortfall,
 * and the exact-overshoot trim.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  injectTodayDetailed,
  quotaAdjustmentsAtSod,
  CORE_WORK,
  MAINTENANCE,
  type HeadBudget,
  type State,
  type WeekTemplate,
} from "../src/index.js";

const H = 60;
const DAY0 = 0;
const MON = 1;
const TUE = 2;
const WED = 3;
const SUN = 0;
const WORKDAYS = [1, 2, 3, 4, 5];

function tpl(over: Partial<WeekTemplate> & { title: string; weekdays: number[] }): WeekTemplate {
  return {
    id: over.id ?? over.title,
    rank: over.rank ?? "m",
    headId: "Work",
    activityId: "Coding",
    timing: "budgeted",
    tier: "normal",
    ommf: false,
    slideable: true,
    breakable: true,
    ...over,
  } as WeekTemplate;
}

const abs = (headId: string, categoryId: string, hours: number, weekdays = WORKDAYS): HeadBudget => ({
  headId,
  categoryId,
  kind: "absolute",
  minutes: hours * H,
  weekdays,
});

function withWeek(now: number, week: Partial<State["week"]>): State {
  const s = initialState(now);
  return { ...s, week: { ...s.week, startedAt: DAY0, firstWeekday: MON, offDays: [SUN], ...week } };
}

const inject = (s: State, weekday = MON) => {
  let n = 0;
  let prev: string | null = null;
  return injectTodayDetailed(s, DAY0, weekday, () => `i${++n}`, () => `r${String(++n).padStart(3, "0")}${(prev = "x")}`);
};

describe("injection order honors head rank (§11.5/§11.7)", () => {
  it("orders by week.budgets array position, template rank within a head", () => {
    const s = withWeek(DAY0 + 8 * H, {
      templates: [
        tpl({ title: "B1", headId: "B", budget: 30, weekdays: [MON], rank: "a" }),
        tpl({ title: "A2", headId: "A", budget: 30, weekdays: [MON], rank: "b" }),
        tpl({ title: "A1", headId: "A", budget: 30, weekdays: [MON], rank: "a2" }),
        tpl({ title: "NoBudgetHead", headId: "Z", budget: 30, weekdays: [MON], rank: "0" }),
      ],
      budgets: [abs("A", CORE_WORK, 4, [MON]), abs("B", MAINTENANCE, 4, [MON])],
    });
    const r = inject(s);
    expect(r.tasks.map((t) => t.title)).toEqual(["A1", "A2", "B1", "NoBudgetHead"]);
  });
});

describe("budget draw-down: trim and spill (§11.7)", () => {
  it("trims the overflowing budgeted task to the head's remainder and spills the rest", () => {
    const s = withWeek(DAY0 + 8 * H, {
      templates: [
        tpl({ title: "First", headId: "A", budget: 90, weekdays: [MON], rank: "a" }),
        tpl({ title: "Second", headId: "A", budget: 60, weekdays: [MON], rank: "b" }),
      ],
      budgets: [abs("A", CORE_WORK, 2, [MON])], // 120m for head A
    });
    const r = inject(s);
    const second = r.tasks.find((t) => t.title === "Second")!;
    expect(second.budget).toBe(30); // 120 − 90 remainder
    expect(r.spilled).toHaveLength(1); // the trimmed-off 30m
    expect(r.spilled[0]!.budget).toBe(30);
    expect(r.notes.some((n) => n.includes("trimmed"))).toBe(true);
  });

  it("spills a task whole when the head budget is exhausted", () => {
    const s = withWeek(DAY0 + 8 * H, {
      templates: [
        tpl({ title: "First", headId: "A", budget: 2 * H, weekdays: [MON], rank: "a" }),
        tpl({ title: "Doesn't fit", headId: "A", budget: 60, weekdays: [MON], rank: "b" }),
      ],
      budgets: [abs("A", CORE_WORK, 2, [MON])],
    });
    const r = inject(s);
    expect(r.tasks.map((t) => t.title)).toEqual(["First"]);
    expect(r.spilled.map((t) => t.title)).toEqual(["Doesn't fit"]);
  });

  it("never trims pinned timings (fixed sits at its clock)", () => {
    const s = withWeek(DAY0 + 8 * H, {
      templates: [
        tpl({ title: "Meeting", headId: "A", timing: "fixed", anchorStartTod: 9 * H, anchorEndTod: 12 * H, budget: 3 * H, weekdays: [MON] }),
      ],
      budgets: [abs("A", CORE_WORK, 1, [MON])], // far under the meeting
    });
    const r = inject(s);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0]!.budget).toBe(3 * H);
    expect(r.spilled).toHaveLength(0);
  });
});

describe("PRUNING_DONE wires spill to the next day's dated adds", () => {
  it("spilled tasks land as dated one-offs on midnight+1440", () => {
    const s0: State = {
      ...withWeek(DAY0 + 8 * H, {
        templates: [
          tpl({ title: "First", headId: "A", budget: 2 * H, weekdays: [MON], rank: "a" }),
          tpl({ title: "Overflow", headId: "A", budget: 60, weekdays: [MON], rank: "b" }),
        ],
        budgets: [abs("A", CORE_WORK, 2, [MON])],
      }),
      ceremony: { phase: "pruning" },
    };
    const s = reduce(s0, { type: "PRUNING_DONE", inject: { midnight: DAY0, weekday: MON } });
    const tomorrow = s.dated.find((e) => e.date === DAY0 + 1440);
    expect(tomorrow?.adds.map((a) => a.title)).toEqual(["Overflow"]);
    expect(s.notice?.text).toContain("spilled");
  });
});

describe("quota redistribution at SOD (§5.1)", () => {
  const jobSearch: HeadBudget = {
    headId: "Job",
    categoryId: CORE_WORK,
    kind: "weekly",
    quotaMinutes: 10 * H,
    quotaType: "atLeast",
    weekdays: WORKDAYS, // 2h/day
  };

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

  it("at-least shortfall spreads forward over remaining weekdays", () => {
    // Monday sealed with 1h of a 2h share → 1h shortfall over Tue–Fri.
    const s = sealedMonday(60);
    const { adjust, notes } = quotaAdjustmentsAtSod(s, DAY0 + 1440, TUE);
    const total = adjust.reduce((a, q) => a + q.delta, 0);
    expect(total).toBe(60);
    expect(adjust.every((q) => [2, 3, 4, 5].includes(q.weekday))).toBe(true);
    expect(notes).toEqual([]);
  });

  it("meeting the share leaves no adjustment; at-least overshoot is free", () => {
    const s = sealedMonday(3 * H); // 3h ≥ 2h share
    expect(quotaAdjustmentsAtSod(s, DAY0 + 1440, TUE).adjust).toEqual([]);
  });

  it("exact overshoot trims the remaining shares", () => {
    const s0 = sealedMonday(3 * H);
    const s: State = {
      ...s0,
      week: { ...s0.week, budgets: s0.week.budgets.map((b) => (b.headId === "Job" ? { ...b, quotaType: "exact" as const } : b)) },
    };
    const { adjust } = quotaAdjustmentsAtSod(s, DAY0 + 1440, TUE);
    const total = adjust.reduce((a, q) => a + q.delta, 0);
    expect(total).toBe(-60); // 1h overshoot removed from Tue–Fri
    expect(adjust.every((q) => q.delta < 0)).toBe(true);
  });

  it("PRUNING_DONE appends the ledger and today's injection draws the adjusted share", () => {
    const s0: State = { ...sealedMonday(60), ceremony: { phase: "pruning" } };
    const s = reduce(s0, { type: "PRUNING_DONE", inject: { midnight: DAY0 + 1440, weekday: TUE } });
    expect(s.week.quotaAdjust.length).toBeGreaterThan(0);
    expect(s.week.quotaAdjust.reduce((a, q) => a + q.delta, 0)).toBe(60);
    // stored budgets untouched (the reusable template is never mutated)
    expect(s.week.budgets.find((b) => b.headId === "Job")!.shares).toBeUndefined();
  });

  it("no wrap past the week boundary: a Friday shortfall dies (reported)", () => {
    const base = withWeek(DAY0 + 30 * H, { budgets: [jobSearch] });
    const s: State = {
      ...base,
      days: [{ id: "d1", start: DAY0, end: DAY0 + 24 * H, reportDate: DAY0 }],
    };
    // Sealed day = Friday (weekday 5): today Saturday (6), diff 1 day.
    const { adjust, notes } = quotaAdjustmentsAtSod(s, DAY0 + 1440, 6);
    expect(adjust).toEqual([]);
    expect(notes.some((n) => n.includes("shortfall"))).toBe(true);
  });
});
