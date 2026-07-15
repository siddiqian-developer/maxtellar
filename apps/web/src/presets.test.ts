/**
 * §2.9 preset matching — the deterministic ML auto-switch signal.
 */
import { describe, it, expect } from "vitest";
import { matchPreset, presetById, PRESETS } from "./presets";
import { RECHARGE, FOOD } from "@maxtellar/core";

describe("matchPreset (title → preset auto-switch)", () => {
  it("matches Sleep titles", () => {
    expect(matchPreset("Sleep")?.id).toBe("sleep");
    expect(matchPreset("night sleep")?.id).toBe("sleep");
    expect(matchPreset("time for bedtime")?.id).toBe("sleep");
  });

  it("matches Nap titles, longest keyword wins over a stray substring", () => {
    expect(matchPreset("Nap")?.id).toBe("nap");
    expect(matchPreset("power nap")?.id).toBe("nap");
    expect(matchPreset("afternoon siesta")?.id).toBe("nap");
  });

  it("matches Food titles including specific meals", () => {
    expect(matchPreset("Food")?.id).toBe("food");
    expect(matchPreset("Lunch")?.id).toBe("food");
    expect(matchPreset("dinner with team")?.id).toBe("food");
    expect(matchPreset("quick breakfast")?.id).toBe("food");
  });

  it("returns null for a non-preset title", () => {
    expect(matchPreset("Write the report")).toBeNull();
    expect(matchPreset("")).toBeNull();
    // whole-word match: "snapshot" must NOT match the "nap" keyword
    expect(matchPreset("review snapshot")).toBeNull();
  });
});

describe("preset field bundles (§2.9)", () => {
  it("Sleep/Nap live under Recharge, lock the title, set sleepKind", () => {
    const sleep = presetById("sleep");
    expect(sleep).toMatchObject({ title: "Sleep", subhead: "Sleep", head: RECHARGE, sleepKind: "sleep", titleEditable: false });
    const nap = presetById("nap");
    expect(nap).toMatchObject({ head: RECHARGE, sleepKind: "nap", titleEditable: false });
  });

  it("Food lives under Food, has an editable title, and no sleepKind", () => {
    const food = presetById("food");
    expect(food).toMatchObject({ title: "Food", subhead: "Food", head: FOOD, titleEditable: true });
    expect(food.sleepKind).toBeUndefined();
  });

  it("every preset id round-trips", () => {
    for (const p of PRESETS) expect(presetById(p.id)).toBe(p);
  });
});
