/**
 * §3.6 the 3→1 law + §6 live type derivation, as ONE shared pair of helpers
 * (`reconcileTrio` + `deriveTiming`) that the New Task drawer, the template
 * editor AND the Sleep trio all read (§7.0.6: one rule, one implementation).
 *
 * These lock the two behaviours the user reported broken on the Sleep trio and
 * (latently) the template editor: entering two of start/end/budget must auto-
 * fill the third, and the timing TYPE must follow which fields are filled — not
 * only change when a chip is tapped.
 */
import { describe, it, expect } from "vitest";
import { reconcileTrio, deriveTiming } from "./components/TaskSpecFields";

const H = (h: number, m = 0): number => h * 60 + m;

describe("§3.6 reconcileTrio — any two derive the third", () => {
  it("start + end derive the budget (the reported auto-fill)", () => {
    // 10pm start, 6am end NEXT day → an 8h span.
    const r = reconcileTrio("end", { startTod: H(22), endTod: H(6), endDayOffset: 1, budget: undefined });
    expect(r.budget).toBe(8 * 60);
  });

  it("start + budget derive the end (carrying the day offset past midnight)", () => {
    const r = reconcileTrio("budget", { startTod: H(22), endTod: undefined, endDayOffset: 0, budget: 8 * 60 });
    expect(r.endTod).toBe(H(6));
    expect(r.endDayOffset).toBe(1);
  });

  it("end + budget derive the start (user typed the end onto an existing budget)", () => {
    const r = reconcileTrio("end", { startTod: undefined, endTod: H(6), endDayOffset: 0, budget: 90 });
    // start = 6:00 − 1:30 = 4:30
    expect(r.startTod).toBe(H(4, 30));
  });

  it("a sub-floor span snaps the END, never leaving budget ≠ span", () => {
    const r = reconcileTrio("end", { startTod: H(9), endTod: H(9, 1), endDayOffset: 0, budget: undefined }, 5);
    expect(r.endTod).toBe(H(9, 5));
    expect(r.budget).toBe(5);
  });
});

describe("§6 deriveTiming — the type follows field presence", () => {
  it.each([
    ["budget only → budgeted", [undefined, undefined, 30], "budgeted"],
    ["start only → semi-head", [H(9), undefined, undefined], "semi-head"],
    ["end only → semi-tail", [undefined, H(17), undefined], "semi-tail"],
    ["start + end → fixed", [H(22), H(6), undefined], "fixed"],
    ["start + budget → fixed", [H(22), undefined, 480], "fixed"],
    ["end + budget → fixed", [undefined, H(6), 480], "fixed"],
    ["nothing → unscheduled", [undefined, undefined, undefined], "unscheduled"],
  ] as const)("%s", (_label, [s, e, b], expected) => {
    expect(deriveTiming(s, e, b)).toBe(expected);
  });

  it("promotes budgeted→fixed the moment a start joins the budget (the reported chip bug)", () => {
    // A budgeted Sleep with only a budget, then the user types a start: reconcile
    // fills the end, and the derived type becomes fixed — no chip tap needed.
    const r = reconcileTrio("start", { startTod: H(22), endTod: undefined, endDayOffset: 0, budget: 8 * 60 });
    expect(deriveTiming(r.startTod, r.endTod, r.budget)).toBe("fixed");
  });
});
