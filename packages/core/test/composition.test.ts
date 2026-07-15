/**
 * §2.7 (G24) composition / subtasks.
 * Leaves occupy the spine; the parent is a derived bracket. Zero-sum budget
 * (parent = Σ children). Start parent → first leaf; completing the last leaf
 * completes ancestors; analytics attribute each leaf's time to its own head.
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  reduceAll,
  checkInvariants,
  type Event,
  type State,
  type UnstartedTask,
} from "../src/index.js";

const T = (h: number, m: number): number => h * 60 + m;

function mkTask(id: string, over: Record<string, unknown>): Event {
  return {
    type: "CREATE_TASK",
    task: {
      id,
      title: id,
      headId: "work",
      activityId: "act",
      tier: "normal",
      ommf: false,
      slideable: true,
      breakable: true,
      ...over,
    } as never,
  };
}

const task = (s: State, id: string): UnstartedTask =>
  s.plan.find((i) => i.id === id) as UnstartedTask;
const parts = (s: State, id: string): { start: number; end: number }[] =>
  s.placements.find((p) => p.itemId === id)?.parts ?? [];

describe("decomposition — the zero-sum bracket", () => {
  it("SET_SUBTASKS creates leaves, parent budget becomes Σ(children), invariants hold", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 25 }),
      {
        type: "SET_SUBTASKS",
        parentId: "P",
        children: [
          { title: "write", budget: 30 },
          { title: "review", budget: 20 },
        ],
      },
    ]);
    // parent stays in the plan but its budget is now the sum, not the old 25
    expect(task(s, "P").budget).toBe(50);
    const leaves = s.plan.filter((i) => i.kind === "task" && (i as UnstartedTask).parentId === "P");
    expect(leaves).toHaveLength(2);
    // children inherit the parent's head by default
    expect((leaves[0] as UnstartedTask).headId).toBe("work");
    expect(checkInvariants(s)).toEqual([]);
  });

  it("leaves occupy the spine contiguously; the parent is the span [min,max]", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      {
        type: "SET_SUBTASKS",
        parentId: "P",
        children: [
          { title: "a", budget: 30 },
          { title: "b", budget: 30 },
        ],
      },
    ]);
    const leafIds = s.plan
      .filter((i) => i.kind === "task" && (i as UnstartedTask).parentId === "P")
      .map((i) => i.id);
    const a = parts(s, leafIds[0]!)[0]!;
    const b = parts(s, leafIds[1]!)[0]!;
    expect(a).toEqual({ start: T(9, 0), end: T(9, 30) });
    expect(b).toEqual({ start: T(9, 30), end: T(10, 0) });
    // parent bracket spans both leaves
    expect(parts(s, "P")[0]).toEqual({ start: T(9, 0), end: T(10, 0) });
    expect(checkInvariants(s)).toEqual([]);
  });

  it("re-issuing SET_SUBTASKS replaces the whole prior decomposition (one direction, R5)", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      { type: "SET_SUBTASKS", parentId: "P", children: [{ title: "old", budget: 40 }] },
    ]);
    const oldLeaf = s.plan.find((i) => (i as UnstartedTask).parentId === "P")!.id;
    s = reduce(s, {
      type: "SET_SUBTASKS",
      parentId: "P",
      children: [
        { title: "new1", budget: 15 },
        { title: "new2", budget: 15 },
      ],
    });
    expect(s.plan.some((i) => i.id === oldLeaf)).toBe(false);
    expect(task(s, "P").budget).toBe(30);
    expect(s.plan.filter((i) => (i as UnstartedTask).parentId === "P")).toHaveLength(2);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("empty children recomposes the parent back into an ordinary placeable leaf", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      { type: "SET_SUBTASKS", parentId: "P", children: [{ title: "x", budget: 40 }] },
      { type: "SET_SUBTASKS", parentId: "P", children: [] },
    ]);
    expect(s.plan.filter((i) => (i as UnstartedTask).parentId === "P")).toHaveLength(0);
    // P is a leaf again: it occupies the spine itself. Its budget retains the
    // decomposed total (40) — the decomposition redefined the parent's size.
    expect(task(s, "P").budget).toBe(40);
    expect(parts(s, "P")[0]).toEqual({ start: T(9, 0), end: T(9, 40) });
    expect(checkInvariants(s)).toEqual([]);
  });

  it("a Fixed child inside a Budgeted parent contributes its wall to the sum", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      {
        type: "SET_SUBTASKS",
        parentId: "P",
        children: [
          { title: "meeting", timing: "fixed", anchorStart: T(10, 0), anchorEnd: T(11, 0), slideable: false, breakable: false },
          { title: "prep", budget: 30 },
        ],
      },
    ]);
    // 60 (fixed wall) + 30 (budget) = 90
    expect(task(s, "P").budget).toBe(90);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe("running a composition", () => {
  it("START on a parent starts its first leaf; ancestors survive the cancel-above sweep", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("X", { timing: "budgeted", budget: 30 }), // above the parent — should be cancelled
      mkTask("P", { timing: "budgeted", budget: 10 }),
      {
        type: "SET_SUBTASKS",
        parentId: "P",
        children: [
          { title: "leaf1", budget: 30 },
          { title: "leaf2", budget: 30 },
        ],
      },
      { type: "START_TASK", taskId: "P" },
    ]);
    const leaf1 = s.running!.id;
    expect(s.running!.parentId).toBe("P");
    expect(s.running!.title).toBe("leaf1");
    // X (a non-ancestor above) was cancelled; P (the ancestor) survived
    expect(s.history.some((h) => h.taskId === "X" && h.outcome === "cancelled")).toBe(true);
    expect(s.plan.some((i) => i.id === "P")).toBe(true);
    expect(s.plan.some((i) => i.id === leaf1)).toBe(false); // running, left the plan
    expect(checkInvariants(s)).toEqual([]);
  });

  it("completing the last leaf completes the parent (removes the bracket); per-leaf history heads", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      {
        type: "SET_SUBTASKS",
        parentId: "P",
        children: [
          { title: "commute", headId: "transport", budget: 30 },
          { title: "work", headId: "work", budget: 30 },
        ],
      },
      { type: "START_TASK", taskId: "P" }, // → first leaf (commute)
      { type: "TICK", to: T(9, 30) },
      { type: "COMPLETE_RUNNING" },
    ]);
    // first leaf done, but the parent lives on (leaf2 pending)
    expect(s.plan.some((i) => i.id === "P")).toBe(true);
    const leaf2 = s.plan.find((i) => (i as UnstartedTask).parentId === "P")!.id;

    s = reduceAll(s, [
      { type: "START_TASK", taskId: leaf2 },
      { type: "TICK", to: T(10, 0) },
      { type: "COMPLETE_RUNNING" },
    ]);
    // last leaf done → parent bracket gone from the plan
    expect(s.plan.some((i) => i.id === "P")).toBe(false);
    // analytics split: each leaf's occupancy attributed to its own head
    const occ = s.history.filter((h) => h.kind === "occupancy");
    expect(occ.map((h) => h.headId).sort()).toEqual(["transport", "work"]);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("pausing a leaf keeps its remainder bound to the parent (no premature completion)", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      { type: "SET_SUBTASKS", parentId: "P", children: [{ title: "solo", budget: 60 }] },
      { type: "START_TASK", taskId: "P" },
      { type: "TICK", to: T(9, 20) },
      { type: "PAUSE_RUNNING" },
    ]);
    const rem = s.plan.find((i) => i.id === s.plan.find((x) => (x as UnstartedTask).remainderOf)?.id) as UnstartedTask;
    expect(rem.parentId).toBe("P"); // remainder still a child
    expect(s.plan.some((i) => i.id === "P")).toBe(true); // parent not completed
    expect(checkInvariants(s)).toEqual([]);
    // finishing the remainder now completes the parent
    s = reduceAll(s, [
      { type: "START_TASK", taskId: rem.id },
      { type: "TICK", to: T(9, 40) },
      { type: "COMPLETE_RUNNING" },
    ]);
    expect(s.plan.some((i) => i.id === "P")).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("a decomposed parent stays a bracket while its sole leaf runs (never re-placed as a task)", () => {
    // Regression: decomposing a FIXED task set its budget to Σ children, which
    // diverged from its anchor span. When the only leaf started (leaving the
    // plan) the parent must NOT revert to a schedulable fixed task.
    let s = initialState(T(6, 0));
    s = reduceAll(s, [
      mkTask("F", { timing: "fixed", anchorStart: T(6, 0), anchorEnd: T(6, 5), budget: 5, slideable: false, breakable: false }),
      { type: "SET_SUBTASKS", parentId: "F", children: [{ title: "only", budget: 6 }] },
      { type: "START_TASK", taskId: "F" }, // → the single leaf; F has no plan child now
    ]);
    expect(s.running!.parentId).toBe("F");
    expect(s.plan.some((i) => i.id === "F")).toBe(true); // still a bracket
    expect(checkInvariants(s)).toEqual([]);
    s = reduceAll(s, [{ type: "TICK", to: T(6, 6) }, { type: "COMPLETE_RUNNING" }]);
    expect(s.plan.some((i) => i.id === "F")).toBe(false); // completed with its leaf
    expect(checkInvariants(s)).toEqual([]);
  });

  it("subtaskCount: recorded at decomposition; kept on start, decremented on cancel", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      {
        type: "SET_SUBTASKS",
        parentId: "P",
        children: [
          { title: "a", budget: 20 },
          { title: "b", budget: 20 },
          { title: "c", budget: 20 },
        ],
      },
    ]);
    expect(task(s, "P").subtaskCount).toBe(3);
    const kids = s.plan.filter((i) => (i as UnstartedTask).parentId === "P");
    // cancel the MIDDLE leaf → count shrinks so survivors renumber contiguously
    s = reduce(s, { type: "CANCEL_TASK", taskId: kids[1]!.id });
    expect(task(s, "P").subtaskCount).toBe(2);
    expect(s.plan.filter((i) => (i as UnstartedTask).parentId === "P")).toHaveLength(2);
    expect(checkInvariants(s)).toEqual([]);
    // start the first remaining leaf → count unchanged (a started leaf keeps its slot)
    const rem = s.plan.filter((i) => (i as UnstartedTask).parentId === "P");
    s = reduce(s, { type: "START_TASK", taskId: rem[0]!.id });
    expect(task(s, "P").subtaskCount).toBe(2);
  });

  it("cancelling the last remaining leaf removes the empty parent bracket", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      { type: "SET_SUBTASKS", parentId: "P", children: [{ title: "solo", budget: 30 }] },
    ]);
    const leaf = s.plan.find((i) => (i as UnstartedTask).parentId === "P")!.id;
    s = reduce(s, { type: "CANCEL_TASK", taskId: leaf });
    expect(s.plan.some((i) => i.id === "P")).toBe(false); // no ghost bracket
    expect(checkInvariants(s)).toEqual([]);
  });

  it("history persists the composition link (parentId + title) after the parent is gone", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("P", { timing: "budgeted", budget: 10 }),
      {
        type: "SET_SUBTASKS",
        parentId: "P",
        children: [
          { title: "one", budget: 20 },
          { title: "two", budget: 20 },
        ],
      },
      { type: "START_TASK", taskId: "P" },
      { type: "TICK", to: T(9, 20) },
      { type: "COMPLETE_RUNNING" },
    ]);
    const occ1 = s.history.find((h) => h.kind === "occupancy")!;
    expect(occ1).toMatchObject({ parentId: "P", parentTitle: "P" });
    // finish the second leaf → parent object removed, but its history keeps the link
    const leaf2 = s.plan.find((i) => (i as UnstartedTask).parentId === "P")!.id;
    s = reduceAll(s, [
      { type: "START_TASK", taskId: leaf2 },
      { type: "TICK", to: T(9, 40) },
      { type: "COMPLETE_RUNNING" },
    ]);
    expect(s.plan.some((i) => i.id === "P")).toBe(false);
    const occ = s.history.filter((h) => h.kind === "occupancy");
    expect(occ.every((h) => h.parentId === "P" && h.parentTitle === "P")).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it("nested composition: completing the last grandchild completes parent AND grandparent", () => {
    let s = initialState(T(9, 0));
    s = reduceAll(s, [
      mkTask("G", { timing: "budgeted", budget: 10 }),
      { type: "SET_SUBTASKS", parentId: "G", children: [{ title: "mid", budget: 60 }] },
    ]);
    const mid = s.plan.find((i) => (i as UnstartedTask).parentId === "G")!.id;
    s = reduce(s, { type: "SET_SUBTASKS", parentId: mid, children: [{ title: "leaf", budget: 60 }] });
    const leaf = s.plan.find((i) => (i as UnstartedTask).parentId === mid)!.id;
    // grandparent bracket spans down through mid to the single leaf
    expect(parts(s, "G")[0]).toEqual(parts(s, leaf)[0]);
    expect(checkInvariants(s)).toEqual([]);

    s = reduceAll(s, [
      { type: "START_TASK", taskId: "G" }, // resolves G → mid → leaf
      { type: "TICK", to: T(10, 0) },
      { type: "COMPLETE_RUNNING" },
    ]);
    expect(s.running).toBeNull();
    // both ancestors gone
    expect(s.plan.some((i) => i.id === mid)).toBe(false);
    expect(s.plan.some((i) => i.id === "G")).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });
});
