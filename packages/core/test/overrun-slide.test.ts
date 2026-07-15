/**
 * §3.7 (G28) — overrun vs the task below.
 * Overrun is just pressure from above and reuses the tick's slide mechanics:
 * slideable → the task below SLIDES later (an open semi-tail compresses to its
 * floor first, then rides ahead of the runner's live end), never consumed;
 * non-slideable (any task) → overrun CONSUMES it completely (progressive
 * amputation → one Skipped entry, no remainder). When the runner ends, the
 * slid position at that instant commits as the task's new anchor (no
 * spring-back). Bare-now pressure (no runner) keeps the old R4 amputation.
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

// now = 2 PM. Budgeted A (1h), open semi-tail Tail anchored to end 4 PM.
// A runs 2 PM → past budget; overrun presses the tail.
function runScenario(tailOver: Record<string, unknown> = {}): State {
  let s = initialState(T(14));
  s = reduceAll(s, [
    mkTask("A", { timing: "budgeted", budget: 60 }),
    mkTask("Tail", { timing: "semi-tail", anchorEnd: T(16), breakable: false, ...tailOver }),
    { type: "START_TASK", taskId: "A" },
  ]);
  return s;
}

describe("§3.7 G28 — overrun slides, never eats, a slideable task below", () => {
  it("running (not yet overrun): tail compresses toward its floor, end anchored", () => {
    let s = runScenario();
    s = reduceAll(s, [{ type: "TICK", to: T(14, 30) }]);
    // 30m spent → projected end 3 PM; tail claim compressed exactly to its
    // 1h floor, 3–4 PM, anchored end untouched (no slide yet).
    expect(partsOf(s, "Tail")).toEqual([{ start: T(15), end: T(16) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("a runner's PROJECTED span past the floor also makes the tail ride (2026-07-13)", () => {
    // A's projected end (3 PM) invades this tail's floor boundary (2:30 PM for
    // anchor 3:30 PM) from the very first settle — slideable is never crushed,
    // so the tail rides ahead of the projection at its floor span.
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("A", { timing: "budgeted", budget: 60 }),
      mkTask("Tail", { timing: "semi-tail", anchorEnd: T(15, 30), breakable: false }),
      { type: "START_TASK", taskId: "A" },
      { type: "TICK", to: T(14, 30) },
    ]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(15), end: T(16) }]);
    // deeper: overrun pushes the front to now, the tail keeps riding per tick
    s = reduceAll(s, [{ type: "TICK", to: T(15, 40) }]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(15, 40), end: T(16, 40) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("deep overrun: slideable tail rides ahead of the runner's live end, floor span kept", () => {
    let s = runScenario();
    // run A to 5 PM — 2h past budget, well past the tail's 4 PM anchor
    s = reduceAll(s, [{ type: "TICK", to: T(17) }]);
    expect(s.running?.id).toBe("A");
    // tail survives, floor span (1h), riding at now
    expect(partsOf(s, "Tail")).toEqual([{ start: T(17), end: T(18) }]);
    expect(s.plan.find((i) => i.id === "Tail")).toBeDefined();
    expect(s.history.find((h) => h.taskId === "Tail")).toBeUndefined();
    expect(checkInvariants(s)).toEqual([]);
  });

  it("the ride MOVES the anchor live — each tick, before any runner ends (§3.2)", () => {
    let s = runScenario();
    s = reduceAll(s, [{ type: "TICK", to: T(17) }]);
    const anchorOf = (st: State): number | undefined => {
      const tail = st.plan.find((i) => i.id === "Tail");
      return tail && "anchorEnd" in tail ? (tail.anchorEnd as number) : undefined;
    };
    // mid-ride, runner still going: the stored anchor equals the placed edge
    expect(anchorOf(s)).toBe(T(18));
    s = reduceAll(s, [{ type: "TICK", to: T(17, 1) }]);
    expect(anchorOf(s)).toBe(T(18, 1));
    // runner ends: nothing to commit — the anchor simply rests where it moved
    s = reduceAll(s, [{ type: "COMPLETE_RUNNING" }]);
    expect(anchorOf(s)).toBe(T(18, 1));
    expect(partsOf(s, "Tail")).toEqual([{ start: T(17, 1), end: T(18, 1) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("pause: same — the anchor is already where it moved", () => {
    let s = runScenario();
    s = reduceAll(s, [{ type: "TICK", to: T(16, 40) }, { type: "PAUSE_RUNNING" }]);
    const tail = s.plan.find((i) => i.id === "Tail");
    expect(tail && "anchorEnd" in tail ? tail.anchorEnd : undefined).toBe(T(17, 40));
    expect(checkInvariants(s)).toEqual([]);
  });

  it("STARTING a semi-tail keeps its anchored end — countdown, never a stopwatch (2026-07-13)", () => {
    // now = 2 PM, open semi-tail anchored to end 4 PM. Start it: it must run
    // as a countdown to 4 PM (budget 2h), not an open stopwatch.
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("Tail", { timing: "semi-tail", anchorEnd: T(16), breakable: false }),
      { type: "START_TASK", taskId: "Tail" },
    ]);
    expect(s.running?.id).toBe("Tail");
    expect(s.running?.budget).toBe(120);
    // ticks count down toward the anchored end; past it = normal overrun
    s = reduceAll(s, [{ type: "TICK", to: T(15) }]);
    expect(s.running?.budget).toBe(120);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("an UNSLIDEABLE semi-tail is consumed completely — one Skipped entry, no remainder", () => {
    let s = runScenario({ slideable: false });
    s = reduceAll(s, [{ type: "TICK", to: T(17) }]);
    expect(s.plan.find((i) => i.id === "Tail")).toBeUndefined();
    const skip = s.history.find((h) => h.taskId === "Tail");
    expect(skip?.outcome).toBe("skipped");
    expect(checkInvariants(s)).toEqual([]);
  });

  it("a slideable BUDGETED semi-tail slides whole (budget preserved, never compressed)", () => {
    let s = runScenario({ budget: 90 });
    s = reduceAll(s, [{ type: "TICK", to: T(17) }]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(17), end: T(18, 30) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("bare-now pressure (no runner) makes a slideable tail RIDE, never amputates (2026-07-13)", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("Tail", { timing: "semi-tail", anchorEnd: T(16), breakable: false }),
      { type: "TICK", to: T(17) },
    ]);
    // now (5 PM) passed the 4 PM anchor with nothing running: the tail rides
    // ahead of now at its floor span — its moment never silently passes.
    expect(partsOf(s, "Tail")).toEqual([{ start: T(17), end: T(18) }]);
    expect(s.history.find((h) => h.taskId === "Tail")).toBeUndefined();
    // …and keeps riding on the next tick.
    s = reduceAll(s, [{ type: "TICK", to: T(17, 1) }]);
    expect(partsOf(s, "Tail")).toEqual([{ start: T(17, 1), end: T(18, 1) }]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("bare-now pressure still amputates a NON-slideable tail (R4 unchanged)", () => {
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("Tail", { timing: "semi-tail", anchorEnd: T(16), breakable: false, slideable: false }),
      { type: "TICK", to: T(17) },
    ]);
    expect(s.plan.find((i) => i.id === "Tail")).toBeUndefined();
    expect(s.history.find((h) => h.taskId === "Tail")?.outcome).toBe("skipped");
    expect(checkInvariants(s)).toEqual([]);
  });
});
