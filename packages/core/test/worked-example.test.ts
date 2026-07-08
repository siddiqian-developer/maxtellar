/**
 * SPEC §7.4 verification: reproduce the G10 worked example EXACTLY.
 *
 * now=10:00 (600). R budgeted 60m, Running since 09:00 (540) → enters Overrun.
 * E budgeted 30m unstarted (would sit 10:00–10:30). F fixed 10:30–11:00
 * (630–660). G budgeted 45m after F. MIN_FRAGMENT = 5.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  reduceAll,
  cursorOf,
  checkInvariants,
  type State,
  type Event,
  type Part,
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

function setup(): State {
  let s = initialState(T(9, 0));
  s = reduceAll(s, [
    mkTask("R", { timing: "budgeted", budget: 60 }),
    mkTask("E", { timing: "budgeted", budget: 30 }),
    mkTask("F", { timing: "fixed", anchorStart: T(10, 30), anchorEnd: T(11, 0), budget: 30 }),
    mkTask("G", { timing: "budgeted", budget: 45 }),
    { type: "START_TASK", taskId: "R" },
  ]);
  // tick to 10:00 — R's budget expires exactly now
  s = reduce(s, { type: "TICK", to: T(10, 0) });
  return s;
}

const partsOf = (s: State, id: string): Part[] =>
  s.placements.find((p) => p.itemId === id)?.parts ?? [];
const squeezedOf = (s: State, id: string): number =>
  s.placements.find((p) => p.itemId === id)?.squeezedDeficit ?? -1;

describe("G10 worked example — overrun squeezes, wraps, transfers, reunifies", () => {
  it("10:00 — E fits exactly before F; G after F", () => {
    const s = setup();
    expect(s.running?.id).toBe("R");
    expect(cursorOf(s)).toBe(T(10, 0)); // remaining 0 → cursor = now
    expect(partsOf(s, "E")).toEqual([{ start: T(10, 0), end: T(10, 30) }]);
    expect(partsOf(s, "F")).toEqual([{ start: T(10, 30), end: T(11, 0) }]);
    expect(partsOf(s, "G")).toEqual([{ start: T(11, 0), end: T(11, 45) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("10:01–10:04 — squeeze phase: E compresses, no split (tolerance 4m)", () => {
    let s = setup();
    for (let m = 1; m <= 4; m++) {
      s = reduce(s, { type: "TICK" });
      expect(partsOf(s, "E")).toEqual([{ start: T(10, 0) + m, end: T(10, 30) }]);
      expect(squeezedOf(s, "E")).toBe(m); // deficit grows 1/min, conserved
      expect(checkInvariants(s)).toEqual([]);
    }
  });

  it("10:05 — wrap: E splits 25m + 5m around F; G pushed", () => {
    let s = setup();
    s = reduce(s, { type: "TICK", to: T(10, 5) });
    expect(partsOf(s, "E")).toEqual([
      { start: T(10, 5), end: T(10, 30) }, // part-1 = 25m
      { start: T(11, 0), end: T(11, 5) }, // part-2 = 5m
    ]);
    expect(squeezedOf(s, "E")).toBe(0);
    expect(partsOf(s, "G")).toEqual([{ start: T(11, 5), end: T(11, 50) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("10:06 → 10:25 — 1-min transfer per tick: part-1 shrinks, part-2 grows", () => {
    let s = setup();
    s = reduce(s, { type: "TICK", to: T(10, 6) });
    expect(partsOf(s, "E")).toEqual([
      { start: T(10, 6), end: T(10, 30) }, // 24m
      { start: T(11, 0), end: T(11, 6) }, // 6m
    ]);
    s = reduce(s, { type: "TICK", to: T(10, 25) });
    expect(partsOf(s, "E")).toEqual([
      { start: T(10, 25), end: T(10, 30) }, // 5m — at the floor
      { start: T(11, 0), end: T(11, 25) }, // 25m
    ]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("10:26 — part-1 vanishes (slot < MIN_FRAGMENT invisible); E reunifies after F", () => {
    let s = setup();
    s = reduce(s, { type: "TICK", to: T(10, 26) });
    // the 4m residue [10:26,10:30) is free space (gap); E whole after F
    expect(partsOf(s, "E")).toEqual([{ start: T(11, 0), end: T(11, 30) }]);
    expect(partsOf(s, "G")).toEqual([{ start: T(11, 30), end: T(12, 15) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("10:31 — R still running past F's start: F amputates, never moves", () => {
    let s = setup();
    s = reduce(s, { type: "TICK", to: T(10, 31) });
    expect(partsOf(s, "F")).toEqual([{ start: T(10, 31), end: T(11, 0) }]); // remainder only
    const skip = s.history.find((h) => h.id === "skip-F");
    expect(skip).toMatchObject({ kind: "skipped", start: T(10, 30), end: T(10, 31) });
    expect(checkInvariants(s)).toEqual([]);
  });

  it("11:00+ — F fully consumed: dies Skipped, removed from plan", () => {
    let s = setup();
    s = reduce(s, { type: "TICK", to: T(11, 0) });
    expect(s.plan.find((i) => i.id === "F")).toBeUndefined();
    const skip = s.history.find((h) => h.id === "skip-F");
    expect(skip).toMatchObject({ start: T(10, 30), end: T(11, 0), outcome: "skipped" });
    // E and G now flow freely after the runner's cursor
    expect(partsOf(s, "E")).toEqual([{ start: T(11, 0), end: T(11, 30) }]);
    expect(checkInvariants(s)).toEqual([]);
  });
});
