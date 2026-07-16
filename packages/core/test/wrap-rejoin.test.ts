/**
 * §3.2 wrap-split REJOIN (ruled in-scope 2026-07-16). When the obstacle that
 * forced a breakable task to wrap is gone (cancelled/moved) and the parts become
 * adjacent free-space neighbours, the settle-pass reunifies them into one task —
 * budget conserved, forward-only preserved. Because settle is stateless and
 * recomputes placement from the plan every event, rejoin is EMERGENT (there are
 * no persisted wrap segments); this pins that guarantee.
 */
import { describe, it, expect } from "vitest";
import { initialState, reduceAll, checkInvariants, type Event, type Part, type State } from "../src/index.js";

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

describe("§3.2 wrap-split rejoin", () => {
  it("a wrapped task reunifies into one part when the obstacle is cancelled", () => {
    // now = 2 PM. Fixed obstacle F 4–5 PM (established first so it isn't relocated
    // by the §3.5 entry-order rule); breakable B (3h) added after fills AROUND it.
    // B wraps: 2–4 PM (2h) + 5–6 PM (1h). Cancel F → B rejoins to 2–5 PM (3h).
    let s = initialState(T(14));
    s = reduceAll(s, [
      mkTask("F", { timing: "fixed", anchorStart: T(16), anchorEnd: T(17) }),
      mkTask("B", { timing: "budgeted", budget: 180, breakable: true }),
    ]);
    expect(partsOf(s, "B")).toEqual([
      { start: T(14), end: T(16) },
      { start: T(17), end: T(18) },
    ]);
    // total placed budget conserved across the wrap
    const before = partsOf(s, "B").reduce((n, p) => n + (p.end - p.start), 0);
    expect(before).toBe(180);

    s = reduceAll(s, [{ type: "CANCEL_TASK", taskId: "F" }]);
    expect(partsOf(s, "B")).toEqual([{ start: T(14), end: T(17) }]);
    expect(checkInvariants(s)).toEqual([]);
  });
});
