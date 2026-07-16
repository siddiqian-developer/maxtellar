/**
 * §3.9 fair-share of contested free space — the completed scope (2026-07-16).
 * Two cases the earlier partial impl handled wrongly:
 *  (a) an open SEMI-TAIL below an open subject is an equal PEER (even split),
 *      not a firm 2h wall;
 *  (b) an open SEMI-HEAD as subject gets the 10h/2h/split fair-share cap, not
 *      the old flat soft-wall clamp.
 * Plus a circuit-breaker sanity check (§7.1).
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduceAll,
  checkInvariants,
  settle,
  CircuitBreakerError,
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
      breakable: false,
      ...over,
    } as never,
  };
}

const partsOf = (s: State, id: string): Part[] =>
  s.placements.find((p) => p.itemId === id)?.parts ?? [];

describe("§3.9 fair-share — completed cases", () => {
  it("(a) an open semi-tail below an unscheduled subject → EVEN split, not 2h", () => {
    // now = 2 PM; unscheduled Read (ranks first), open semi-tail Wind anchored to
    // end 12 AM below it. 10h of free space, two open peers → 5h each: Read 2–7 PM,
    // Wind 7 PM–12 AM. Wind is created FIRST (so its anchor isn't relocated by the
    // §3.5 entry-order rule) but given the LOWER rank so Read is the subject above it.
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("Wind", { timing: "semi-tail", anchorEnd: T(24), rank: "t" }),
      mkTask("Read", { timing: "unscheduled", rank: "g" }),
    ]);
    expect(partsOf(s, "Read")).toEqual([{ start: T(14), end: T(19) }]);
    expect(partsOf(s, "Wind")).toEqual([{ start: T(19), end: T(24) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("(b) an open semi-head subject YIELDS to a firm task below (2h), not 10h", () => {
    // now = 2 PM; open semi-head H anchored start 2 PM, budgeted B (1h) below.
    // H yields to CROWDED_CAP (2h): H 2–4 PM, B 4–5 PM.
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("H", { timing: "semi-head", anchorStart: T(14) }),
      mkTask("B", { timing: "budgeted", budget: 60, breakable: true }),
    ]);
    expect(partsOf(s, "H")).toEqual([{ start: T(14), end: T(16) }]);
    expect(partsOf(s, "B")).toEqual([{ start: T(16), end: T(17) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("(b) an UNCONTESTED open semi-head still gets the full 10h cap", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [mkTask("H", { timing: "semi-head", anchorStart: T(14) })]);
    expect(partsOf(s, "H")).toEqual([{ start: T(14), end: T(24) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("regression: two unscheduled peers still split 10h evenly (5h each)", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("u1", { timing: "unscheduled" }),
      mkTask("u2", { timing: "unscheduled" }),
    ]);
    expect(partsOf(s, "u1")).toEqual([{ start: T(14), end: T(19) }]);
    expect(partsOf(s, "u2")).toEqual([{ start: T(19), end: T(24) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("regression: a lone open semi-tail contested by a firm task still uses G27 (not the 2h yield)", () => {
    // Semi-tail SUBJECT (ranked first) anchored 8 PM, firm budgeted below: the
    // firm task compresses the tail from its front (G27), it does NOT shrink the
    // tail to a 2h fair-share slice. Tail keeps 4h: B 2–4 PM, Tail 4–8 PM.
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("Tail", { timing: "semi-tail", anchorEnd: T(20), slideable: false }),
      mkTask("B", { timing: "budgeted", budget: 120, breakable: true }),
    ]);
    expect(partsOf(s, "B")).toEqual([{ start: T(14), end: T(16) }]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(16), end: T(20) }]);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe("§7.1 circuit breaker", () => {
  it("a legal, moderately large plan settles without tripping the breaker", () => {
    const plan = Array.from({ length: 40 }, (_, i) => ({
      kind: "task" as const,
      id: `t${i}`,
      title: `t${i}`,
      headId: "work",
      activityId: "act",
      rank: String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)),
      tier: "normal" as const,
      timing: "budgeted" as const,
      ommf: false,
      slideable: true,
      breakable: true,
      budget: 30,
    }));
    expect(() => settle({ plan, cursor: 0, minFragment: 5 })).not.toThrow();
  });

  it("exposes CircuitBreakerError for the store/fork backstop", () => {
    expect(new CircuitBreakerError(999)).toBeInstanceOf(Error);
    expect(new CircuitBreakerError(999).ops).toBe(999);
  });
});
