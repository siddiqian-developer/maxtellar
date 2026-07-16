/**
 * §3.11/§3.13 RERANK — drag-to-reorder. Recomputes a LexoRank between-key so
 * list position (priority) changes, and the resettle re-lays-out the fill order.
 */
import { describe, it, expect } from "vitest";
import { initialState, reduceAll, checkInvariants, type Event, type Part, type State } from "../src/index.js";

const T = (h: number, m = 0): number => h * 60 + m;

function mkTask(id: string): Event {
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
      timing: "budgeted",
      budget: 60,
    } as never,
  };
}

const firstStart = (s: State, id: string): number | undefined =>
  s.placements.find((p) => p.itemId === id)?.parts[0]?.start;
const partsOf = (s: State, id: string): Part[] =>
  s.placements.find((p) => p.itemId === id)?.parts ?? [];

describe("§3.11 RERANK", () => {
  it("moves a task to the front (afterId null) — it now fills first", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [mkTask("u1"), mkTask("u2"), mkTask("u3")]);
    // created in order → u1 first, u3 last
    expect(firstStart(s, "u1")).toBe(T(14));
    expect(firstStart(s, "u3")).toBe(T(16));

    s = reduceAll(s, [{ type: "RERANK", taskId: "u3", afterId: null }]);
    expect(firstStart(s, "u3")).toBe(T(14));
    expect(firstStart(s, "u1")).toBe(T(15));
    expect(firstStart(s, "u2")).toBe(T(16));
    expect(checkInvariants(s)).toEqual([]);
  });

  it("moves a task to sit immediately after another", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [mkTask("u1"), mkTask("u2"), mkTask("u3")]);
    // move u1 to just after u2 → order u2, u1, u3
    s = reduceAll(s, [{ type: "RERANK", taskId: "u1", afterId: "u2" }]);
    expect(firstStart(s, "u2")).toBe(T(14));
    expect(firstStart(s, "u1")).toBe(T(15));
    expect(firstStart(s, "u3")).toBe(T(16));
    expect(checkInvariants(s)).toEqual([]);
  });

  it("unknown anchor or self-anchor is a no-op", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [mkTask("u1"), mkTask("u2")]);
    const before = partsOf(s, "u1");
    s = reduceAll(s, [{ type: "RERANK", taskId: "u1", afterId: "nope" }]);
    expect(partsOf(s, "u1")).toEqual(before);
    s = reduceAll(s, [{ type: "RERANK", taskId: "u1", afterId: "u1" }]);
    expect(partsOf(s, "u1")).toEqual(before);
    expect(checkInvariants(s)).toEqual([]);
  });
});
