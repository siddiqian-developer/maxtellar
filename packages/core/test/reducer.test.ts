/**
 * Reducer behavior tests: locked rulings from the spec.
 * Start-over-running pauses (§3.10); mid-queue start cancels above (§3.10);
 * pause remainder machinery (G23/G25); backlog walls (1.2/G7); fork (§3.12).
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  reduceAll,
  fork,
  commit,
  checkInvariants,
  type Event,
  type State,
  type UnstartedTask,
} from "../src/index.js";

const T = (h: number, m: number): number => h * 60 + m;

function mkTask(id: string, over: Record<string, unknown>): Event {
  return {
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
}

describe("start rules (locked from sheet study)", () => {
  it("starting a mid-queue task CANCELS all unstarted tasks above it", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("A", { timing: "budgeted", budget: 30 }),
      mkTask("B", { timing: "budgeted", budget: 30 }),
      mkTask("C", { timing: "budgeted", budget: 30 }),
      { type: "START_TASK", taskId: "C" },
    ]);
    expect(s.running?.id).toBe("C");
    expect(s.plan.filter((i) => i.kind === "task")).toHaveLength(0);
    const cancelled = s.history.filter((h) => h.outcome === "cancelled").map((h) => h.taskId);
    expect(cancelled.sort()).toEqual(["A", "B"]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("start-over-running PAUSES the runner by default; remainder inherits rank", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("R", { timing: "budgeted", budget: 60 }),
      mkTask("Y", { timing: "budgeted", budget: 30 }),
      { type: "START_TASK", taskId: "R" },
      { type: "TICK", to: T(9, 20) },
      { type: "START_TASK", taskId: "Y" },
    ]);
    expect(s.running?.id).toBe("Y");
    // R's occupied 20m in history; 40m remainder alive in the plan
    const occ = s.history.find((h) => h.taskId === "R" && h.kind === "occupancy");
    expect(occ).toMatchObject({ start: T(9, 0), end: T(9, 20) });
    const rem = s.plan.find((i) => i.id === "R-rem") as UnstartedTask;
    expect(rem).toMatchObject({ timing: "budgeted", budget: 40, remainderOf: "R" });
    expect(checkInvariants(s)).toEqual([]);
  });

  it("pausing an ommf task freezes its remainder in place (wall), amputated by the new runner", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("O", { timing: "budgeted", budget: 60, ommf: true, breakable: false }),
      mkTask("Y", { timing: "budgeted", budget: 30 }),
      { type: "START_TASK", taskId: "O" },
      { type: "TICK", to: T(9, 30) },
      { type: "START_TASK", taskId: "Y" }, // pauses O → ommf remainder anchored at 9:30
    ]);
    const rem = s.plan.find((i) => i.id === "O-rem") as UnstartedTask;
    expect(rem.timing).toBe("semi-head");
    expect(rem.anchorStart).toBe(T(9, 30));
    // Y runs 9:30→10:00 (countdown); its projected occupancy amputates O-rem's head
    s = reduce(s, { type: "TICK", to: T(9, 40) });
    const skip = s.history.find((h) => h.id === "skip-O-rem");
    expect(skip).toBeDefined();
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe("priority is entry order, not timing type (2026-07-15)", () => {
  it("a newly-added Fixed task yields to earlier-added work and notifies", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("B", { timing: "budgeted", budget: 60 }), // occupies 9:00–10:00
      // Fixed start=now, added AFTER B → lower priority, must land after it.
      mkTask("F", { timing: "fixed", anchorStart: T(9, 0), anchorEnd: T(9, 30), slideable: false, breakable: false }),
    ]);
    const f = s.plan.find((i) => i.id === "F") as UnstartedTask;
    expect(f.anchorStart).toBe(T(10, 0));
    expect(f.anchorEnd).toBe(T(10, 30));
    expect(s.notice?.text).toMatch(/moved later/);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("a Fixed task added into free future space keeps its time (no yield, no notice)", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("B", { timing: "budgeted", budget: 60 }),
      mkTask("F", { timing: "fixed", anchorStart: T(14, 0), anchorEnd: T(14, 30), slideable: false, breakable: false }),
    ]);
    const f = s.plan.find((i) => i.id === "F") as UnstartedTask;
    expect(f.anchorStart).toBe(T(14, 0));
    expect(s.notice).toBeUndefined();
  });
});

describe("channels & accounting identity", () => {
  it("wall = spent + wasted + managed + breaks; reattribution conserves total", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("R", { timing: "budgeted", budget: 60 }),
      { type: "START_TASK", taskId: "R" },
      { type: "TICK", to: T(9, 30) },
      { type: "LOG_CHANNEL", channel: "wasted", minutes: 7 },
      { type: "LOG_CHANNEL", channel: "managed", minutes: 3 },
    ]);
    const c = s.running!.channels;
    expect(c).toEqual({ spent: 20, wasted: 7, managed: 3, breaks: 0 });
    expect(c.spent + c.wasted + c.managed + c.breaks).toBe(T(9, 30) - T(9, 0)); // identity
    // E1: end pushes later — remaining is budget − spent(work), not wall-clock
    expect(s.placements.length).toBe(0); // no plan items; just check cursor via view
    expect(checkInvariants(s)).toEqual([]);
  });

  it("LOG_CHANNEL clamps to physics (cannot reattribute more than spent)", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("R", { timing: "budgeted", budget: 60 }),
      { type: "START_TASK", taskId: "R" },
      { type: "TICK", to: T(9, 10) },
      { type: "LOG_CHANNEL", channel: "breaks", minutes: 999 },
    ]);
    const c = s.running!.channels;
    expect(c.spent).toBe(0);
    expect(c.breaks).toBe(10);
  });
});

describe("backlog — history laws", () => {
  it("backlog clamps to now (the past can never push now, 1.2)", () => {
    let s = initialState(T(9, 0));
    s = reduce(s, {
      type: "BACKLOG",
      entry: {
        taskId: null,
        title: "morning routine",
        headId: "otw",
        activityId: "routine",
        kind: "occupancy",
        start: T(7, 0),
        end: T(9, 30), // beyond now → clamped
        outcome: "completed",
        channels: { spent: 90, wasted: 0, managed: 0, breaks: 0 },
      },
    });
    const e = s.history[0]!;
    expect(e.end).toBe(T(9, 0));
  });

  it("backlog occupancy overlap is rejected (G7 — no-overlap applies to the past)", () => {
    let s = initialState(T(9, 0));
    const mk = (start: number, end: number): Event => ({
      type: "BACKLOG",
      entry: {
        taskId: null,
        title: "x",
        headId: "h",
        activityId: "a",
        kind: "occupancy",
        start,
        end,
        outcome: "completed",
        channels: { spent: end - start, wasted: 0, managed: 0, breaks: 0 },
      },
    });
    s = reduce(s, mk(T(7, 0), T(8, 0)));
    expect(() => reduce(s, mk(T(7, 30), T(8, 30)))).toThrow(/overlap/);
  });
});

describe("sleep model (§2.9) — sleepKind rides the whole lifecycle", () => {
  it("round-trips through start → pause (entry + remainder) → complete", () => {
    let s = initialState(T(22, 0));
    s = reduceAll(s, [
      mkTask("Z", { timing: "budgeted", budget: 480, sleepKind: "sleep" }),
      { type: "START_TASK", taskId: "Z" },
      { type: "TICK", to: T(23, 0) },
    ]);
    expect(s.running?.sleepKind).toBe("sleep");
    s = reduce(s, { type: "PAUSE_RUNNING" });
    const occ = s.history.find((h) => h.taskId === "Z" && h.kind === "occupancy")!;
    expect(occ.sleepKind).toBe("sleep");
    const rem = s.plan.find((i) => i.id === "Z-rem") as UnstartedTask;
    expect(rem.sleepKind).toBe("sleep");
    s = reduceAll(s, [
      { type: "START_TASK", taskId: "Z-rem" },
      { type: "TICK", to: T(23, 30) },
      { type: "COMPLETE_RUNNING" },
    ]);
    const done = s.history.find((h) => h.taskId === "Z-rem")!;
    expect(done.sleepKind).toBe("sleep");
    expect(checkInvariants(s)).toEqual([]);
  });

  it("back-logged sleep carries its explicit kind (never inferred)", () => {
    let s = initialState(T(9, 0));
    s = reduce(s, {
      type: "BACKLOG",
      entry: {
        taskId: null,
        title: "night sleep",
        headId: "otw",
        activityId: "sleep",
        kind: "occupancy",
        start: T(0, 0),
        end: T(7, 0),
        outcome: "completed",
        channels: { spent: 420, wasted: 0, managed: 0, breaks: 0 },
        sleepKind: "sleep",
      },
    });
    expect(s.history[0]!.sleepKind).toBe("sleep");
    // an ordinary backlog has no sleepKind at all
    s = reduce(s, {
      type: "BACKLOG",
      entry: {
        taskId: null,
        title: "breakfast",
        headId: "otw",
        activityId: "meals",
        kind: "occupancy",
        start: T(7, 0),
        end: T(7, 30),
        outcome: "completed",
        channels: { spent: 30, wasted: 0, managed: 0, breaks: 0 },
      },
    });
    expect(s.history[1]!.sleepKind).toBeUndefined();
  });
});

describe("SET_MIN_FRAGMENT (§3.7/7.1 — the floor is settable)", () => {
  it("re-snaps existing budgets up to the new floor and re-settles", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("A", { timing: "budgeted", budget: 5 }),
      mkTask("B", { timing: "budgeted", budget: 30 }),
      { type: "SET_MIN_FRAGMENT", minutes: 15 },
    ]);
    expect(s.minFragment).toBe(15);
    expect((s.plan.find((i) => i.id === "A") as UnstartedTask).budget).toBe(15);
    expect((s.plan.find((i) => i.id === "B") as UnstartedTask).budget).toBe(30); // untouched
    expect(checkInvariants(s)).toEqual([]);
  });

  it("dependent floors rise with it (they can never sit below minFragment)", () => {
    let s = initialState(T(9, 0));
    s = reduce(s, { type: "SET_MIN_FRAGMENT", minutes: 90 });
    expect(s.semiTailFloor).toBe(90); // default 60 lifted
    expect(s.openExtentCap).toBe(600); // already above; untouched
  });
});

describe("the fork (§3.12)", () => {
  it("sandbox edits never touch live; commit re-settles at REAL now (live wins)", () => {
    let live = initialState(T(9, 0));
    live = reduceAll(live, [
      mkTask("R", { timing: "budgeted", budget: 60 }),
      mkTask("E", { timing: "budgeted", budget: 30 }),
      { type: "START_TASK", taskId: "R" },
    ]);

    const sb = fork(live); // frozen at 9:00
    // user edits E's budget in the sandbox
    const e = sb.plan.find((i) => i.id === "E") as UnstartedTask;
    e.budget = 45;

    // meanwhile live keeps ticking 25 minutes
    live = reduce(live, { type: "TICK", to: T(9, 25) });
    expect((live.plan.find((i) => i.id === "E") as UnstartedTask).budget).toBe(30); // untouched

    const after = commit(live, sb);
    expect((after.plan.find((i) => i.id === "E") as UnstartedTask).budget).toBe(45);
    // re-settled at real now: E placed after the runner's projected end (9:00+60)
    const parts = after.placements.find((p) => p.itemId === "E")!.parts;
    expect(parts[0]!.start).toBe(T(10, 0));
    expect(checkInvariants(after)).toEqual([]);
  });

  it("a throwing commit leaves live untouched (error → discard sandbox)", () => {
    let live = initialState(T(9, 0));
    live = reduceAll(live, [mkTask("E", { timing: "budgeted", budget: 30 })]);
    const sb = fork(live);
    // corrupt the sandbox with an impossible fixed task (missing anchors → snap throws)
    sb.plan.push({
      kind: "task",
      id: "bad",
      title: "bad",
      headId: "h",
      activityId: "a",
      rank: "zzz",
      tier: "normal",
      timing: "fixed",
      ommf: false,
      slideable: false,
      breakable: false,
    } as UnstartedTask);
    const before = JSON.stringify(live);
    expect(() => commit(live, sb)).toThrow();
    expect(JSON.stringify(live)).toBe(before); // zero corruption
  });
});
