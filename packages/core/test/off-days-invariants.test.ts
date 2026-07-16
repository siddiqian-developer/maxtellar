/**
 * INVARIANT GUARDS (§4.4/§4.4a) — pinned after the 2026-07-16 audit.
 *
 * Four bugs of one class shipped inside "DONE" stages, none caught by 340 tests:
 * a value that looks right, is never checked, and fails with no error. These tests
 * pin the invariants themselves rather than a symptom, so the class can't return
 * silently.
 */
import { describe, it, expect } from "vitest";
import { initialState, reduce, type State } from "../src/index.js";

const midWeek = (): State => {
  const base = initialState(10_000);
  return {
    ...base,
    week: {
      ...base.week,
      startedAt: 5_000, // the week began well before "now"
      offDays: [0, 6],
      quotaAdjust: [{ headId: "Work", weekday: 3, delta: -30 }], // a live §5.1 ledger
    },
  };
};

describe("§4.4a — editing OFF days must NOT roll the week over", () => {
  it("SET_OFF_DAYS changes the OFF set and nothing else", () => {
    const before = midWeek();
    const after = reduce(before, { type: "SET_OFF_DAYS", offDays: [0, 4, 6] });
    expect(after.week.offDays).toEqual([0, 4, 6]);
  });

  it("SET_OFF_DAYS preserves `startedAt` — it is the WEEK WINDOW weekly quotas and Analytics measure from", () => {
    const before = midWeek();
    const after = reduce(before, { type: "SET_OFF_DAYS", offDays: [0, 4, 6] });
    expect(after.week.startedAt).toBe(5_000);
  });

  it("SET_OFF_DAYS preserves the §5.1 quotaAdjust ledger", () => {
    const before = midWeek();
    const after = reduce(before, { type: "SET_OFF_DAYS", offDays: [0, 4, 6] });
    expect(after.week.quotaAdjust).toHaveLength(1);
  });

  it("SET_OFF_DAYS re-declares the §4.4b First Weekday when asked", () => {
    const after = reduce(midWeek(), { type: "SET_OFF_DAYS", offDays: [0, 1, 6], firstWeekday: 2 });
    expect(after.week.firstWeekday).toBe(2);
  });

  it("§4.4: at least one OFF day — an empty set is refused", () => {
    const before = midWeek();
    expect(reduce(before, { type: "SET_OFF_DAYS", offDays: [] }).week.offDays).toEqual([0, 6]);
  });

  it("START_WEEK — the ROLLOVER — still does reset the boundary and clear the ledger", () => {
    // The counterpart: the side effects are correct HERE, which is why off-day
    // edits must not borrow this event.
    const after = reduce(midWeek(), { type: "START_WEEK", offDays: [0, 6] });
    expect(after.week.startedAt).toBe(10_000); // boundary moves to now
    expect(after.week.quotaAdjust).toHaveLength(0); // ledger is per week instance
  });
});
