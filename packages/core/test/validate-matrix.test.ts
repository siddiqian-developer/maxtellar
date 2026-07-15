/**
 * The §2.5 validity matrix, enumerated — this file IS the "full table produced
 * at build time" the spec promises. Every confirmed-invalid combination must be
 * SNAPPED (never persisted, never rejected); every legitimate user choice must
 * survive untouched (maximal editability).
 */
import { describe, it, expect } from "vitest";
import { snapTask, type TimingType, type UnstartedTask } from "../src/index.js";

const NOW = 9 * 60;
const MF = 5;

/** Passing `field: undefined` means "absent" — stripped so the object matches
 * exactOptionalPropertyTypes. */
function mk(over: { [K in keyof UnstartedTask]?: UnstartedTask[K] | undefined }): UnstartedTask {
  const task = {
    kind: "task",
    id: "t",
    title: "t",
    headId: "h",
    activityId: "a",
    rank: "m",
    tier: "normal",
    timing: "budgeted",
    ommf: false,
    slideable: true,
    breakable: true,
    budget: 30,
    ...over,
  } as UnstartedTask;
  for (const k of Object.keys(task) as Array<keyof UnstartedTask>) {
    if (task[k] === undefined) delete task[k];
  }
  return task;
}

const snap = (over: Parameters<typeof mk>[0]) => snapTask(mk(over), MF, NOW);

describe("§2.5 confirmed-invalid combinations — always snapped", () => {
  it("Fixed + slideable=true → slideable=false", () => {
    const { task, notes } = snap({
      timing: "fixed",
      anchorStart: NOW + 60,
      anchorEnd: NOW + 90,
      slideable: true,
    });
    expect(task.slideable).toBe(false);
    expect(notes.some((n) => n.field === "slideable")).toBe(true);
  });

  it("Budgeted + slideable=false → slideable=true", () => {
    const { task, notes } = snap({ timing: "budgeted", slideable: false });
    expect(task.slideable).toBe(true);
    expect(notes.some((n) => n.field === "slideable")).toBe(true);
  });

  const nonBudgeted: Array<[TimingType, Parameters<typeof mk>[0]]> = [
    ["fixed", { anchorStart: NOW + 60, anchorEnd: NOW + 90 }],
    ["semi-head", { anchorStart: NOW + 60, budget: undefined }],
    ["semi-tail", { anchorEnd: NOW + 120, budget: undefined }],
    ["unscheduled", { budget: undefined }],
  ];
  for (const [timing, coords] of nonBudgeted) {
    it(`${timing} + breakable=true → breakable=false`, () => {
      const { task, notes } = snap({ timing, breakable: true, ...coords });
      expect(task.breakable).toBe(false);
      expect(notes.some((n) => n.field === "breakable")).toBe(true);
    });
  }

  it("OMMF + breakable=true → breakable=false (permanent, §2.5)", () => {
    const { task, notes } = snap({ timing: "budgeted", ommf: true, breakable: true });
    expect(task.breakable).toBe(false);
    expect(notes.some((n) => n.field === "breakable")).toBe(true);
  });
});

describe("§2.5 legitimate choices — never derived away", () => {
  it("an unslideable semi-tail survives (pins at its floor, §3.9.1)", () => {
    const { task } = snap({ timing: "semi-tail", anchorEnd: NOW + 120, budget: undefined, slideable: false, breakable: false });
    expect(task.slideable).toBe(false);
  });

  it("an unbreakable budgeted task survives (attend late, not split)", () => {
    const { task } = snap({ timing: "budgeted", breakable: false });
    expect(task.breakable).toBe(false);
  });

  it("an unslideable semi-head survives", () => {
    const { task } = snap({ timing: "semi-head", anchorStart: NOW + 60, budget: undefined, slideable: false, breakable: false });
    expect(task.slideable).toBe(false);
  });
});

describe("timing-type coordinate coherence (§2.3: know 0, 1, or all 3)", () => {
  it("budgeted carries no anchors — both cleared", () => {
    const { task, notes } = snap({ timing: "budgeted", anchorStart: NOW + 10, anchorEnd: NOW + 40 });
    expect(task.anchorStart).toBeUndefined();
    expect(task.anchorEnd).toBeUndefined();
    expect(notes).toHaveLength(2);
  });

  it("unscheduled carries nothing — anchors and budget cleared", () => {
    const { task } = snap({ timing: "unscheduled", anchorStart: NOW + 10, anchorEnd: NOW + 40, budget: 30 });
    expect(task.anchorStart).toBeUndefined();
    expect(task.anchorEnd).toBeUndefined();
    expect(task.budget).toBeUndefined();
  });

  it("semi-head's tail floats — anchorEnd cleared", () => {
    const { task } = snap({ timing: "semi-head", anchorStart: NOW + 60, anchorEnd: NOW + 90, budget: undefined });
    expect(task.anchorEnd).toBeUndefined();
    expect(task.anchorStart).toBe(NOW + 60);
  });

  it("semi-tail's head floats — anchorStart cleared", () => {
    const { task } = snap({ timing: "semi-tail", anchorStart: NOW + 60, anchorEnd: NOW + 120, budget: undefined });
    expect(task.anchorStart).toBeUndefined();
    expect(task.anchorEnd).toBe(NOW + 120);
  });

  it("semi-head missing its anchor demotes (budget → budgeted; none → unscheduled)", () => {
    expect(snap({ timing: "semi-head", budget: 30 }).task.timing).toBe("budgeted");
    expect(snap({ timing: "semi-head", budget: undefined }).task.timing).toBe("unscheduled");
  });

  it("semi-tail missing its anchor demotes likewise", () => {
    expect(snap({ timing: "semi-tail", budget: 30 }).task.timing).toBe("budgeted");
    expect(snap({ timing: "semi-tail", budget: undefined }).task.timing).toBe("unscheduled");
  });
});

describe("fixed: the {start,end,budget} triple must cohere", () => {
  it("missing anchors is a hard error (sandbox pattern discards upstream)", () => {
    expect(() => snap({ timing: "fixed" })).toThrow(/fixed/);
  });

  it("end ≤ start snaps the end forward", () => {
    const { task } = snap({ timing: "fixed", anchorStart: NOW + 60, anchorEnd: NOW + 60 });
    expect(task.anchorEnd).toBeGreaterThan(task.anchorStart!);
  });

  it("budget is always recomputed to end − start", () => {
    const { task } = snap({ timing: "fixed", anchorStart: NOW + 60, anchorEnd: NOW + 90, budget: 999 });
    expect(task.budget).toBe(30);
  });
});

describe("MIN_FRAGMENT floor (§3.7/7.1: no budget below it, ever)", () => {
  it("a sub-floor budget snaps up to the floor", () => {
    const { task, notes } = snap({ timing: "budgeted", budget: 2 });
    expect(task.budget).toBe(MF);
    expect(notes.some((n) => n.field === "budget")).toBe(true);
  });

  it("a sub-floor fixed span snaps and keeps the triple coherent", () => {
    const { task } = snap({ timing: "fixed", anchorStart: NOW + 60, anchorEnd: NOW + 62 });
    expect(task.budget).toBe(MF);
    expect(task.anchorEnd! - task.anchorStart!).toBe(MF);
  });
});

describe("orthogonal fields pass through untouched", () => {
  it("sleepKind and the rider provision survive snapping (§2.8/§2.9)", () => {
    const { task } = snap({
      timing: "budgeted",
      sleepKind: "nap",
      riderOf: "primary-1",
      spillPolicy: "dismount",
      lane: 2,
    });
    expect(task.sleepKind).toBe("nap");
    expect(task.riderOf).toBe("primary-1");
    expect(task.spillPolicy).toBe("dismount");
    expect(task.lane).toBe(2);
  });
});
