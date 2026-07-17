/**
 * Step definitions for the §7.2/§7.4 Gherkin acceptance layer (Stage 9).
 *
 * These scenarios RESTATE, at the level of the public core API, the locked laws
 * already proven numerically by the unit tests — they are a derived test layer,
 * never a second spec (§7.2). Each scenario is tagged with the rule it verifies
 * (@G7, @G10, @G18, @G24, …). The scheduler is a pure `(State, Event) → State`,
 * so every step is a thin call into it; scenario state lives on the quickpickle
 * world's `data` bag (fresh per scenario).
 */

import { Given, When, Then, type DataTable } from "quickpickle";
import { expect } from "vitest";
import {
  initialState,
  reduce,
  reduceAll,
  checkInvariants,
  fork,
  commit,
  runningView,
  pomodoroView,
  redistributeShortfall,
  redistributeOvershoot,
  quotaAdjustmentsAtSod,
  CORE_WORK,
  SLEEP_ID,
  LOST_HOURS_ID,
  type State,
  type Event,
} from "../../src/index.js";

/* ------------------------------- helpers --------------------------------- */

const H = 60;
const DAY0 = 0;
const TUE = 2;
const SUN = 0;
const MON = 1;
const WORKDAYS = [1, 2, 3, 4, 5];

const T = (h: number, m = 0): number => h * H + m;

interface Ctx {
  s: State;
  redist?: { deltas: { weekday: number; delta: number }[]; unplaced: number };
  redistInput?: number;
}
const ctx = (world: unknown): Ctx => (world as { data: Ctx }).data;

/** Create a task with the standard test fixture fields, then re-settle. */
function createTask(w: unknown, id: string, over: Record<string, unknown>): void {
  const c = ctx(w);
  const ev: Event = {
    type: "CREATE_TASK",
    task: {
      id,
      title: id,
      headId: "work",
      activityId: "act",
      tier: "normal",
      ommf: false,
      slideable: true,
      breakable: true,
      ...over,
    } as never,
  };
  c.s = reduce(c.s, ev);
}

const partsOf = (s: State, id: string): { start: number; end: number }[] =>
  s.placements.find((p) => p.itemId === id)?.parts ?? [];

/* ------------------------------ background ------------------------------- */

Given("the clock reads {int}:{int}", (w, h: number, m: number) => {
  ctx(w).s = initialState(T(h, m));
});

/* ------------------------------ scheduling ------------------------------- */

Given("a running budgeted task {string} of {int} minutes", (w, id: string, mins: number) => {
  createTask(w, id, { timing: "budgeted", budget: mins });
  ctx(w).s = reduce(ctx(w).s, { type: "START_TASK", taskId: id });
});

Given("a budgeted task {string} of {int} minutes", (w, id: string, mins: number) => {
  createTask(w, id, { timing: "budgeted", budget: mins });
});

Given("a fixed task {string} from {int}:{int} to {int}:{int}", (w, id: string, h1: number, m1: number, h2: number, m2: number) => {
  createTask(w, id, { timing: "fixed", anchorStart: T(h1, m1), anchorEnd: T(h2, m2), budget: T(h2, m2) - T(h1, m1) });
});

Given("a semi-head task {string} starting at {int}:{int}", (w, id: string, h: number, m: number) => {
  createTask(w, id, { timing: "semi-head", anchorStart: T(h, m), budget: 30 });
});

Given("a semi-tail task {string} ending at {int}:{int}", (w, id: string, h: number, m: number) => {
  createTask(w, id, { timing: "semi-tail", anchorEnd: T(h, m), budget: 30 });
});

Given("an unscheduled task {string}", (w, id: string) => {
  createTask(w, id, { timing: "unscheduled" });
});

When("the clock advances to {int}:{int}", (w, h: number, m: number) => {
  ctx(w).s = reduce(ctx(w).s, { type: "TICK", to: T(h, m) });
});

Then("task {string} is placed at {int}:{int} to {int}:{int}", (w, id: string, h1: number, m1: number, h2: number, m2: number) => {
  expect(partsOf(ctx(w).s, id)).toEqual([{ start: T(h1, m1), end: T(h2, m2) }]);
});

Then(
  "task {string} is split into {int}:{int} to {int}:{int} and {int}:{int} to {int}:{int}",
  (w, id: string, h1: number, m1: number, h2: number, m2: number, h3: number, m3: number, h4: number, m4: number) => {
    expect(partsOf(ctx(w).s, id)).toEqual([
      { start: T(h1, m1), end: T(h2, m2) },
      { start: T(h3, m3), end: T(h4, m4) },
    ]);
  },
);

Then("task {string} has timing {string}", (w, id: string, timing: string) => {
  const item = ctx(w).s.plan.find((i) => i.id === id) as { timing?: string } | undefined;
  expect(item?.timing).toBe(timing);
});

Then("no two placements overlap", (w) => {
  const spans = ctx(w).s.placements.flatMap((p) => p.parts).sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
});

Then("all invariants hold", (w) => {
  expect(checkInvariants(ctx(w).s)).toEqual([]);
});

/* ------------------------ G18 amputation-at-birth ------------------------ */

Then(
  "task {string} is amputated to {int}:{int} to {int}:{int} with a skipped record from {int}:{int} to {int}:{int}",
  (w, id: string, h1: number, m1: number, h2: number, m2: number, h3: number, m3: number, h4: number, m4: number) => {
    const s = ctx(w).s;
    expect(partsOf(s, id)).toEqual([{ start: T(h1, m1), end: T(h2, m2) }]);
    const skip = s.history.find((h) => h.id === `skip-${id}`);
    expect(skip).toMatchObject({ kind: "skipped", start: T(h3, m3), end: T(h4, m4) });
  },
);

/* ------------------------------ composition ------------------------------ */

When("{string} is decomposed into:", (w, id: string, table: DataTable) => {
  const children = table.hashes().map((r) => ({ title: r.title!, budget: Number(r.budget) }));
  ctx(w).s = reduce(ctx(w).s, { type: "SET_SUBTASKS", parentId: id, children });
});

Then("the budget of {string} is {int} minutes", (w, id: string, mins: number) => {
  const item = ctx(w).s.plan.find((i) => i.id === id) as { budget?: number } | undefined;
  expect(item?.budget).toBe(mins);
});

Then("{string} has {int} leaves", (w, id: string, n: number) => {
  const leaves = ctx(w).s.plan.filter((i) => (i as { parentId?: string }).parentId === id);
  expect(leaves).toHaveLength(n);
});

/* ------------------------------ ceremonies ------------------------------- */

Given("the following logged spans in hours since day-start:", (w, table: DataTable) => {
  const c = ctx(w);
  // Advance the clock well past the spans so they are all legal past history.
  const maxEnd = Math.max(...table.hashes().map((r) => Number(r.end)));
  c.s = reduce(c.s, { type: "TICK", to: c.s.now + (maxEnd + 2) * H });
  for (const r of table.hashes()) {
    const start = DAY0 + Number(r.start) * H;
    const end = DAY0 + Number(r.end) * H;
    const isSleep = r.kind === "sleep";
    c.s = reduce(c.s, {
      type: "BACKLOG",
      entry: {
        taskId: null,
        title: isSleep ? "Sleep" : "Work",
        headId: isSleep ? SLEEP_ID : "Work",
        activityId: isSleep ? "Sleep" : "Coding",
        kind: "occupancy",
        start,
        end,
        outcome: "completed",
        channels: { spent: end - start, wasted: 0, managed: 0, breaks: 0 },
      } as never,
    });
  }
});

When("the day is started with SOD", (w) => {
  ctx(w).s = reduce(ctx(w).s, { type: "SOD" });
});

Then("the day record spans {int} hours", (w, hours: number) => {
  const rec = ctx(w).s.days[0]!;
  expect(rec.end - rec.start).toBe(hours * H);
});

Then("the unaccounted time booked as Lost Hours totals {int} hours", (w, hours: number) => {
  const lost = ctx(w).s.history.filter((h) => h.kind === "occupancy" && h.headId === LOST_HOURS_ID);
  const total = lost.reduce((a, l) => a + (l.end - l.start), 0);
  expect(total).toBe(hours * H);
  expect(lost.every((l) => l.taskId === null)).toBe(true);
});

Then("accounted plus lost equals the {int}-hour wall", (w, hours: number) => {
  const rec = ctx(w).s.days[0]!;
  const span = rec.end - rec.start;
  const tiled = ctx(w).s.history
    .filter((h) => h.kind === "occupancy")
    .reduce((a, h) => a + Math.max(0, Math.min(h.end, rec.end) - Math.max(h.start, rec.start)), 0);
  expect(span).toBe(hours * H);
  expect(tiled).toBe(span); // every minute of the wall is accounted for or Lost
});

Then("no Lost Hours are booked", (w) => {
  const lost = ctx(w).s.history.filter((h) => h.kind === "occupancy" && h.headId === "Lost Hours");
  expect(lost).toHaveLength(0);
});

/* --------------------------------- fork ---------------------------------- */

When("the plan is forked, {string} is re-budgeted to {int} in the sandbox, and live advances to {int}:{int} before committing", (w, id: string, mins: number, h: number, m: number) => {
  const c = ctx(w);
  const sb = fork(c.s);
  const e = sb.plan.find((i) => i.id === id) as { budget: number } | undefined;
  if (e) e.budget = mins;
  c.s = reduce(c.s, { type: "TICK", to: T(h, m) }); // live keeps ticking
  c.s = commit(c.s, sb); // re-settles at REAL now
});

/* ------------------------------- pomodoro -------------------------------- */

Given("a pomodoro task of {int} minutes with work {int} and break {int}", (w, budget: number, work: number, brk: number) => {
  const c = ctx(w);
  c.s = reduce(c.s, {
    type: "CREATE_TASK",
    task: { kind: "task", id: "P", title: "Focus", headId: "Main Work", activityId: "", timing: "budgeted", tier: "normal", ommf: false, budget } as never,
  });
  c.s = reduce(c.s, { type: "START_TASK", taskId: "P", pomodoro: { workMin: work, breakMin: brk, longBreakMin: 15, cyclesBeforeLong: 4 } });
});

When("{int} minutes pass", (w, mins: number) => {
  ctx(w).s = reduce(ctx(w).s, { type: "TICK", to: ctx(w).s.now + mins });
});

When("a break is taken", (w) => {
  ctx(w).s = reduce(ctx(w).s, { type: "POMODORO_BREAK" });
});

When("work resumes", (w) => {
  ctx(w).s = reduce(ctx(w).s, { type: "POMODORO_RESUME" });
});

Then("the {word} channel is {int}", (w, channel: string, val: number) => {
  const ch = ctx(w).s.running!.channels as unknown as Record<string, number>;
  expect(ch[channel]).toBe(val);
});

Then("the remaining budget is {int}", (w, val: number) => {
  expect(runningView(ctx(w).s)!.remaining).toBe(val);
});

Then("the wall identity spent plus wasted plus managed plus breaks equals the elapsed wall", (w) => {
  const s = ctx(w).s;
  const c = s.running!.channels;
  expect(c.spent + c.wasted + c.managed + c.breaks).toBe(s.now - s.running!.startedAt);
});

Then("a pomodoro transition is due", (w) => {
  expect(pomodoroView(ctx(w).s)!.due).toBe(true);
});

/* --------------------------------- quota --------------------------------- */

function readDays(table: DataTable): { weekday: number; share: number; netCore: number }[] {
  return table.hashes().map((r) => ({ weekday: Number(r.weekday), share: Number(r.share), netCore: Number(r.netCore) }));
}

When("a shortfall of {int} minutes is redistributed across the remaining days:", (w, shortfall: number, table: DataTable) => {
  const c = ctx(w);
  c.redistInput = shortfall;
  c.redist = redistributeShortfall(shortfall, readDays(table));
});

When("an overshoot of {int} minutes is redistributed across the remaining days:", (w, overshoot: number, table: DataTable) => {
  const c = ctx(w);
  c.redistInput = overshoot;
  c.redist = redistributeOvershoot(overshoot, readDays(table));
});

Then("the resulting deltas are:", (w, table: DataTable) => {
  const expected = table.hashes().map((r) => ({ weekday: Number(r.weekday), delta: Number(r.delta) }));
  expect(ctx(w).redist!.deltas).toEqual(expected);
});

Then("{int} minutes remain unplaced", (w, val: number) => {
  expect(ctx(w).redist!.unplaced).toBe(val);
});

Then("the redistribution conserves the total", (w) => {
  const c = ctx(w);
  const placed = c.redist!.deltas.reduce((a, d) => a + Math.abs(d.delta), 0);
  expect(placed + c.redist!.unplaced).toBe(c.redistInput);
});

Given("an at-most weekly quota {string} of {int} hours per day over the workweek, sealed on Monday with {int} minutes achieved", (w, head: string, hoursPerDay: number, achieved: number) => {
  const base = initialState(DAY0 + 30 * H);
  ctx(w).s = {
    ...base,
    week: {
      ...base.week,
      startedAt: DAY0,
      firstWeekday: MON,
      offDays: [SUN],
      budgets: [{ headId: head, categoryId: CORE_WORK, kind: "weekly", quotaMinutes: hoursPerDay * WORKDAYS.length * H, quotaType: "atMost", weekdays: WORKDAYS }],
    },
    days: [{ id: "d1", start: DAY0, end: DAY0 + 24 * H, reportDate: DAY0 }],
    history: achieved > 0
      ? [{ id: "h1", taskId: null, title: `${head} work`, headId: head, activityId: head, kind: "occupancy", start: DAY0 + 9 * H, end: DAY0 + 9 * H + achieved, outcome: "completed", channels: { spent: achieved, wasted: 0, managed: 0, breaks: 0 } }]
      : [],
  } as State;
});

When("SOD quota adjustments are computed for Tuesday", (w) => {
  const { adjust, notes } = quotaAdjustmentsAtSod(ctx(w).s, DAY0 + 1440, TUE);
  (ctx(w) as unknown as { qadjust: unknown; qnotes: unknown }).qadjust = adjust;
  (ctx(w) as unknown as { qadjust: unknown; qnotes: unknown }).qnotes = notes;
});

Then("no quota days are adjusted", (w) => {
  const c = ctx(w) as unknown as { qadjust: unknown[]; qnotes: unknown[] };
  expect(c.qadjust).toEqual([]);
  expect(c.qnotes).toEqual([]);
});
