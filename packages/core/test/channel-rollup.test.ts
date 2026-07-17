/**
 * §2.6 — the per-head ledger is CHANNEL-AWARE.
 *   wall = spent + wasted + managed + breaks, and those minutes do not all belong
 *   to the task's own head:
 *     wasted  → Wasted Time      (§2.6)
 *     managed → Self-Management  (§2.6, the one sanctioned auto-log)
 *     breaks  → STAY on the head (§5.2: "60m task = 60m to the head, breaks included")
 * Before 2026-07-16 `achievedByHead` added the whole span to the task's head and
 * never read `channels`, so neither roll-up happened at all.
 */
import { describe, it, expect } from "vitest";
import { achievedByHead } from "../src/week.js";
import { type Channels, type HistoryEntry } from "../src/types.js";
import { SELF_MANAGEMENT_ID, WASTED_TIME_ID } from "../src/budget.js";

const ch = (o: Partial<Channels>): Channels => ({ spent: 0, wasted: 0, managed: 0, breaks: 0, ...o });

const entry = (start: number, end: number, channels: Channels, headId = "Work"): HistoryEntry => ({
  id: `h-${start}`, taskId: "t1", title: "Task", headId, activityId: "A",
  kind: "occupancy", start, end, outcome: "completed", channels,
});

const total = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

describe("§2.6 channel-aware roll-up", () => {
  it("wasted rolls up into the Wasted Time head, not the task's", () => {
    // 60m wall: 50 work + 10 wasted.
    const r = achievedByHead([entry(0, 60, ch({ spent: 50, wasted: 10 }))], 0, 1000);
    expect(r["Work"]).toBe(50);
    expect(r[WASTED_TIME_ID]).toBe(10);
  });

  it("managed is credited to Self-Management, not the task's head", () => {
    const r = achievedByHead([entry(0, 60, ch({ spent: 45, managed: 15 }))], 0, 1000);
    expect(r["Work"]).toBe(45);
    expect(r[SELF_MANAGEMENT_ID]).toBe(15);
  });

  it("breaks STAY with the task's head (§5.2: 60m task = 60m to the head)", () => {
    const r = achievedByHead([entry(0, 60, ch({ spent: 50, breaks: 10 }))], 0, 1000);
    expect(r["Work"]).toBe(60);
    expect(r[WASTED_TIME_ID]).toBeUndefined();
  });

  it("all four channels at once split correctly", () => {
    // 60m wall = 30 spent + 10 wasted + 15 managed + 5 breaks
    const r = achievedByHead([entry(0, 60, ch({ spent: 30, wasted: 10, managed: 15, breaks: 5 }))], 0, 1000);
    expect(r["Work"]).toBe(35); // spent + breaks
    expect(r[WASTED_TIME_ID]).toBe(10);
    expect(r[SELF_MANAGEMENT_ID]).toBe(15);
  });

  it("CONSERVES: the split always re-sums to the span", () => {
    const r = achievedByHead([entry(0, 60, ch({ spent: 30, wasted: 10, managed: 15, breaks: 5 }))], 0, 1000);
    expect(total(r)).toBe(60);
  });

  it("a clipped entry contributes its channels pro rata, and still conserves", () => {
    // Half the 60m entry is inside the window → half of each channel.
    const r = achievedByHead([entry(0, 60, ch({ spent: 30, wasted: 10, managed: 20 }))], 30, 1000);
    expect(total(r)).toBe(30); // exactly the clipped span — nothing invented or lost
    expect(r[WASTED_TIME_ID]).toBe(5);
    expect(r[SELF_MANAGEMENT_ID]).toBe(10);
    expect(r["Work"]).toBe(15);
  });

  it("conserves under rounding (odd fractions can't leak a minute)", () => {
    // A 7m clip of a 60m entry: channel shares are fractional.
    const r = achievedByHead([entry(0, 60, ch({ spent: 20, wasted: 17, managed: 23 }))], 0, 7);
    expect(total(r)).toBe(7);
  });

  it("an all-wasted task gives its head nothing", () => {
    const r = achievedByHead([entry(0, 30, ch({ wasted: 30 }))], 0, 1000);
    expect(r["Work"]).toBeUndefined();
    expect(r[WASTED_TIME_ID]).toBe(30);
  });

  it("a clean task is unaffected (the common case)", () => {
    const r = achievedByHead([entry(0, 60, ch({ spent: 60 }))], 0, 1000);
    expect(r).toEqual({ Work: 60 });
  });
});
