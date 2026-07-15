/**
 * Casual time / date / duration grammar (§06 + §7.0.2). Covers every example
 * the user gave, plus the two confirmed contradiction rulings.
 */
import { describe, it, expect } from "vitest";
import {
  parseTimeOfDay,
  parseCasualTime,
  parseCasualDuration,
  dayOffsetOf,
  dayStartMin,
} from "./casualTime";
import { fmtDayTime, fmtDurUnits } from "./time";

// A fixed "now": local 2026-07-15 08:30.
const NOW = Math.floor(new Date(2026, 6, 15, 8, 30).getTime() / 60000);
const hm = (tod: { hour: number; min: number } | undefined) =>
  tod ? `${String(tod.hour).padStart(2, "0")}:${String(tod.min).padStart(2, "0")}` : undefined;

describe("parseTimeOfDay — user examples", () => {
  const cases: [string, string][] = [
    ["3pm", "15:00"],
    ["03pm", "15:00"],
    ["03:0pm", "15:00"],
    ["03:PM", "15:00"],
    ["3:0", "03:00"],
    ["15:00", "15:00"],
    ["1500", "15:00"],
    ["150", "01:50"],
    ["15:0", "15:00"], // hour>12 always 24h; minute "0" is the tens place → :00
    ["9am", "09:00"],
    ["12", "12:00"], // bare 12 → noon
    ["12am", "00:00"],
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(hm(parseTimeOfDay(input))).toBe(expected);
    });
  }

  it("rejects non-times", () => {
    expect(parseTimeOfDay("hello")).toBeUndefined();
    expect(parseTimeOfDay("25:00")).toBeUndefined();
    expect(parseTimeOfDay("3:99")).toBeUndefined();
  });
});

describe("parseCasualTime — day-aware", () => {
  it("bare time resolves to today", () => {
    const r = parseCasualTime("3pm", NOW);
    expect(r.dayOffset).toBe(0);
    expect(r.explicitDay).toBe(false);
    expect(dayOffsetOf(r.value!, NOW)).toBe(0);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("3:00 PM");
  });

  it("'tom, 15:0' → Tomorrow 03:00PM", () => {
    const r = parseCasualTime("tom, 15:0", NOW);
    expect(r.dayOffset).toBe(1);
    expect(r.explicitDay).toBe(true);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Tomorrow, 3:00 PM");
  });

  it("misspelled 'tmorow, 03:PM' → Tomorrow 03:00PM", () => {
    const r = parseCasualTime("tmorow, 03:PM", NOW);
    expect(r.dayOffset).toBe(1);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Tomorrow, 3:00 PM");
  });

  it("'3:00PM tomorrow' → Tomorrow 03:00PM (day word trailing)", () => {
    const r = parseCasualTime("3:00PM tomorrow", NOW);
    expect(r.dayOffset).toBe(1);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Tomorrow, 3:00 PM");
  });

  it("an explicit far date resolves to that day (offset ≥ 2)", () => {
    const r = parseCasualTime("jul 22, 9am", NOW);
    expect(r.explicitDay).toBe(true);
    expect(r.dayOffset).toBe(7);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Wed Jul 22, 9:00 AM");
  });

  it("value composes onto the right calendar day", () => {
    const r = parseCasualTime("tom 7am", NOW);
    expect(r.value).toBe(dayStartMin(NOW) + 1440 + 7 * 60);
  });

  it("past bare time stays today (caller handles the bump); explicitDay=false", () => {
    const r = parseCasualTime("07:00", NOW); // now is 08:30
    expect(r.explicitDay).toBe(false);
    expect(dayOffsetOf(r.value!, NOW)).toBe(0);
    expect(r.value! < NOW).toBe(true);
  });
});

describe("parseCasualDuration + fmtDurUnits — user examples", () => {
  it("'1days, 2.5hr' → 1590 min → '1d 2h 30m'", () => {
    const mins = parseCasualDuration("1days, 2.5hr");
    expect(mins).toBe(1590);
    expect(fmtDurUnits(mins!)).toBe("1d 2h 30m");
  });

  it("unit and clock forms", () => {
    expect(parseCasualDuration("90m")).toBe(90);
    expect(parseCasualDuration("2h")).toBe(120);
    expect(parseCasualDuration("1h30")).toBe(90);
    expect(parseCasualDuration("1:30")).toBe(90);
    expect(parseCasualDuration("45")).toBe(45); // bare = minutes
    expect(parseCasualDuration("2 hours 15 min")).toBe(135);
  });

  it("trims zero units, always ≥ minutes", () => {
    expect(fmtDurUnits(1590)).toBe("1d 2h 30m");
    expect(fmtDurUnits(1500)).toBe("1d 1h");
    expect(fmtDurUnits(90)).toBe("1h 30m");
    expect(fmtDurUnits(30)).toBe("30m");
    expect(fmtDurUnits(0)).toBe("0m");
    expect(fmtDurUnits(1440)).toBe("1d");
  });

  it("rejects non-durations", () => {
    expect(parseCasualDuration("")).toBeUndefined();
    expect(parseCasualDuration("soon")).toBeUndefined();
  });
});
