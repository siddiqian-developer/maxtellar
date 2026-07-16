/**
 * §5.3 alarm signal derivation (pure). Verifies each condition surfaces with a
 * stable key and that keys are absent when the condition isn't met.
 */
import { describe, it, expect } from "vitest";
import { initialState, reduce, type State, type HeadBudget } from "@maxtellar/core";
import { alarmSignals } from "./alarms";

const H = 60;
const T0 = 8 * H;

const kinds = (s: State) => alarmSignals(s).map((a) => a.kind);
const keyFor = (s: State, kind: string) => alarmSignals(s).find((a) => a.kind === kind)?.key;

function running(budget: number, pomodoro?: boolean): State {
  let s = initialState(T0);
  s = reduce(s, { type: "CREATE_TASK", task: { kind: "task", title: "Focus", headId: "Main Work", activityId: "", timing: "budgeted", tier: "normal", ommf: false, budget } as never });
  return reduce(s, { type: "START_TASK", taskId: s.plan[0]!.id, ...(pomodoro ? { pomodoro: { workMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 } } : {}) });
}

describe("alarmSignals (§5.3)", () => {
  it("no signals on a fresh empty state", () => {
    expect(alarmSignals(initialState(T0))).toEqual([]);
  });

  it("overrun fires once the running budget is passed", () => {
    let s = running(20);
    expect(kinds(s)).not.toContain("overrun");
    s = reduce(s, { type: "TICK", to: T0 + 25 });
    expect(kinds(s)).toContain("overrun");
    expect(keyFor(s, "overrun")).toBe(`overrun:${s.running!.id}`);
  });

  it("pomodoro fires when the phase is due, keyed by phaseStartedAt", () => {
    let s = running(600, true);
    expect(kinds(s)).not.toContain("pomodoro");
    s = reduce(s, { type: "TICK", to: T0 + 25 });
    expect(kinds(s)).toContain("pomodoro");
    expect(keyFor(s, "pomodoro")).toBe(`pomo:${s.running!.pomodoro!.phaseStartedAt}`);
  });

  it("an anchored start fires 'arrived' once reached, 'approaching' just before", () => {
    let s = initialState(T0);
    // a fixed task anchored 3 min in the future → approaching (within 5m)
    s = reduce(s, { type: "CREATE_TASK", task: { kind: "task", title: "Standup", headId: "Main Work", activityId: "", timing: "fixed", tier: "normal", ommf: false, anchorStart: T0 + 3, anchorEnd: T0 + 33, budget: 30 } as never });
    expect(kinds(s)).toContain("fixedApproaching");
    // advance past its start → arrived (still unstarted)
    s = reduce(s, { type: "TICK", to: T0 + 4 });
    const k = kinds(s);
    expect(k).toContain("startArrived");
    expect(k).not.toContain("fixedApproaching");
  });

  it("an at-most weekly quota over its ceiling warns", () => {
    let s = initialState(T0);
    const atMost: HeadBudget = { headId: "Scrolling", categoryId: "Time Wasted", kind: "weekly", quotaMinutes: 60, quotaType: "atMost", weekdays: [0, 1, 2, 3, 4, 5, 6] };
    s = { ...s, week: { ...s.week, startedAt: 0, budgets: [atMost] },
      history: [{ id: "h", taskId: null, title: "Scroll", headId: "Scrolling", activityId: "", kind: "occupancy", start: T0 - 90, end: T0, outcome: "completed", channels: { spent: 90, wasted: 0, managed: 0, breaks: 0 } }] };
    const sig = alarmSignals(s).find((a) => a.kind === "atMostQuota");
    expect(sig).toBeTruthy();
    expect(sig!.body).toContain("30 min");
  });

  it("SOD reminder fires when two sleeps bound a day and no ceremony is running", () => {
    let s = initialState(T0 + 30 * H);
    const sleep = (start: number, end: number, id: string) => ({ id, taskId: null, title: "Sleep", headId: "Recharge", activityId: "", kind: "occupancy" as const, start, end, outcome: "completed" as const, sleepKind: "sleep" as const, channels: { spent: end - start, wasted: 0, managed: 0, breaks: 0 } });
    s = { ...s, history: [sleep(0, 8 * H, "s1"), sleep(24 * H, 30 * H, "s2")] };
    expect(kinds(s)).toContain("sodReminder");
  });
});
