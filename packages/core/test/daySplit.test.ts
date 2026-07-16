/**
 * §4.4/§11 day-attribution: an overnight task's minutes count against EACH day
 * they physically fall on. §11 budgets are per-day CAPACITY, so charging a whole
 * span to its firing day leaves the next day looking empty while its morning is
 * already occupied — letting the user over-book it invisibly.
 */
import { describe, it, expect } from "vitest";
import { daySplit } from "../src/week.js";
import type { TaskSpec } from "../src/types.js";

const spec = (o: Partial<TaskSpec>): TaskSpec => ({
  title: "T", headId: "Rest", activityId: "Sleep", timing: "fixed",
  tier: "normal", ommf: false, slideable: false, breakable: false, ...o,
} as TaskSpec);

describe("§11 daySplit", () => {
  it("splits an 11pm->7am sleep as 1h today / 7h tomorrow", () => {
    const s = spec({ anchorStartTod: 23 * 60, anchorEndTod: 7 * 60, anchorEndDayOffset: 1, budget: 8 * 60 });
    expect(daySplit(s)).toEqual({ today: 60, tomorrow: 7 * 60 });
  });

  it("keeps a same-day task wholly on its own day", () => {
    const s = spec({ anchorStartTod: 9 * 60, anchorEndTod: 17 * 60, budget: 8 * 60 });
    expect(daySplit(s)).toEqual({ today: 8 * 60, tomorrow: 0 });
  });

  it("charges an UNANCHORED (budgeted) task wholly to its firing day", () => {
    // No start = we don't know which hours it occupies, so it can't be split —
    // and this is the path the quota TRIM uses, so it must stay whole.
    const s = spec({ timing: "budgeted", budget: 90 });
    expect(daySplit(s)).toEqual({ today: 90, tomorrow: 0 });
  });

  it("a task ending exactly at midnight is entirely today's", () => {
    const s = spec({ anchorStartTod: 23 * 60, anchorEndTod: 0, anchorEndDayOffset: 1, budget: 60 });
    expect(daySplit(s)).toEqual({ today: 60, tomorrow: 0 });
  });

  it("conserves: the two slices always re-sum to the whole span", () => {
    const s = spec({ anchorStartTod: 22 * 60 + 30, anchorEndTod: 6 * 60 + 15, anchorEndDayOffset: 1 });
    const { today, tomorrow } = daySplit(s);
    expect(today + tomorrow).toBe(7 * 60 + 45);
    expect(today).toBe(90);
  });
});
