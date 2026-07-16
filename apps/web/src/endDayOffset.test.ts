/**
 * §4.4 multi-day template span (`anchorEndDayOffset`, ruled 2026-07-17).
 *
 * A template anchor has no date (§7.0.5) — it repeats — so it reaches later days
 * by DAY COUNT, not by calendar. Before this, the only way to cross midnight was
 * an implicit "end <= start → overnight" inference, which silently capped every
 * template at 24h.
 */
import { describe, it, expect } from "vitest";
import {
  clampDayOffset, dayOffsetLabel, MAX_END_DAY_OFFSET,
  impliedEndDayOffset, spanOfAnchors,
  fmtAnchorEnd, snapEndDay,
} from "./components/TaskSpecFields";
import { parseAnchorEnd } from "./casualTime";

describe("§4.4 'next day' — every variation the user might type", () => {
  const at = (h: number, m = 0): { dayOffset: 0 | 1; tod: number } => ({ dayOffset: 1, tod: h * 60 + m });

  it.each([
    "next day, 11am", "next day 11am", "nextday 11am", "next-day 11am",
    "Next Day, 11:00 AM",          // the field's own reformatted output round-trips
    "nxt day 11am", "next  day  11am",
    "tomorrow 11am", "tom 11am", "tmrw 11am", "tmr 11am", "tomo 11am",
    "tomorow 11am", "tommorow 11am", "tmorow 11am", // genuine misspellings
    "+1d 11am", "+1 day 11am", "1 day 11am", "+1day 11am",
    "nd 11am", "overnight 11am",
    "11am next day", "11am tomorrow",  // qualifier in any position
  ])("reads %j as the next day at 11:00", (input) => {
    expect(parseAnchorEnd(input)).toEqual(at(11));
  });

  it("treats a bare time as the same day", () => {
    expect(parseAnchorEnd("11am")).toEqual({ dayOffset: 0, tod: 11 * 60 });
    expect(parseAnchorEnd("7:30")).toEqual({ dayOffset: 0, tod: 7 * 60 + 30 });
  });

  it("accepts an explicit same-day qualifier too", () => {
    expect(parseAnchorEnd("same day, 5pm")).toEqual({ dayOffset: 0, tod: 17 * 60 });
    expect(parseAnchorEnd("today 5pm")).toEqual({ dayOffset: 0, tod: 17 * 60 });
  });

  it("rejects input with no time in it", () => {
    expect(parseAnchorEnd("next day")).toBeUndefined();
    expect(parseAnchorEnd("")).toBeUndefined();
    expect(parseAnchorEnd("banana")).toBeUndefined();
  });
});

describe("§4.4 the field states the day explicitly", () => {
  it("writes the day into the text, so it's never implicit", () => {
    expect(fmtAnchorEnd(10 * 60, 1, true)).toBe("Next Day, 10:00 AM");
    expect(fmtAnchorEnd(10 * 60, 0, true)).toBe("10:00 AM");
    expect(fmtAnchorEnd(undefined, 0, true)).toBe("");
    // "Next Day" picked before a time: the qualifier waits, no time invented.
    expect(fmtAnchorEnd(undefined, 1, true)).toBe("Next Day, ");
  });

  it("round-trips: what it displays, it re-reads", () => {
    const shown = fmtAnchorEnd(23 * 60 + 30, 1, true);
    expect(shown).toBe("Next Day, 11:30 PM");
    expect(parseAnchorEnd(shown)).toEqual({ dayOffset: 1, tod: 23 * 60 + 30 });
  });
});

describe("§4.4 end-day offset", () => {
  it("stops at next day — planning is for no more than 24 hours", () => {
    expect(MAX_END_DAY_OFFSET).toBe(1);
    expect(clampDayOffset(2)).toBe(1);
    expect(clampDayOffset(99)).toBe(1);
  });

  it("snaps a negative or fractional offset at the boundary (§7.0.2)", () => {
    expect(clampDayOffset(-1)).toBe(0);
    expect(clampDayOffset(0.4)).toBe(0);
    expect(clampDayOffset(0.6)).toBe(1);
  });

  it("labels the offset the way the user picked it", () => {
    expect(dayOffsetLabel(0)).toBe("Same Day");
    expect(dayOffsetLabel(1)).toBe("Next Day");
  });
});

describe("§7.0.2 overnight snap — the old silent inference, made visible", () => {
  const p = (h: number): number => h * 60;

  it("snaps an end at/before the start on 'same day' to the next day", () => {
    // 11pm → 7am can only mean tomorrow. Was assumed silently; now snapped+shown.
    expect(impliedEndDayOffset(0, p(23), p(7))).toBe(1);
    // Equal times are a zero-length same-day span → also the next day.
    expect(impliedEndDayOffset(0, p(9), p(9))).toBe(1);
  });

  it("leaves an ordinary same-day span alone", () => {
    expect(impliedEndDayOffset(0, p(9), p(17))).toBe(0);
  });

  it("never overrides an EXPLICIT offset — the user's pick wins", () => {
    expect(impliedEndDayOffset(1, p(23), p(7))).toBe(1);
    expect(impliedEndDayOffset(1, p(9), p(17))).toBe(1);
  });

  it("does not guess while a field is still empty", () => {
    expect(impliedEndDayOffset(0, undefined, p(7))).toBe(0);
    expect(impliedEndDayOffset(0, p(23), undefined)).toBe(0);
  });
});

const span = spanOfAnchors;

describe("§4.4 span across days", () => {
  it("spans a same-day task", () => {
    expect(span(9 * 60, 17 * 60, 0)).toBe(8 * 60);
  });

  it("spans overnight via the next-day offset (the Sleep case)", () => {
    // 11pm → 7am next day = 8h. The old inference guessed this; now it's explicit.
    expect(span(23 * 60, 7 * 60, 1)).toBe(8 * 60);
  });

  it("allows a full 24h span, the ceiling", () => {
    expect(span(9 * 60, 9 * 60, 1)).toBe(1440);
  });

  it("refuses a span over 24 hours — planning doesn't reach that far", () => {
    // 9am → 5pm "next day" would be 32h. Not a plan.
    expect(span(9 * 60, 17 * 60, 1)).toBeUndefined();
  });

  it("rejects an end that lands at or before the start on the same day", () => {
    expect(span(17 * 60, 9 * 60, 0)).toBeUndefined();
    expect(span(9 * 60, 9 * 60, 0)).toBeUndefined();
  });
});

describe("§7.0.2 the picked day snaps to the nearest possible", () => {
  it("keeps a pick that already yields a valid span", () => {
    expect(snapEndDay(9 * 60, 17 * 60, 0)).toBe(0);
    expect(snapEndDay(23 * 60, 7 * 60, 1)).toBe(1);
  });

  it("Next Day on a span that would exceed 24h snaps back to Same Day", () => {
    // 9am -> 5pm "next day" would be 32h; Same Day (8h) is the only valid one.
    expect(snapEndDay(9 * 60, 17 * 60, 1)).toBe(0);
  });

  it("Same Day on an end at/before the start snaps to Next Day", () => {
    // 11pm -> 7am "same day" is negative; Next Day (8h) is the only valid one.
    expect(snapEndDay(23 * 60, 7 * 60, 0)).toBe(1);
  });

  it("leaves the pick alone when the start or end isn't set yet", () => {
    expect(snapEndDay(undefined, 7 * 60, 1)).toBe(1);
    expect(snapEndDay(23 * 60, undefined, 0)).toBe(0);
  });
});
