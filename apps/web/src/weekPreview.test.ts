import { describe, it, expect } from "vitest";
import type { DatedEntry, WeekTemplate } from "@maxtellar/core";
import { weekPreview, WEEK_DAY_START, type WeekColumn } from "./weekPreview";

const MON = 1;
const TUE = 2;
// Synthetic columns: date = weekday*1440 (relative preview; blocks are reported
// relative to each column's date, so anchors read as minutes-into-day).
const COLS: WeekColumn[] = Array.from({ length: 7 }, (_, d) => ({ date: d * 1440, weekday: d }));
const run = (templates: WeekTemplate[], dated: DatedEntry[] = [], offDays: number[] = []) =>
  weekPreview(templates, dated, COLS, offDays, 5, 600, 60);

function tpl(o: Partial<WeekTemplate> & { title: string; weekdays: number[]; rank: string }): WeekTemplate {
  return {
    id: o.id ?? o.title,
    headId: "Work",
    activityId: "Coding",
    timing: "budgeted",
    tier: "normal",
    ommf: false,
    slideable: true,
    breakable: true,
    ...o,
  } as WeekTemplate;
}

describe("weekPreview", () => {
  it("pins anchored tasks at their time and fills budgeted by rank from the day-start", () => {
    const p = run([
      tpl({ title: "Gym", budget: 60, weekdays: [MON], rank: "a" }),
      tpl({ title: "Standup", timing: "fixed", anchorStartTod: 9 * 60, anchorEndTod: 9 * 60 + 30, budget: 30, weekdays: [MON], rank: "b" }),
    ]);
    const mon = p.days.find((d) => d.weekday === MON)!;
    const gym = mon.blocks.find((b) => b.title === "Gym")!;
    const standup = mon.blocks.find((b) => b.title === "Standup")!;
    expect(gym.start).toBe(WEEK_DAY_START);
    expect(gym.end).toBe(WEEK_DAY_START + 60);
    expect(standup.start).toBe(9 * 60);
    expect(standup.end).toBe(9 * 60 + 30);
    expect(p.days.find((d) => d.weekday === TUE)!.blocks).toHaveLength(0);
  });

  it("orders budgeted tasks by rank (contiguous fill, no overlap)", () => {
    const p = run([
      tpl({ title: "First", budget: 60, weekdays: [MON], rank: "a" }),
      tpl({ title: "Second", budget: 30, weekdays: [MON], rank: "b" }),
    ]);
    const mon = p.days.find((d) => d.weekday === MON)!;
    const first = mon.blocks.find((b) => b.title === "First")!;
    const second = mon.blocks.find((b) => b.title === "Second")!;
    expect(first.start).toBe(WEEK_DAY_START);
    expect(second.start).toBeGreaterThanOrEqual(first.end);
  });

  it("§4.6: an OFF day clears templates but still shows dated adds", () => {
    const templates = [tpl({ title: "Standup", budget: 30, weekdays: [MON], rank: "a" })];
    const dated: DatedEntry[] = [{
      date: MON * 1440, skips: [], overrides: [],
      adds: [{ id: "d1", rank: "m", title: "Dentist", headId: "Health", activityId: "Dentist", timing: "budgeted", tier: "normal", ommf: false, slideable: true, breakable: true, budget: 60 }],
    }];
    const p = weekPreview(templates, dated, COLS, [MON], 5, 600, 60);
    const mon = p.days.find((d) => d.weekday === MON)!;
    expect(mon.isOff).toBe(true);
    expect(mon.blocks.map((b) => b.title)).toEqual(["Dentist"]); // template skipped, dated add kept
    expect(mon.blocks[0]!.dated).toBe(true);
  });

  it("§4.6: a dated add colliding with a fixed template raises a conflict", () => {
    const templates = [tpl({ title: "Meeting", timing: "fixed", anchorStartTod: 9 * 60, anchorEndTod: 17 * 60, budget: 8 * 60, weekdays: [MON], rank: "a" })];
    const dated: DatedEntry[] = [{
      date: MON * 1440, skips: [], overrides: [],
      adds: [{ id: "d1", rank: "m", title: "Appt", headId: "Health", activityId: "Appt", timing: "fixed", tier: "normal", ommf: false, slideable: false, breakable: false, anchorStartTod: 10 * 60, anchorEndTod: 11 * 60, budget: 60 }],
    }];
    const p = weekPreview(templates, dated, COLS, [], 5, 600, 60);
    expect(p.conflicts.length).toBeGreaterThan(0);
    expect(p.days.find((d) => d.weekday === MON)!.conflict).toBeTruthy();
  });
});

/**
 * §4.4 an overnight task occupies hours on TWO days. Its minutes are attributed
 * to each day they physically fall on — §11 budgets are per-day CAPACITY, so
 * hours sitting in Tuesday must consume Tuesday's, or the user over-books it.
 */
describe("§4.4 overnight split", () => {
  const sleep = tpl({
    title: "Sleep", timing: "fixed", weekdays: [MON], rank: "a",
    anchorStartTod: 23 * 60, anchorEndTod: 7 * 60, anchorEndDayOffset: 1, budget: 8 * 60,
  });

  it("keeps the evening slice on the day it starts, clipped at midnight", () => {
    const mon = run([sleep]).days.find((d) => d.weekday === MON)!;
    const b = mon.blocks.find((x) => x.title === "Sleep")!;
    expect(b.start).toBe(23 * 60);
    expect(b.end).toBe(1440); // never runs off the bottom of the column
    expect(b.continued).toBeUndefined();
  });

  it("attributes the morning slice to the NEXT day, marked as continued", () => {
    const tue = run([sleep]).days.find((d) => d.weekday === TUE)!;
    const b = tue.blocks.find((x) => x.title === "Sleep")!;
    expect(b.start).toBe(0);
    expect(b.end).toBe(7 * 60); // Tuesday's morning is SPENT, not free
    expect(b.continued).toBe(true);
  });

  it("stays ONE task — both slices carry the same source id", () => {
    const p = run([sleep]);
    const mon = p.days.find((d) => d.weekday === MON)!.blocks.find((x) => x.title === "Sleep")!;
    const tue = p.days.find((d) => d.weekday === TUE)!.blocks.find((x) => x.title === "Sleep")!;
    expect(tue.templateId).toBe(mon.templateId);
    // The two slices re-sum to the whole span — no minutes invented or lost.
    expect((mon.end - mon.start) + (tue.end - tue.start)).toBe(8 * 60);
  });

  it("leaves an ordinary same-day task on its own day", () => {
    const p = run([tpl({ title: "Gym", budget: 60, weekdays: [MON], rank: "a" })]);
    expect(p.days.find((d) => d.weekday === TUE)!.blocks).toHaveLength(0);
  });
});
