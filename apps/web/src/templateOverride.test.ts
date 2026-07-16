/**
 * §4.6 third power — per-date override editor logic (`diffOverride`).
 *
 * The editor stores only the DIFF from the template: undefined fields inherit
 * (matching core `applyOverride`), and "nothing differs" clears the override
 * entirely. This is what keeps a later TEMPLATE edit flowing through to dates
 * the user never touched — an override that copied every field would silently
 * freeze the whole task on that date.
 */
import { describe, it, expect } from "vitest";
import type { WeekTemplate } from "@maxtellar/core";
import { diffOverride, weekPreview } from "./weekPreview";

const tpl = (over: Partial<WeekTemplate>): WeekTemplate => ({
  id: "tpl-1",
  rank: "m",
  tier: "normal",
  weekdays: [1],
  title: "Standup",
  headId: "Main Work",
  timing: "fixed",
  anchorStartTod: 9 * 60,
  anchorEndTod: 10 * 60,
  budget: 60,
  ommf: false,
  slideable: false,
  breakable: false,
  ...over,
} as WeekTemplate);

describe("§4.6 diffOverride — minimal per-date override", () => {
  it("stores only the fields that differ from the template", () => {
    const ov = diffOverride(tpl({}), { anchorStartTod: 11 * 60, anchorEndTod: 10 * 60, budget: 60 });
    expect(ov).toEqual({ templateId: "tpl-1", anchorStartTod: 11 * 60 });
  });

  it("returns null when nothing differs (clears an existing override)", () => {
    expect(diffOverride(tpl({}), { anchorStartTod: 9 * 60, anchorEndTod: 10 * 60, budget: 60 })).toBeNull();
  });

  it("an undefined draft field inherits — it is never written into the override", () => {
    const ov = diffOverride(tpl({}), { budget: 90 });
    expect(ov).toEqual({ templateId: "tpl-1", budget: 90 });
  });

  it("the stored override actually moves the block on that date ONLY (via weekPreview)", () => {
    const t = tpl({});
    const monday = 29_000_000 - (29_000_000 % 1440); // any local-midnight stand-in
    const cols = [
      { date: monday, weekday: 1 },
      { date: monday + 7 * 1440, weekday: 1 },
    ];
    const ov = diffOverride(t, { anchorStartTod: 14 * 60, anchorEndTod: 15 * 60 })!;
    const pv = weekPreview([t], [{ date: monday, adds: [], skips: [], overrides: [ov] }], cols, [], 5, 600, 30, true);
    const [d1, d2] = pv.days;
    expect(d1!.blocks[0]!.start).toBe(14 * 60); // overridden date moved
    expect(d2!.blocks[0]!.start).toBe(9 * 60); // the next week's same weekday untouched
  });
});
