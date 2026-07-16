/** §4.4a/§4.4b — weekend run by adjacency + working-day numbering. */
import { describe, it, expect } from "vitest";
import { weekendRun, countStartWeekday, workingDayNumber, workingDayLabel } from "./workingDays";

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;
const WEEKEND = [SAT, SUN];
const nums = (weekend: number[], off: number[]): (number | null)[] =>
  [SUN, MON, TUE, WED, THU, FRI, SAT].map((d) => workingDayNumber(d, weekend, off));

describe("§4.4a weekend run — adjacent OFF days are automatically weekend", () => {
  it("plain Sat+Sun weekend is the whole run", () => {
    expect([...weekendRun(WEEKEND, WEEKEND)].sort()).toEqual([SUN, SAT]);
  });

  it("absorbs adjacent OFF days pre and post, transitively, wrapping the week", () => {
    // Mon+Tue post-pended (Sun→Mon→Tue) and Fri pre-pended (Sat←Fri).
    const run = weekendRun(WEEKEND, [SAT, SUN, MON, TUE, FRI]);
    expect([...run].sort((a, b) => a - b)).toEqual([SUN, MON, TUE, FRI, SAT].sort((a, b) => a - b));
  });

  it("does NOT absorb a non-adjacent OFF day (a mid-week rest)", () => {
    const run = weekendRun(WEEKEND, [SAT, SUN, THU]);
    expect(run.has(THU)).toBe(false);
    expect([...run].sort()).toEqual([SUN, SAT]);
  });
});

describe("§4.4b working-day numbering", () => {
  it("plain week: Mon..Fri are 1st..5th, weekend unnumbered", () => {
    expect(nums(WEEKEND, WEEKEND)).toEqual([null, 1, 2, 3, 4, 5, null]);
    expect(countStartWeekday(WEEKEND, WEEKEND)).toBe(MON);
  });

  it("the user's case: Mon+Tue lengthen the weekend, Thursday taken off → Wed 1st, Fri 2nd", () => {
    const off = [SAT, SUN, MON, TUE, THU];
    expect(countStartWeekday(WEEKEND, off)).toBe(WED);
    // Sun Mon Tue = weekend run (no number); Wed = 1st; Thu off (skipped, no reset); Fri = 2nd.
    expect(nums(WEEKEND, off)).toEqual([null, null, null, 1, null, 2, null]);
  });

  it("a non-weekend off skips WITHOUT resetting the count", () => {
    // Wed off mid-week: Mon 1, Tue 2, Wed skipped, Thu 3, Fri 4 — not a reset to 1.
    expect(nums(WEEKEND, [SAT, SUN, WED])).toEqual([null, 1, 2, null, 3, 4, null]);
  });

  it("every day off → no working days, no numbers", () => {
    const all = [SUN, MON, TUE, WED, THU, FRI, SAT];
    expect(countStartWeekday(WEEKEND, all)).toBeNull();
    expect(nums(WEEKEND, all)).toEqual([null, null, null, null, null, null, null]);
  });

  it("writes the FULL label (§4.4b), never abbreviated", () => {
    expect(workingDayLabel(1)).toBe("1st working day");
    expect(workingDayLabel(3)).toBe("3rd working day");
    expect(workingDayLabel(5)).toBe("5th working day");
    expect(workingDayLabel(null)).toBeNull();
  });
});
