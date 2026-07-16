/**
 * R5 — analytics day windows are SLEEP-CYCLE days (§4) once any SOD has sealed a
 * DayRecord (sealed cycles + the forming day, real [start,end) boundaries, not
 * clipped to 24h), with a calendar-day fallback before the first SOD.
 */
import { describe, it, expect } from "vitest";
import { initialState, type State, type DayRecord } from "@maxtellar/core";
import { analyticsDays } from "./AnalyticsScreen";

const DAY = 1440;

describe("analyticsDays (R5)", () => {
  it("falls back to 7 calendar days before any SOD", () => {
    const s = initialState(10 * DAY + 500);
    const days = analyticsDays(s);
    expect(days).toHaveLength(7);
    expect(days.every((d) => d.end - d.start === DAY)).toBe(true);
    expect(days.every((d) => !d.forming)).toBe(true);
  });

  it("uses sealed DayRecords + a forming day once SOD has run", () => {
    const rec = (id: string, start: number, end: number): DayRecord => ({ id, start, end, reportDate: start });
    const now = 5 * DAY + 600;
    const s: State = {
      ...initialState(now),
      days: [rec("d1", 0, 1500), rec("d2", 1500, 4000)], // a >24h cycle (2500m)
    };
    const days = analyticsDays(s);
    expect(days).toHaveLength(3); // 2 sealed + forming
    // sealed windows are the real boundaries (not 24h)
    expect(days[0]).toMatchObject({ start: 0, end: 1500, forming: false });
    expect(days[1]).toMatchObject({ start: 1500, end: 4000, forming: false });
    // forming day = last DayRecord.end → now
    expect(days[2]).toMatchObject({ start: 4000, end: now, forming: true });
  });

  it("keeps only the most recent 7 cycles", () => {
    const rec = (i: number): DayRecord => ({ id: `d${i}`, start: i * DAY, end: (i + 1) * DAY, reportDate: i * DAY });
    const s: State = { ...initialState(10 * DAY + 100), days: Array.from({ length: 10 }, (_, i) => rec(i)) };
    const days = analyticsDays(s);
    expect(days).toHaveLength(7);
    expect(days[days.length - 1]!.forming).toBe(true);
  });
});
