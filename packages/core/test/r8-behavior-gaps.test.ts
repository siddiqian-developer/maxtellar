/**
 * R8 — the two §9.2/§2.6 behavior gaps.
 *  - SOFT_END_RUNNING: §9.2's first tap — end now, classify later.
 *  - LOG_CHANNEL "managed": §2.6's one sanctioned auto-log (in-app edit time →
 *    Self-Management), an internal channel of the running task; R is never split.
 */
import { describe, it, expect } from "vitest";
import { initialState, reduce, emptyChannels, type State } from "../src/index.js";

const T = (h: number): number => h * 60;

/** A state with one task running since T(9), 60m budget. */
function running(nowH: number, spent: number): State {
  const base = initialState(T(nowH));
  return {
    ...base,
    running: {
      id: "r1", title: "Write", headId: "Work", activityId: "Writing",
      startedAt: T(9), budget: 60, channels: { ...emptyChannels(), spent },
      tier: "normal", ommf: false, slideable: true, breakable: true, rank: "a",
    } as never,
  };
}

describe("§9.2 SOFT_END_RUNNING — end now, classify later", () => {
  it("ends the task with the verdict WITHHELD (soft-ended), not completed", () => {
    const s = reduce(running(10, 60), { type: "SOFT_END_RUNNING" });
    expect(s.running).toBeNull();
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.outcome).toBe("soft-ended");
  });

  it("does NOT return a remainder to the plan — it is not a pause", () => {
    // The distinction that matters: PAUSE keeps the task alive (unspent budget
    // returns as a remainder); a soft-end is the task's END, pending only a verdict.
    const soft = reduce(running(9.5, 30), { type: "SOFT_END_RUNNING" });
    const paused = reduce(running(9.5, 30), { type: "PAUSE_RUNNING" });
    expect(soft.plan).toHaveLength(0);
    expect(paused.plan.length).toBeGreaterThan(0); // remainder survives
    // Both record the elapsed span; only the plan differs.
    expect(soft.history[0]!.end).toBe(paused.history[0]!.end);
  });

  it("records the true occupied span and preserves the channels", () => {
    const s = reduce(running(10, 45), { type: "SOFT_END_RUNNING" });
    expect(s.history[0]!.start).toBe(T(9));
    expect(s.history[0]!.end).toBe(T(10));
    expect(s.history[0]!.channels.spent).toBe(45);
  });

  it("the verdict can follow later — the outcome is editable to completed", () => {
    const s = reduce(running(10, 60), { type: "SOFT_END_RUNNING" });
    const classified = reduce(s, {
      type: "EDIT_HISTORY",
      batch: s.history.map((h) => ({ ...h, outcome: "completed" as const })),
    });
    expect(classified.history[0]!.outcome).toBe("completed");
  });

  it("a zero-wall soft-end books nothing (no [t,t] point)", () => {
    const s = reduce(running(9, 0), { type: "SOFT_END_RUNNING" }); // now === startedAt
    expect(s.history).toHaveLength(0);
    expect(s.running).toBeNull();
  });
});

describe("§2.6 managed — in-app edit time is Self-Management, R is never split", () => {
  it("reattributes spent → managed on the RUNNING task", () => {
    const s = reduce(running(10, 60), { type: "LOG_CHANNEL", channel: "managed", minutes: 10 });
    expect(s.running!.channels.spent).toBe(50);
    expect(s.running!.channels.managed).toBe(10);
  });

  it("R is never split: no new plan item, no history entry, one continuous card", () => {
    const before = running(10, 60);
    const s = reduce(before, { type: "LOG_CHANNEL", channel: "managed", minutes: 10 });
    expect(s.running!.id).toBe("r1");
    expect(s.running!.startedAt).toBe(T(9)); // the span is untouched
    expect(s.history).toHaveLength(0);
    expect(s.plan).toHaveLength(0);
  });

  it("wall = spent + wasted + managed + breaks holds across the reattribution", () => {
    const before = running(10, 60);
    const s = reduce(before, { type: "LOG_CHANNEL", channel: "managed", minutes: 25 });
    const c = s.running!.channels;
    const wall = s.now - s.running!.startedAt;
    expect(c.spent + c.wasted + c.managed + c.breaks).toBe(wall);
  });

  it("physics (E3): can never book more managed than was actually spent", () => {
    const s = reduce(running(10, 60), { type: "LOG_CHANNEL", channel: "managed", minutes: 999 });
    expect(s.running!.channels.managed).toBe(60);
    expect(s.running!.channels.spent).toBe(0);
  });

  it("with nothing running there is no managed channel — it is a no-op", () => {
    // §2.6: managed is a channel OF the running task. That time is simply
    // unaccounted and becomes Lost Hours at the next SOD; we invent nothing.
    const idle = initialState(T(10));
    expect(reduce(idle, { type: "LOG_CHANNEL", channel: "managed", minutes: 10 })).toEqual(idle);
  });
});
