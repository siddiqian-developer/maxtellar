/**
 * EDIT_HISTORY (§4.1) — the history editor's atomic, validated replace.
 * Edits (changed spans) and deletes (omitted entries) commit in one shot;
 * illegal spans snap into the legal past; overlaps are rejected and the live
 * state is left untouched (pure-reduce backstop, mirroring EDIT_COMMIT).
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  reduceAll,
  checkInvariants,
  type Event,
  type HistoryEntry,
  type State,
} from "../src/index.js";

const T = (h: number, m: number): number => h * 60 + m;

const backlog = (title: string, start: number, end: number): Event => ({
  type: "BACKLOG",
  entry: {
    taskId: null,
    title,
    headId: "work",
    activityId: "act",
    kind: "occupancy",
    start,
    end,
    outcome: "completed",
    channels: { spent: end - start, wasted: 0, managed: 0, breaks: 0 },
  },
});

/** Two adjacent finished runs then `now` at 12:00. */
function seed(): State {
  let s = initialState(T(12, 0));
  s = reduceAll(s, [backlog("A", T(8, 0), T(9, 0)), backlog("B", T(10, 0), T(11, 0))]);
  return s;
}

describe("EDIT_HISTORY — atomic validated replace", () => {
  it("edits an entry's span in place (full-history batch)", () => {
    const s = seed();
    const batch: HistoryEntry[] = s.history.map((h) =>
      h.title === "A" ? { ...h, end: T(9, 30) } : h,
    );
    const s2 = reduce(s, { type: "EDIT_HISTORY", batch });
    expect(s2.history.find((h) => h.title === "A")!.end).toBe(T(9, 30));
    expect(s2.history).toHaveLength(2);
    expect(checkInvariants(s2)).toEqual([]);
  });

  it("deletes an entry by omission", () => {
    const s = seed();
    const batch = s.history.filter((h) => h.title !== "A");
    const s2 = reduce(s, { type: "EDIT_HISTORY", batch });
    expect(s2.history.map((h) => h.title)).toEqual(["B"]);
    expect(checkInvariants(s2)).toEqual([]);
  });

  it("assigns ids to new entries, preserves existing ids", () => {
    const s = seed();
    const existing = s.history[0]!;
    const fresh: Omit<HistoryEntry, "id"> = {
      taskId: null,
      title: "C",
      headId: "work",
      activityId: "act",
      kind: "occupancy",
      start: T(11, 0),
      end: T(11, 30),
      outcome: "completed",
      channels: { spent: 30, wasted: 0, managed: 0, breaks: 0 },
    };
    const s2 = reduce(s, { type: "EDIT_HISTORY", batch: [...s.history, fresh] });
    expect(s2.history).toHaveLength(3);
    expect(s2.history.find((h) => h.title === existing.title)!.id).toBe(existing.id);
    const added = s2.history.find((h) => h.title === "C")!;
    expect(added.id).toBeTruthy();
    expect(checkInvariants(s2)).toEqual([]);
  });

  it("clamps end > now to now and snaps start > end", () => {
    const s = seed();
    const batch: HistoryEntry[] = s.history.map((h) =>
      h.title === "B" ? { ...h, end: T(15, 0) } : h,
    );
    const s2 = reduce(s, { type: "EDIT_HISTORY", batch });
    expect(s2.history.find((h) => h.title === "B")!.end).toBe(T(12, 0)); // = now
  });

  it("rejects a batch that overlaps and leaves live state untouched", () => {
    const s = seed();
    // stretch A to 10:30, overlapping B [10:00,11:00)
    const batch: HistoryEntry[] = s.history.map((h) =>
      h.title === "A" ? { ...h, end: T(10, 30) } : h,
    );
    expect(() => reduce(s, { type: "EDIT_HISTORY", batch })).toThrow(/overlap/);
    // live untouched: A still ends at 9:00
    expect(s.history.find((h) => h.title === "A")!.end).toBe(T(9, 0));
  });

  it("skipped (zero-occupancy) markers never bound an overlap", () => {
    const s = seed();
    const marker: Omit<HistoryEntry, "id"> = {
      taskId: null,
      title: "skip",
      headId: "work",
      activityId: "act",
      kind: "skipped",
      start: T(9, 0),
      end: T(9, 0),
      outcome: "skipped",
      channels: { spent: 0, wasted: 0, managed: 0, breaks: 0 },
    };
    const s2 = reduce(s, { type: "EDIT_HISTORY", batch: [...s.history, marker] });
    expect(s2.history).toHaveLength(3);
    expect(checkInvariants(s2)).toEqual([]);
  });
});
