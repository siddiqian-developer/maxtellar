/**
 * INVARIANT GUARD (§4.4a) — `weekend ⊆ offDays`, pinned after the 2026-07-16 audit.
 *
 * "Every weekend day is always an OFF day (you cannot mark a day 'weekend' yet have
 * it inject)." This one spans the boundary — `weekendDays` is a WEB setting, `offDays`
 * is CORE state — which is exactly why nothing caught it: marking Friday weekend left
 * it tinted-as-weekend, unnumbered, and still injecting its templates.
 *
 * The two places that may change either set must both preserve the invariant:
 *  - SettingsPanel.toggleWeekend  (weekend changes → union into offDays)
 *  - WeekView.toggleOffDay        (off set changes → weekend stays locked ON)
 * Both are replicated here as pure functions; a static guard below pins the real
 * call sites to `SET_OFF_DAYS` so they can't quietly go back to `START_WEEK`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { weekendRun, workingDayNumber } from "./workingDays";

const SUN = 0, MON = 1, THU = 4, FRI = 5, SAT = 6;
const holds = (weekend: number[], off: number[]): boolean => weekend.every((d) => off.includes(d));

/** SettingsPanel.toggleWeekend's rule. */
const syncWeekend = (weekend: number[], off: number[]): number[] =>
  [...new Set([...off, ...weekend])].sort((a, b) => a - b);

/** WeekView.toggleOffDay's rule. */
const toggleOff = (weekend: number[], off: number[], d: number): number[] => {
  if (weekend.includes(d)) return off; // weekend chips are locked ON
  const next = off.includes(d) ? off.filter((x) => x !== d) : [...off, d];
  return [...new Set([...next, ...weekend])].sort((a, b) => a - b);
};

describe("§4.4a invariant — weekend ⊆ offDays", () => {
  it("marking a day weekend forces it OFF (the shipped bug: it kept injecting)", () => {
    const off = syncWeekend([SAT, SUN, FRI], [SAT, SUN]);
    expect(off).toContain(FRI);
    expect(holds([SAT, SUN, FRI], off)).toBe(true);
  });

  it("unmarking a weekend day leaves it OFF — offDays MAY exceed the weekend", () => {
    // It becomes a non-weekend off, which the planner can toggle freely (§4.4a).
    const off = syncWeekend([SAT, SUN], [SAT, SUN, FRI]);
    expect(off).toContain(FRI);
    expect(weekendRun([SAT, SUN], off).has(FRI)).toBe(true); // still adjacent ⇒ still weekend-run
  });

  it("a weekend day can never be toggled OFF-off from the planner", () => {
    expect(toggleOff([SAT, SUN], [SAT, SUN], SUN)).toEqual([SAT, SUN]);
  });

  it("the invariant survives any single planner toggle", () => {
    const weekend = [SAT, SUN];
    for (const d of [SUN, MON, THU, FRI, SAT]) {
      expect(holds(weekend, toggleOff(weekend, [SAT, SUN], d))).toBe(true);
    }
  });

  it("a weekend day never carries a working-day number (§4.4b)", () => {
    const off = syncWeekend([SAT, SUN, FRI], [SAT, SUN]);
    expect(workingDayNumber(FRI, [SAT, SUN, FRI], off)).toBeNull();
  });
});

describe("off-day edits never borrow the rollover event", () => {
  it("no call site dispatches START_WEEK to change offDays alone", () => {
    // START_WEEK resets `startedAt` + clears the §5.1 ledger. Only the explicit
    // rollover button may send it; off-day edits use SET_OFF_DAYS.
    for (const f of ["src/components/WeekView.tsx", "src/components/SettingsPanel.tsx"]) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const startWeekWithOffDays = /START_WEEK["']?\s*,\s*offDays|type:\s*["']START_WEEK["'][^}]*offDays/;
      expect(startWeekWithOffDays.test(src), `${f} must not send START_WEEK with offDays`).toBe(false);
    }
  });
});
