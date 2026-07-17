/**
 * §2.9/§2.10b preset matching + resolution — the deterministic ML auto-switch
 * signal, and the source-aware field resolution (flat / week-plan / settings).
 */
import { describe, it, expect } from "vitest";
import { matchPreset, resolvePreset, SHIPPED_PRESETS, blankPresetFor } from "./presets";
import { SLEEP_ID, NAP, FOOD_ID, EXERCISE_ID, LEARNING_ID, initialState, type State } from "@maxtellar/core";

const find = (id: string) => SHIPPED_PRESETS.find((p) => p.id === id)!;
// Nap is a Sleep sub-head now, not its own head (revised 2026-07-19) — its
// preset id is synthesized (see presets.ts's PresetConfig.id comment).
const NAP_PRESET_ID = `${SLEEP_ID}::${NAP}`;

describe("matchPreset (title → preset auto-switch)", () => {
  it("matches Sleep titles", () => {
    expect(matchPreset("Sleep", SHIPPED_PRESETS)?.id).toBe(SLEEP_ID);
    expect(matchPreset("night sleep", SHIPPED_PRESETS)?.id).toBe(SLEEP_ID);
    expect(matchPreset("time for bedtime", SHIPPED_PRESETS)?.id).toBe(SLEEP_ID);
  });

  it("matches Nap titles, longest keyword wins over a stray substring", () => {
    expect(matchPreset("Nap", SHIPPED_PRESETS)?.id).toBe(NAP_PRESET_ID);
    expect(matchPreset("power nap", SHIPPED_PRESETS)?.id).toBe(NAP_PRESET_ID);
    expect(matchPreset("afternoon siesta", SHIPPED_PRESETS)?.id).toBe(NAP_PRESET_ID);
  });

  it("matches Food titles including specific meals", () => {
    expect(matchPreset("Food", SHIPPED_PRESETS)?.id).toBe(FOOD_ID);
    expect(matchPreset("Lunch", SHIPPED_PRESETS)?.id).toBe(FOOD_ID);
    expect(matchPreset("dinner with team", SHIPPED_PRESETS)?.id).toBe(FOOD_ID);
    expect(matchPreset("quick breakfast", SHIPPED_PRESETS)?.id).toBe(FOOD_ID);
  });

  it("returns null for a non-preset title", () => {
    expect(matchPreset("Write the report", SHIPPED_PRESETS)).toBeNull();
    expect(matchPreset("", SHIPPED_PRESETS)).toBeNull();
    // whole-word match: "snapshot" must NOT match the "nap" keyword
    expect(matchPreset("review snapshot", SHIPPED_PRESETS)).toBeNull();
  });
});

describe("shipped preset bundles (§2.9/§11.1b/§2.10b)", () => {
  it("Sleep and Nap are both presets on the Sleep head (revised 2026-07-19: Nap is a sub-head, not its own head) and lock the title", () => {
    expect(find(SLEEP_ID)).toMatchObject({ label: "Sleep", headId: SLEEP_ID, titleLocked: true, timing: "budgeted", budgetSource: "settings" });
    expect(find(NAP_PRESET_ID)).toMatchObject({ label: "Nap", headId: SLEEP_ID, titleLocked: true, timing: "unscheduled" });
  });

  it("Food lives under its own head, unscheduled, editable title", () => {
    expect(find(FOOD_ID)).toMatchObject({ label: "Food", headId: FOOD_ID, titleLocked: false, timing: "unscheduled" });
  });

  it("Socialization is NOT a shipped preset (removed 2026-07-18)", () => {
    expect(SHIPPED_PRESETS.some((p) => p.label === "Socialization")).toBe(false);
  });

  it("ships in the user's specified order", () => {
    expect(SHIPPED_PRESETS.map((p) => p.label)).toEqual(["Exercise", "Food", "Learning", "Nap", "Meditation", "Sleep"]);
  });
});

describe("resolvePreset (§2.10b source resolution)", () => {
  const state: State = initialState(9 * 60);

  it("unscheduled timing populates neither budget nor anchors (per FIELD_ROLES)", () => {
    const r = resolvePreset(find(FOOD_ID), state);
    expect(r.timing).toBe("unscheduled");
    expect(r.budget).toBeUndefined();
    expect(r.startTod).toBeUndefined();
    expect(r.endTod).toBeUndefined();
  });

  it("settings source: Sleep's budget comes from week.sleepMinutes", () => {
    const withSleep: State = { ...state, week: { ...state.week, sleepMinutes: 420 } };
    const r = resolvePreset(find(SLEEP_ID), withSleep);
    expect(r.budget).toBe(420);
  });

  it("weekPlan source with no matching budget line, or no state, falls back to flat", () => {
    expect(resolvePreset(find(EXERCISE_ID), state).budget).toBe(find(EXERCISE_ID).budgetFlat);
    expect(resolvePreset(find(EXERCISE_ID), undefined).budget).toBe(find(EXERCISE_ID).budgetFlat);
  });

  it("weekPlan anchor source with no matching template falls back to flat start/end", () => {
    const r = resolvePreset(find(LEARNING_ID), state);
    expect(r.startTod).toBe(find(LEARNING_ID).startFlat);
    expect(r.endTod).toBe(find(LEARNING_ID).endFlat);
  });

  it("blankPresetFor seeds an inert unscheduled preset for a new head", () => {
    const b = blankPresetFor("Some␟Head");
    expect(b.timing).toBe("unscheduled");
    expect(b.headId).toBe("Some␟Head");
  });
});
