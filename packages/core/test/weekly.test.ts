/**
 * §4.4 weekly planning + injection & §4.5 off-periods. Covers: per-weekday
 * instantiation + time-of-day→absolute, rank-below-leftovers, G18 amputate/
 * perish at birth, the mid-week planning lock, the three rollover realities, and
 * off-period start/end + displacement.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  checkInvariants,
  injectToday,
  canPlanWeek,
  rankAfter,
  OFF_PERIOD,
  type Event,
  type State,
  type WeekTemplate,
} from "../src/index.js";

const H = 60;
const DAY0 = 0; // local midnight epoch-minute for the test day
const MON = 1;
const TUE = 2;
const SUN = 0;

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

const noViolations = (s: State): void => expect(checkInvariants(s)).toEqual([]);

/** State parked in the pruning phase with a started week and given templates. */
function pruningState(now: number, templates: WeekTemplate[], plan: State["plan"] = []): State {
  return {
    ...initialState(now),
    ceremony: { phase: "pruning" },
    week: { startedAt: DAY0, firstWeekday: MON, offDays: [SUN], templates },
    plan,
  };
}

describe("injectToday helper", () => {
  it("instantiates only matching weekdays, converting time-of-day to absolute", () => {
    const s = { ...initialState(DAY0), week: { startedAt: DAY0, firstWeekday: MON, offDays: [SUN], templates: [
      tpl({ title: "Standup", timing: "fixed", anchorStartTod: 9 * H, anchorEndTod: 9 * H + 30, budget: 30, weekdays: [MON, TUE], rank: "a" }),
      tpl({ title: "Gym", budget: 60, weekdays: [TUE], rank: "b" }),
    ] } };
    let n = 0;
    const out = injectToday(s, DAY0, MON, () => `inj-${++n}`, (prev) => rankAfter(prev));
    expect(out.map((t) => t.title)).toEqual(["Standup"]); // Gym is Tue-only
    expect(out[0]!.anchorStart).toBe(DAY0 + 9 * H);
    expect(out[0]!.anchorEnd).toBe(DAY0 + 9 * H + 30);
    // Tuesday gets both, in template-rank order.
    const tue = injectToday(s, DAY0, TUE, () => `inj-${++n}`, (prev) => rankAfter(prev));
    expect(tue.map((t) => t.title)).toEqual(["Standup", "Gym"]);
  });
});

describe("SET_WEEK_PLAN mid-week lock (§4.4)", () => {
  const one = [tpl({ title: "T", budget: 30, weekdays: [MON] })];
  it("accepts before any week is started", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "SET_WEEK_PLAN", templates: one, weekday: MON });
    expect(s.week.templates).toHaveLength(1);
  });
  it("rejects mid-week on a non-OFF weekday", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, offDays: [SUN] });
    const before = s;
    s = reduce(s, { type: "SET_WEEK_PLAN", templates: one, weekday: MON }); // Mon, not OFF
    expect(s).toEqual(before); // no-op
    expect(canPlanWeek(before, MON)).toBe(false);
  });
  it("accepts on an OFF weekday, and with the urgent bypass", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, offDays: [SUN] });
    const off = reduce(s, { type: "SET_WEEK_PLAN", templates: one, weekday: SUN });
    expect(off.week.templates).toHaveLength(1);
    const urgent = reduce(s, { type: "SET_WEEK_PLAN", templates: one, weekday: MON, urgent: true });
    expect(urgent.week.templates).toHaveLength(1);
  });
});

describe("START_WEEK — three rollover realities (§4.4)", () => {
  it("1) planned week starts with its plan intact", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "SET_WEEK_PLAN", templates: [tpl({ title: "T", budget: 30, weekdays: [MON] })], weekday: SUN });
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, startedAt: DAY0 });
    expect(s.week.startedAt).toBe(DAY0);
    expect(s.week.templates).toHaveLength(1);
  });
  it("2) no plan at rollover still starts the week", () => {
    let s = initialState(DAY0);
    s = reduce(s, { type: "START_WEEK", firstWeekday: MON, startedAt: DAY0 });
    expect(s.week.startedAt).toBe(DAY0);
    expect(s.week.templates).toHaveLength(0);
  });
  it("3) a week never planned → PRUNING_DONE injection is a no-op", () => {
    // week.startedAt null → injection skipped even if inject data is supplied.
    const s0: State = { ...initialState(DAY0 + 8 * H), ceremony: { phase: "pruning" } };
    const s = reduce(s0, { type: "PRUNING_DONE", inject: { midnight: DAY0, weekday: MON } });
    expect(s.plan).toHaveLength(0);
    expect(s.ceremony).toEqual({ phase: "planning" });
  });
});

describe("injection at PRUNING_DONE", () => {
  it("injects today's templates BELOW surviving leftovers", () => {
    const leftover = { kind: "task" as const, id: "left", title: "Leftover", headId: "Work", activityId: "Coding", rank: "m", tier: "normal" as const, timing: "budgeted" as const, ommf: false, slideable: true, breakable: true, budget: 60 };
    const s0 = pruningState(DAY0 + 8 * H, [tpl({ title: "Injected", budget: 45, weekdays: [MON], rank: "a" })], [leftover]);
    const s = reduce(s0, { type: "PRUNING_DONE", inject: { midnight: DAY0, weekday: MON } });
    const tasks = s.plan.filter((i) => i.kind === "task");
    expect(tasks.map((t) => (t as { title: string }).title)).toEqual(["Leftover", "Injected"]);
    // injected ranks strictly after the leftover
    const left = s.plan.find((i) => i.id === "left")!;
    const inj = s.plan.find((i) => (i as { title?: string }).title === "Injected")!;
    expect(inj.rank > left.rank).toBe(true);
    noViolations(s);
  });

  it("G18: a fully-past fixed template perishes; a partly-past one amputates its head", () => {
    const now = DAY0 + 20 * H; // 20:00
    const s0 = pruningState(now, [
      tpl({ title: "Past", timing: "fixed", anchorStartTod: 9 * H, anchorEndTod: 10 * H, budget: 60, weekdays: [MON], rank: "a" }),
      tpl({ title: "Straddle", timing: "fixed", anchorStartTod: 19 * H, anchorEndTod: 22 * H, budget: 3 * H, weekdays: [MON], rank: "b" }),
    ]);
    const s = reduce(s0, { type: "PRUNING_DONE", inject: { midnight: DAY0, weekday: MON } });
    const titles = s.plan.filter((i) => i.kind === "task").map((t) => (t as { title: string }).title);
    expect(titles).toContain("Straddle"); // partly-past survives
    expect(titles).not.toContain("Past"); // fully-past perished
    // the survivor is placed from `now` (head amputated at birth)
    const straddle = s.plan.find((i) => (i as { title?: string }).title === "Straddle")!;
    const p = s.placements.find((pl) => pl.itemId === straddle.id)!;
    expect(p.parts[0]!.start).toBe(now);
    noViolations(s);
  });
});

describe("off-periods (§4.5)", () => {
  it("START_OFF_PERIOD begins an Inviolable Off-Periods block; plan survives (push)", () => {
    let s = initialState(DAY0 + 8 * H);
    s = reduce(s, { type: "CREATE_TASK", task: { id: "keep", title: "Keep", headId: "Work", activityId: "Coding", tier: "normal", timing: "budgeted", ommf: false, slideable: true, breakable: true, budget: 60 } as never });
    s = reduce(s, { type: "START_OFF_PERIOD", title: "Sick", knownEnd: DAY0 + 12 * H });
    expect(s.running?.isOff).toBe(true);
    expect(s.running?.tier).toBe("inviolable");
    expect(s.running?.headId).toBe(OFF_PERIOD);
    expect(s.running?.budget).toBe(4 * H);
    expect(s.plan.some((i) => i.id === "keep")).toBe(true); // pushed, not perished
    // plan task is pushed to at/after the block's projected end
    const p = s.placements.find((pl) => pl.itemId === "keep")!;
    expect(p.parts[0]!.start).toBeGreaterThanOrEqual(DAY0 + 12 * H);
    noViolations(s);
  });

  it("unknown-end off-period runs open (stopwatch); END_OFF_PERIOD books Off-Periods occupancy", () => {
    let s = initialState(DAY0 + 8 * H);
    s = reduce(s, { type: "START_OFF_PERIOD" }); // no title, no end
    expect(s.running?.isOff).toBe(true);
    expect(s.running?.budget).toBeUndefined();
    expect(s.running?.title).toBe("Off");
    s = reduce(s, { type: "TICK", to: DAY0 + 10 * H }); // 2h off
    s = reduce(s, { type: "END_OFF_PERIOD" });
    expect(s.running).toBeNull();
    const off = s.history.find((h) => h.headId === OFF_PERIOD);
    expect(off).toBeDefined();
    expect(off!.end - off!.start).toBe(2 * H);
    noViolations(s);
  });

  it("END_OFF_PERIOD is a no-op when the runner is an ordinary task", () => {
    let s = initialState(DAY0 + 8 * H);
    s = reduce(s, { type: "CREATE_TASK", task: { id: "t", title: "T", headId: "Work", activityId: "Coding", tier: "normal", timing: "budgeted", ommf: false, slideable: true, breakable: true, budget: 60 } as never });
    s = reduce(s, { type: "START_TASK", taskId: "t" });
    const before = s;
    s = reduce(s, { type: "END_OFF_PERIOD" });
    expect(s).toEqual(before);
  });
});

describe("replay idempotence (week + off-period)", () => {
  it("same event log → identical state", () => {
    const events: Event[] = [
      { type: "SET_WEEK_PLAN", templates: [tpl({ title: "T", budget: 30, weekdays: [MON] })], weekday: SUN },
      { type: "START_WEEK", firstWeekday: MON, startedAt: DAY0 },
      { type: "START_OFF_PERIOD", title: "Trip", knownEnd: DAY0 + 30 * H },
      { type: "TICK", to: DAY0 + 25 * H },
      { type: "END_OFF_PERIOD" },
    ];
    const run = (): State => events.reduce(reduce, initialState(DAY0 + 8 * H));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
