/**
 * §4.4/§4.4b — the First Weekday declared at START_WEEK is the DERIVED first
 * working day, not the weekday the user planned on.
 *
 * Weekly planning runs ON an OFF day by design (§4.4 "Runs on OFF day(s); default
 * Sunday"), so the old `firstWeekday: todayWeekday` was systematically an OFF day.
 * Its only consumer is `quotaAdjustmentsAtSod` → `weekdayPos(wd, first)`, which
 * decides a head's REMAINING weekdays this week — so the week window was shifted
 * by the weekend's length on the normal path.
 */
import { describe, it, expect } from "vitest";
import { countStartWeekday } from "./workingDays";

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;
const WEEKEND = [SAT, SUN];

describe("§4.4b — the declared First Weekday is the derived first working day", () => {
  it("planning on Sunday declares MONDAY, not Sunday", () => {
    // The old bug: planning on Sun (an OFF day) declared firstWeekday = 0.
    expect(countStartWeekday(WEEKEND, [SAT, SUN])).toBe(MON);
    expect(countStartWeekday(WEEKEND, [SAT, SUN])).not.toBe(SUN);
  });

  it("a lengthened weekend moves it: OFF = Sat,Sun,Mon,Tue → WEDNESDAY", () => {
    expect(countStartWeekday(WEEKEND, [SAT, SUN, MON, TUE])).toBe(WED);
  });

  it("a Friday pre-pended to the weekend moves it too (wrapping)", () => {
    expect(countStartWeekday(WEEKEND, [FRI, SAT, SUN])).toBe(MON);
    // ...and lengthening both ends still lands on the first working day.
    expect(countStartWeekday(WEEKEND, [FRI, SAT, SUN, MON])).toBe(TUE);
  });

  it("a NON-weekend off is not the first working day and does not become it", () => {
    // Thu off mid-week: the week still starts Mon; Thu is skipped, not a start.
    expect(countStartWeekday(WEEKEND, [SAT, SUN, THU])).toBe(MON);
  });

  it("every day off → undefined-able (reducer keeps the previous value)", () => {
    expect(countStartWeekday(WEEKEND, [SUN, MON, TUE, WED, THU, FRI, SAT])).toBeNull();
  });
});
