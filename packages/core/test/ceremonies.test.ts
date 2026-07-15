/**
 * §4.2 SOD / EOD ceremonies + Lost Hours + day records. Covers: the precondition
 * scoping (0/1/2/3+ sleeps), sweep boundaries, the zero-sum Lost math
 * (wall = accounted + lost), leftovers surviving, replay idempotence, and a
 * multi-day iterative scenario.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  reduceAll,
  checkInvariants,
  sodPrecondition,
  formingDayStart,
  deadLeftovers,
  LOST_HOURS,
  RECHARGE,
  type Event,
  type HistoryEntry,
  type State,
} from "../src/index.js";

const H = 60;
const START = 6 * H;

/** Back-log a Finished Sleep occupancy [start,end). */
function sleep(start: number, end: number): Event {
  return {
    type: "BACKLOG",
    entry: {
      taskId: null,
      title: "Sleep",
      headId: RECHARGE,
      activityId: "Sleep",
      kind: "occupancy",
      start,
      end,
      outcome: "completed",
      channels: { spent: end - start, wasted: 0, managed: 0, breaks: 0 },
      sleepKind: "sleep",
    },
  };
}

/** Back-log an ordinary Finished activity occupancy [start,end). */
function activity(start: number, end: number, title = "Work"): Event {
  return {
    type: "BACKLOG",
    entry: {
      taskId: null,
      title,
      headId: "Work",
      activityId: "Coding",
      kind: "occupancy",
      start,
      end,
      outcome: "completed",
      channels: { spent: end - start, wasted: 0, managed: 0, breaks: 0 },
    },
  };
}

const occ = (s: State): HistoryEntry[] => s.history.filter((h) => h.kind === "occupancy");
const lostEntries = (s: State): HistoryEntry[] => occ(s).filter((h) => h.headId === LOST_HOURS);
const noViolations = (s: State): void => expect(checkInvariants(s)).toEqual([]);

describe("SOD precondition scoping", () => {
  it("0 or 1 Finished Sleep → not ok (opens the missing-data modal)", () => {
    let s = initialState(START);
    expect(sodPrecondition(s).ok).toBe(false); // no history at all
    // now push time forward so a past sleep is legal, then log one sleep
    s = reduce(s, { type: "TICK", to: START + 20 * H });
    s = reduce(s, sleep(START, START + 8 * H));
    expect(sodPrecondition(s).ok).toBe(false); // only one
    expect(sodPrecondition(s).sleeps).toHaveLength(1);
  });

  it("exactly two → ok; A topmost, B next", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    s = reduce(s, sleep(START, START + 8 * H)); // Sleep A
    s = reduce(s, sleep(START + 24 * H, START + 31 * H)); // Sleep B (next day head)
    const pre = sodPrecondition(s);
    expect(pre.ok).toBe(true);
    expect(pre.sleepA!.start).toBe(START);
    expect(pre.sleepB!.start).toBe(START + 24 * H);
  });

  it("3+ → ok, A/B are the first two (leftover sleeps handled by later SODs)", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 60 * H });
    s = reduce(s, sleep(START, START + 8 * H));
    s = reduce(s, sleep(START + 24 * H, START + 32 * H));
    s = reduce(s, sleep(START + 48 * H, START + 56 * H));
    const pre = sodPrecondition(s);
    expect(pre.ok).toBe(true);
    expect(pre.sleeps).toHaveLength(3);
    expect(pre.sleepA!.start).toBe(START);
    expect(pre.sleepB!.start).toBe(START + 24 * H);
  });
});

describe("SOD sweep + Lost Hours (zero-sum)", () => {
  it("sweeps [A,B), books unaccounted gaps as Lost Hours, tiles the day fully", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    // Sleep A [0,8h). Work [10h,13h). (gap 8-10h and 13-24h are unaccounted.)
    s = reduce(s, sleep(START, START + 8 * H));
    s = reduce(s, activity(START + 10 * H, START + 13 * H));
    s = reduce(s, sleep(START + 24 * H, START + 30 * H)); // Sleep B
    s = reduce(s, { type: "SOD" });

    expect(s.days).toHaveLength(1);
    const rec = s.days[0]!;
    expect(rec.start).toBe(START);
    expect(rec.end).toBe(START + 24 * H); // = Sleep B start
    expect(s.ceremony).toEqual({ phase: "pruning" });

    // Two Lost Hours spans: [8h,10h) and [13h,24h).
    const lost = lostEntries(s).sort((a, b) => a.start - b.start);
    expect(lost.map((l) => [l.start - START, l.end - START])).toEqual([
      [8 * H, 10 * H],
      [13 * H, 24 * H],
    ]);
    expect(lost.every((l) => l.taskId === null)).toBe(true);

    // Zero-sum: within [start,end) all occupancy sums to the full span.
    const span = rec.end - rec.start;
    const tiled = occ(s).reduce(
      (a, h) => a + Math.max(0, Math.min(h.end, rec.end) - Math.max(h.start, rec.start)),
      0,
    );
    expect(tiled).toBe(span);
    // accounted (non-lost) + lost = wall
    const lostMin = lost.reduce((a, l) => a + (l.end - l.start), 0);
    const accounted = span - lostMin;
    expect(accounted + lostMin).toBe(span);
    expect(lostMin).toBe(2 * H + 11 * H);
    noViolations(s);
  });

  it("a fully-accounted day books no Lost Hours", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    s = reduce(s, sleep(START, START + 8 * H));
    s = reduce(s, activity(START + 8 * H, START + 24 * H)); // fills to Sleep B start
    s = reduce(s, sleep(START + 24 * H, START + 30 * H));
    s = reduce(s, { type: "SOD" });
    expect(lostEntries(s)).toHaveLength(0);
    noViolations(s);
  });

  it("B becomes the new forming-day head after the sweep", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    s = reduce(s, sleep(START, START + 8 * H));
    s = reduce(s, sleep(START + 24 * H, START + 30 * H));
    s = reduce(s, { type: "SOD" });
    // forming day now starts at Sleep B's start (record.end).
    expect(formingDayStart(s)).toBe(START + 24 * H);
    // and the new forming day has exactly one sleep (B) — not enough for SOD.
    expect(sodPrecondition(s).ok).toBe(false);
  });
});

describe("leftovers & pruning", () => {
  it("unstarted leftovers survive the sweep", () => {
    let s = initialState(START);
    s = reduce(s, { type: "CREATE_TASK", task: { id: "keep", title: "Keep", headId: "Work", activityId: "Coding", tier: "normal", timing: "budgeted", ommf: false, slideable: true, breakable: true, budget: 60 } as never });
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    s = reduce(s, sleep(START, START + 8 * H));
    s = reduce(s, sleep(START + 24 * H, START + 30 * H));
    s = reduce(s, { type: "SOD" });
    expect(s.plan.some((i) => i.id === "keep")).toBe(true);
  });

  it("deadLeftovers flags an anchored task whose window has fully passed, spares a live one", () => {
    // Ticks normally amputate past-window anchored tasks; deadLeftovers is the
    // pruning safety net for any residue. Test the pure predicate directly.
    const base = initialState(START + 10 * H);
    const live: never = { kind: "task", id: "live", title: "Live", headId: "Work", activityId: "Coding", rank: "a", tier: "normal", timing: "budgeted", ommf: false, slideable: true, breakable: true, budget: 60 } as never;
    const dead: never = { kind: "task", id: "dead", title: "Dead", headId: "Work", activityId: "Coding", rank: "b", tier: "normal", timing: "fixed", ommf: false, slideable: false, breakable: false, anchorStart: START, anchorEnd: START + 60, budget: 60 } as never;
    const s: State = { ...base, plan: [live, dead] };
    const flagged = deadLeftovers(s).map((t) => t.id);
    expect(flagged).toEqual(["dead"]);
  });

  it("PRUNING_DONE discards user-chosen leftovers → planning", () => {
    let s = initialState(START);
    s = reduce(s, { type: "CREATE_TASK", task: { id: "live", title: "Live", headId: "Work", activityId: "Coding", tier: "normal", timing: "budgeted", ommf: false, slideable: true, breakable: true, budget: 60 } as never });
    s = reduce(s, { type: "CREATE_TASK", task: { id: "keep", title: "Keep", headId: "Work", activityId: "Coding", tier: "normal", timing: "budgeted", ommf: false, slideable: true, breakable: true, budget: 60 } as never });
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    s = reduce(s, sleep(START, START + 8 * H));
    s = reduce(s, sleep(START + 24 * H, START + 30 * H));
    s = reduce(s, { type: "SOD" });
    s = reduce(s, { type: "PRUNING_DONE", discardIds: ["live"] });
    expect(s.plan.some((i) => i.id === "live")).toBe(false); // user-chosen gone
    expect(s.plan.some((i) => i.id === "keep")).toBe(true); // carried
    expect(s.ceremony).toEqual({ phase: "planning" });
    noViolations(s);
  });

  it("PLANNING_DONE returns to Live", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    s = reduce(s, sleep(START, START + 8 * H));
    s = reduce(s, sleep(START + 24 * H, START + 30 * H));
    s = reduce(s, { type: "SOD" });
    s = reduce(s, { type: "PRUNING_DONE" });
    s = reduce(s, { type: "PLANNING_DONE" });
    expect(s.ceremony).toBeNull();
  });

  it("SOD is a no-op when the precondition fails", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 30 * H });
    s = reduce(s, sleep(START, START + 8 * H)); // only one sleep
    const before = s;
    s = reduce(s, { type: "SOD" });
    expect(s.days).toHaveLength(0);
    expect(s.ceremony).toBeNull();
    expect(s).toEqual(before);
  });
});

describe("multi-day iterative scenario", () => {
  it("two SODs advance two boundaries; each day tiles fully", () => {
    let s = initialState(START);
    s = reduce(s, { type: "TICK", to: START + 60 * H });
    // three sleeps → two full days
    s = reduce(s, sleep(START, START + 8 * H)); // A1
    s = reduce(s, activity(START + 9 * H, START + 20 * H));
    s = reduce(s, sleep(START + 24 * H, START + 32 * H)); // B1 / A2
    s = reduce(s, activity(START + 33 * H, START + 44 * H));
    s = reduce(s, sleep(START + 48 * H, START + 56 * H)); // B2

    s = reduce(s, { type: "SOD" }); // closes day 1 [0,24h)
    expect(s.days).toHaveLength(1);
    expect(s.days[0]!.end).toBe(START + 24 * H);
    s = reduce(s, { type: "PRUNING_DONE" });
    s = reduce(s, { type: "PLANNING_DONE" });

    s = reduce(s, { type: "SOD" }); // closes day 2 [24h,48h)
    expect(s.days).toHaveLength(2);
    expect(s.days[1]!.start).toBe(START + 24 * H);
    expect(s.days[1]!.end).toBe(START + 48 * H);

    // both records tile fully
    for (const rec of s.days) {
      const tiled = occ(s).reduce(
        (a, h) => a + Math.max(0, Math.min(h.end, rec.end) - Math.max(h.start, rec.start)),
        0,
      );
      expect(tiled).toBe(rec.end - rec.start);
    }
    noViolations(s);
  });
});

describe("replay idempotence", () => {
  it("same event log → identical state (event-sourcing)", () => {
    const events: Event[] = [
      { type: "TICK", to: START + 30 * H },
      sleep(START, START + 8 * H),
      activity(START + 10 * H, START + 13 * H),
      sleep(START + 24 * H, START + 30 * H),
      { type: "SOD" },
      { type: "PRUNING_DONE" },
      { type: "PLANNING_DONE" },
    ];
    const a = reduceAll(initialState(START), events);
    const b = reduceAll(initialState(START), events);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    noViolations(a);
  });
});
