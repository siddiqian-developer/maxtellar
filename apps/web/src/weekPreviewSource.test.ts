/**
 * REGRESSION (bug found 2026-07-16): `weekPreview` blocks used to carry the
 * INJECTED task's minted id (`pv-<date>-<n>`) in `templateId`. Nothing could look
 * a template back up by it, so three §4.4/§4.6 behaviors silently no-op'd:
 * click→edit template, "Edit template…", and "Skip this day".
 * The block must carry the SOURCE id (WeekTemplate.id / DatedTask.id).
 */
import { describe, it, expect } from "vitest";
import type { DatedEntry, WeekTemplate } from "@maxtellar/core";
import { weekPreview, type WeekColumn } from "./weekPreview";

const MON = 1;
const COLS: WeekColumn[] = Array.from({ length: 7 }, (_, d) => ({ date: d * 1440, weekday: d }));
const run = (templates: WeekTemplate[], dated: DatedEntry[] = []) =>
  weekPreview(templates, dated, COLS, [], 5, 600, 60);

function tpl(o: Partial<WeekTemplate> & { title: string; weekdays: number[]; rank: string }): WeekTemplate {
  return {
    id: o.id ?? o.title, headId: "Work", activityId: "Coding", timing: "budgeted",
    tier: "normal", ommf: false, slideable: true, breakable: true, ...o,
  } as WeekTemplate;
}

describe("weekPreview blocks carry the SOURCE id (regression)", () => {
  it("a template block's templateId is the TEMPLATE's id, not the injected task's", () => {
    const p = run([tpl({ id: "tpl-gym", title: "Gym", budget: 60, weekdays: [MON], rank: "a" })]);
    const block = p.days.find((d) => d.weekday === MON)!.blocks[0]!;
    expect(block.templateId).toBe("tpl-gym");
    expect(block.templateId).not.toMatch(/^pv-/); // the old bug's shape
  });

  it("the id round-trips: it finds its template in the plan", () => {
    const templates = [tpl({ id: "tpl-gym", title: "Gym", budget: 60, weekdays: [MON], rank: "a" })];
    const block = run(templates).days.find((d) => d.weekday === MON)!.blocks[0]!;
    // This is exactly what WeekView's click→edit does; it used to return undefined.
    expect(templates.find((t) => t.id === block.templateId)).toBeDefined();
  });

  it("SKIPPING that id actually removes the block (the no-op bug)", () => {
    const templates = [tpl({ id: "tpl-gym", title: "Gym", budget: 60, weekdays: [MON], rank: "a" })];
    const before = run(templates).days.find((d) => d.weekday === MON)!.blocks[0]!;
    // The UI stores block.templateId in the date's skips (SET_DATED).
    const dated: DatedEntry[] = [{ date: MON * 1440, adds: [], skips: [before.templateId], overrides: [] }];
    const after = run(templates, dated).days.find((d) => d.weekday === MON)!.blocks;
    expect(after).toHaveLength(0);
  });

  it("a §4.6 dated one-off carries its DatedTask id (so it can be edited/deleted)", () => {
    const dated: DatedEntry[] = [{
      date: MON * 1440,
      adds: [{ id: "dt-dentist", title: "Dentist", headId: "Health", activityId: "Appt",
        timing: "budgeted", budget: 60, tier: "normal", ommf: false, slideable: true,
        breakable: true, rank: "a" } as never],
      skips: [], overrides: [],
    }];
    const block = run([], dated).days.find((d) => d.weekday === MON)!.blocks[0]!;
    expect(block.dated).toBe(true);
    expect(block.templateId).toBe("dt-dentist");
  });
});
