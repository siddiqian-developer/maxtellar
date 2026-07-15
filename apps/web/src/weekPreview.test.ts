import { describe, it, expect } from "vitest";
import type { WeekTemplate } from "@maxtellar/core";
import { weekPreview, WEEK_DAY_START } from "./weekPreview";

const MON = 1;
const TUE = 2;

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
    const templates = [
      tpl({ title: "Gym", budget: 60, weekdays: [MON], rank: "a" }),
      tpl({ title: "Standup", timing: "fixed", anchorStartTod: 9 * 60, anchorEndTod: 9 * 60 + 30, budget: 30, weekdays: [MON], rank: "b" }),
    ];
    const p = weekPreview(templates, 5, 600, 60);
    const mon = p.days.find((d) => d.weekday === MON)!;
    const gym = mon.blocks.find((b) => b.title === "Gym")!;
    const standup = mon.blocks.find((b) => b.title === "Standup")!;
    // budgeted Gym fills from the day-start cursor
    expect(gym.start).toBe(WEEK_DAY_START);
    expect(gym.end).toBe(WEEK_DAY_START + 60);
    // fixed Standup pins at its time
    expect(standup.start).toBe(9 * 60);
    expect(standup.end).toBe(9 * 60 + 30);
    // other days empty
    expect(p.days.find((d) => d.weekday === TUE)!.blocks).toHaveLength(0);
  });

  it("orders budgeted tasks by rank (contiguous fill, no overlap)", () => {
    const templates = [
      tpl({ title: "First", budget: 60, weekdays: [MON], rank: "a" }),
      tpl({ title: "Second", budget: 30, weekdays: [MON], rank: "b" }),
    ];
    const p = weekPreview(templates, 5, 600, 60);
    const mon = p.days.find((d) => d.weekday === MON)!;
    const first = mon.blocks.find((b) => b.title === "First")!;
    const second = mon.blocks.find((b) => b.title === "Second")!;
    expect(first.start).toBe(WEEK_DAY_START);
    expect(second.start).toBeGreaterThanOrEqual(first.end); // ranked below, no overlap
  });
});
