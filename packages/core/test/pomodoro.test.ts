/**
 * Stage 7a — §5.2 pomodoro. Covers the channel-attribution ruling (work→spent,
 * break→breaks, work-overshoot→managed, break-overshoot→wasted), breaks-eat-
 * budget remaining, the phase machine (break/longBreak by cycle, resume,
 * extend), the derived pomodoroView.due trigger, and the wall identity
 * spent+wasted+managed+breaks === elapsed.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  runningView,
  pomodoroView,
  type Event,
  type PomodoroConfig,
  type State,
} from "../src/index.js";

const H = 60;
const T0 = 8 * H; // 08:00
const CFG: PomodoroConfig = { workMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 };

/** A state with one unstarted task, started as a pomodoro at T0. */
function started(budget = 120): State {
  let s = initialState(T0);
  s = reduce(s, { type: "CREATE_TASK", task: { kind: "task", title: "Focus", headId: "Main Work", activityId: "", timing: "budgeted", tier: "normal", ommf: false, budget } as never });
  const id = s.plan[0]!.id;
  return reduce(s, { type: "START_TASK", taskId: id, pomodoro: CFG });
}

const tick = (s: State, mins: number): State => reduce(s, { type: "TICK", to: s.now + mins });
const ch = (s: State) => s.running!.channels;

describe("pomodoro channel attribution (§5.2)", () => {
  it("work minutes up to phaseLen accrue to spent", () => {
    const s = tick(started(), 25);
    expect(ch(s).spent).toBe(25);
    expect(ch(s).breaks).toBe(0);
    expect(ch(s).managed).toBe(0);
  });

  it("work OVERSHOOT (past phaseLen, undecided) accrues to managed", () => {
    const s = tick(started(), 30); // 25 work + 5 deciding
    expect(ch(s).spent).toBe(25);
    expect(ch(s).managed).toBe(5);
    expect(pomodoroView(s)!.due).toBe(true);
  });

  it("break minutes accrue to breaks; break overshoot → wasted (post-break idle)", () => {
    let s = tick(started(), 25); // finish work
    s = reduce(s, { type: "POMODORO_BREAK" });
    expect(s.running!.pomodoro!.phase).toBe("break");
    s = tick(s, 8); // 5 break + 3 idle past it
    expect(ch(s).breaks).toBe(5);
    expect(ch(s).wasted).toBe(3);
  });

  it("non-pomodoro tasks route all minutes to spent (unchanged)", () => {
    let s = initialState(T0);
    s = reduce(s, { type: "CREATE_TASK", task: { kind: "task", title: "Plain", headId: "Main Work", activityId: "", timing: "budgeted", tier: "normal", ommf: false, budget: 60 } as never });
    s = reduce(s, { type: "START_TASK", taskId: s.plan[0]!.id });
    s = tick(s, 40);
    expect(ch(s)).toEqual({ spent: 40, wasted: 0, managed: 0, breaks: 0 });
    expect(pomodoroView(s)).toBeNull();
  });
});

describe("breaks eat budget (§5.2 remaining)", () => {
  it("remaining = budget − (spent + breaks)", () => {
    let s = started(60);
    s = tick(s, 25); // spent 25
    s = reduce(s, { type: "POMODORO_BREAK" });
    s = tick(s, 5); // breaks 5
    expect(runningView(s)!.remaining).toBe(60 - 25 - 5); // 30
  });

  it("overrun fires when spent + breaks exceed budget", () => {
    let s = started(20);
    s = tick(s, 25); // spent capped at phaseLen 25 > budget 20
    expect(runningView(s)!.overrun).toBe(true);
    expect(runningView(s)!.remaining).toBe(0);
  });
});

describe("pomodoro phase machine (§5.2)", () => {
  it("the 4th break is a long break; resume returns to work", () => {
    let s = started(600);
    for (let i = 0; i < 3; i++) {
      s = tick(s, 25);
      s = reduce(s, { type: "POMODORO_BREAK" });
      expect(s.running!.pomodoro!.phase).toBe("break");
      s = reduce(s, { type: "POMODORO_RESUME" });
      expect(s.running!.pomodoro!.phase).toBe("work");
    }
    // 4th completed work interval → long break.
    s = tick(s, 25);
    expect(pomodoroView(s)!.nextBreakIsLong).toBe(true);
    s = reduce(s, { type: "POMODORO_BREAK" });
    expect(s.running!.pomodoro!.phase).toBe("longBreak");
    expect(s.running!.pomodoro!.phaseLen).toBe(15);
    expect(s.running!.pomodoro!.cycle).toBe(4);
  });

  it("POMODORO_EXTEND grows the current phase so it is no longer due", () => {
    let s = tick(started(), 25);
    expect(pomodoroView(s)!.due).toBe(true);
    s = reduce(s, { type: "POMODORO_EXTEND", minutes: 10 }); // keep working +10
    expect(pomodoroView(s)!.due).toBe(false);
    expect(s.running!.pomodoro!.phaseLen).toBe(35);
    s = tick(s, 10); // those 10 are work again, not managed
    expect(ch(s).spent).toBe(35);
    expect(ch(s).managed).toBe(0);
  });

  it("transitions are no-ops without a matching phase / pomodoro", () => {
    const s = started();
    // RESUME during work is a no-op
    expect(reduce(s, { type: "POMODORO_RESUME" }).running!.pomodoro!.phase).toBe("work");
    // BREAK requires work phase — after breaking, a second BREAK no-ops
    let s2 = reduce(tick(s, 25), { type: "POMODORO_BREAK" });
    const phase = s2.running!.pomodoro!.phase;
    expect(reduce(s2, { type: "POMODORO_BREAK" }).running!.pomodoro!.phase).toBe(phase);
  });
});

describe("wall identity holds across phases (§2.6)", () => {
  it("spent + wasted + managed + breaks === elapsed wall", () => {
    let s = started(600);
    s = tick(s, 30); // 25 spent + 5 managed
    s = reduce(s, { type: "POMODORO_BREAK" });
    s = tick(s, 8); // 5 breaks + 3 wasted
    s = reduce(s, { type: "POMODORO_RESUME" });
    s = tick(s, 20); // 20 spent
    const c = ch(s);
    const wall = s.now - s.running!.startedAt;
    expect(c.spent + c.wasted + c.managed + c.breaks).toBe(wall);
    expect(wall).toBe(58);
  });
});
