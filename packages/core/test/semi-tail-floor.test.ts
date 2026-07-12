/**
 * §3.9.1 (G27) — semi-tail compression floor & slide-at-floor.
 * An open semi-tail's ballooned claim compresses from its floating start under
 * a firm contester, down to `semiTailFloor` (1h default). At the floor:
 * slideable → the semi-tail slides later as a whole (anchored end yields);
 * unslideable → firm obstacle, old motions (wrap/frogleap) apply.
 * A budgeted semi-tail is never compressed.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduceAll,
  checkInvariants,
  type Event,
  type Part,
  type State,
} from "../src/index.js";

const T = (h: number, m = 0): number => h * 60 + m;

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

const partsOf = (s: State, id: string): Part[] =>
  s.placements.find((p) => p.itemId === id)?.parts ?? [];

// Spec §3.9.1 worked example: now = 2 PM; open semi-tail anchored to end 8 PM,
// ballooned 2 PM–8 PM (cursor-clipped from the 10h presumption); floor 1h.
const openTail = (over: Record<string, unknown> = {}): Event =>
  mkTask("Tail", { timing: "semi-tail", anchorEnd: T(20), breakable: false, ...over });

describe("§3.9.1 G27 — open semi-tail compression floor", () => {
  it("compresses just enough (above the floor) for a firm contester", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [openTail(), mkTask("B", { timing: "budgeted", budget: 120 })]);
    expect(partsOf(s, "B")).toEqual([{ start: T(14), end: T(16) }]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(16), end: T(20) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("at the floor, a SLIDEABLE semi-tail slides after the contester (no wrap)", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      openTail({ slideable: true }),
      mkTask("B", { timing: "budgeted", budget: 420 }), // 7h > 5h freeable
    ]);
    // Contiguous contester; the tail's anchored end yielded, floor span kept.
    expect(partsOf(s, "B")).toEqual([{ start: T(14), end: T(21) }]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(21), end: T(22) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("at the floor, an UNSLIDEABLE semi-tail pins — a breakable contester wraps around it", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      openTail({ slideable: false }),
      mkTask("B", { timing: "budgeted", budget: 420 }),
    ]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(19), end: T(20) }]); // floor span, end anchored
    expect(partsOf(s, "B")).toEqual([
      { start: T(14), end: T(19) },
      { start: T(20), end: T(22) },
    ]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("at the floor, an UNSLIDEABLE semi-tail makes an unbreakable contester frogleap", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      openTail({ slideable: false }),
      mkTask("B", { timing: "budgeted", budget: 420, breakable: false }),
    ]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(19), end: T(20) }]);
    expect(partsOf(s, "B")).toEqual([{ start: T(20), end: T(27, 0) }]); // whole body after
    expect(checkInvariants(s)).toEqual([]);
  });

  it("a BUDGETED semi-tail is never compressed (definite need)", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      openTail({ budget: 240 }), // 16:00–20:00 committed
      mkTask("B", { timing: "budgeted", budget: 180 }),
    ]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(16), end: T(20) }]);
    expect(partsOf(s, "B")).toEqual([
      { start: T(14), end: T(16) },
      { start: T(20), end: T(21) },
    ]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("SET_TAIL_FLOOR reconfigures the floor and re-settles", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      { type: "SET_TAIL_FLOOR", minutes: 120 },
      openTail({ slideable: false }),
      mkTask("B", { timing: "budgeted", budget: 420 }),
    ]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(18), end: T(20) }]); // 2h floor
    expect(partsOf(s, "B")).toEqual([
      { start: T(14), end: T(18) },
      { start: T(20), end: T(23) },
    ]);
    expect(checkInvariants(s)).toEqual([]);
  });
});
