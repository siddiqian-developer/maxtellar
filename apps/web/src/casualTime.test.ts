/**
 * Casual time / date / duration grammar (§06 + §7.0.2). Covers every example
 * the user gave, plus the two confirmed contradiction rulings.
 */
import { describe, it, expect } from "vitest";
import {
  parseTimeOfDay,
  parseCasualTime,
  parseCasualDuration,
  resolvePastTime,
  fitPastInterval,
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
    expect(fmtDayTime(r.value!, NOW, true)).toBe("03:00 PM");
  });

  it("'tom, 15:0' → Tomorrow 03:00PM", () => {
    const r = parseCasualTime("tom, 15:0", NOW);
    expect(r.dayOffset).toBe(1);
    expect(r.explicitDay).toBe(true);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Tomorrow, 03:00 PM");
  });

  it("misspelled 'tmorow, 03:PM' → Tomorrow 03:00PM", () => {
    const r = parseCasualTime("tmorow, 03:PM", NOW);
    expect(r.dayOffset).toBe(1);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Tomorrow, 03:00 PM");
  });

  it("'3:00PM tomorrow' → Tomorrow 03:00PM (day word trailing)", () => {
    const r = parseCasualTime("3:00PM tomorrow", NOW);
    expect(r.dayOffset).toBe(1);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Tomorrow, 03:00 PM");
  });

  it("an explicit far date resolves to that day (offset ≥ 2)", () => {
    const r = parseCasualTime("jul 22, 9am", NOW);
    expect(r.explicitDay).toBe(true);
    expect(r.dayOffset).toBe(7);
    expect(fmtDayTime(r.value!, NOW, true)).toBe("Wed Jul 22, 09:00 AM");
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

describe("resolvePastTime — history/back-log mirror (direction is caller-owned)", () => {
  it("a past bare clock stays today, silently (already in the past)", () => {
    const r = resolvePastTime("07:00", NOW); // now 08:30
    expect(dayOffsetOf(r.value!, NOW)).toBe(0);
    expect(r.value).toBe(dayStartMin(NOW) + 7 * 60);
    expect(r.notes).toEqual([]);
  });

  it("a bare clock in the future resolves to YESTERDAY, with a note", () => {
    const r = resolvePastTime("3pm", NOW); // 15:00 > now 08:30
    expect(dayOffsetOf(r.value!, NOW)).toBe(-1);
    expect(r.value).toBe(dayStartMin(NOW) - 1440 + 15 * 60);
    expect(r.notes.join(" ")).toMatch(/yesterday/i);
  });

  it("an explicit future day clamps to now", () => {
    const r = resolvePastTime("tom 9am", NOW);
    expect(r.value).toBe(NOW);
    expect(r.notes.join(" ")).toMatch(/can't cross|clamp/i);
  });

  it("an explicit past day is respected without notes", () => {
    const r = resolvePastTime("yesterday 10pm", NOW);
    expect(dayOffsetOf(r.value!, NOW)).toBe(-1);
    expect(r.value).toBe(dayStartMin(NOW) - 1440 + 22 * 60);
    expect(r.notes).toEqual([]);
  });

  it("short yesterday aliases resolve to the day before ('yes 3 am' → yesterday 03:00)", () => {
    for (const s of ["yes 3 am", "yst 3am", "ytd 3:00"]) {
      const r = resolvePastTime(s, NOW);
      expect(dayOffsetOf(r.value!, NOW), s).toBe(-1);
      expect(r.value, s).toBe(dayStartMin(NOW) - 1440 + 3 * 60);
    }
  });

  it("a year-less explicit date resolves to the PAST, not next year (pastBias)", () => {
    // NOW = Jul 15 2026; "jul 1" must mean Jul 1 2026 (past), not Jul 1 2027.
    const r = resolvePastTime("jul 1 8am", NOW);
    const jul1 = Math.floor(new Date(2026, 6, 1, 8, 0).getTime() / 60000);
    expect(r.value).toBe(jul1);
    expect(r.value! < NOW).toBe(true);
    expect(r.notes).toEqual([]); // ≤ now, no clamp (editor applies the floor)
  });

  it("unparseable input returns undefined, no notes", () => {
    const r = resolvePastTime("zzz", NOW);
    expect(r.value).toBeUndefined();
    expect(r.notes).toEqual([]);
  });
});

describe("fitPastInterval — overlap-aware snapping (feedback 2026-07-15)", () => {
  const fmt = (m: number): string => String(m);
  const NOW2 = 1000;
  const FLOOR = 0;

  it("leaves a valid interval untouched (no notes)", () => {
    const r = fitPastInterval(100, 200, [], NOW2, FLOOR, fmt);
    expect(r).toMatchObject({ start: 100, end: 200, ok: true });
    expect(r.notes).toEqual([]);
  });

  it("End before Start snaps End up to now (no items below)", () => {
    const r = fitPastInterval(500, 300, [], NOW2, FLOOR, fmt);
    expect(r.start).toBe(500);
    expect(r.end).toBe(1000); // now
    expect(r.ok).toBe(true);
    expect(r.notes.join(" ")).toMatch(/now/i);
  });

  it("End snaps to the START of the next entry below, not past it", () => {
    const others = [{ start: 600, end: 800 }];
    const r = fitPastInterval(400, 900, others, NOW2, FLOOR, fmt);
    expect(r.end).toBe(600); // clamped to the next entry's start
    expect(r.notes.join(" ")).toMatch(/next entry/i);
  });

  it("End before Start with an item below snaps to that item's start", () => {
    const others = [{ start: 700, end: 900 }];
    const r = fitPastInterval(500, 400, others, NOW2, FLOOR, fmt);
    expect(r.end).toBe(700);
    expect(r.ok).toBe(true);
  });

  it("Start below the floor snaps up to the floor", () => {
    const r = fitPastInterval(-50, 200, [], NOW2, 100, fmt);
    expect(r.start).toBe(100);
    expect(r.notes.join(" ")).toMatch(/editable window/i);
  });

  it("Start inside an existing entry moves to its end", () => {
    const others = [{ start: 100, end: 300 }];
    const r = fitPastInterval(200, 500, others, NOW2, FLOOR, fmt);
    expect(r.start).toBe(300);
    expect(r.end).toBe(500);
    expect(r.notes.join(" ")).toMatch(/overlapped/i);
  });

  it("Start on the boundary of an entry moves past it, end kept if valid", () => {
    const others = [{ start: 500, end: 700 }];
    const r = fitPastInterval(500, 900, others, NOW2, FLOOR, fmt);
    // 500 is inside [500,700) → start moves to 700; end 900 ≤ now, no next → kept
    expect(r.start).toBe(700);
    expect(r.end).toBe(900);
    expect(r.ok).toBe(true);
  });

  it("genuinely no room → ok=false, span collapses", () => {
    const others = [{ start: 400, end: 1000 }];
    const r = fitPastInterval(450, 900, others, NOW2, FLOOR, fmt);
    // start inside [400,1000) → moved to 1000 = now; ceiling = now = 1000 ≤ start
    expect(r.ok).toBe(false);
    expect(r.notes.join(" ")).toMatch(/no room/i);
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
