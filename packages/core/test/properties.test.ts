/**
 * Property-based suite (§7.2): random task soups + event storms must uphold
 * the R-audit invariants at EVERY step:
 *   no-overlap · budget conservation · forward-only · no fragment < MIN_FRAGMENT
 *   · deterministic replay (event-sourcing idempotence).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  initialState,
  reduce,
  checkInvariants,
  checkForwardOnly,
  sodPrecondition,
  type Event,
  type State,
} from "../src/index.js";

const START_NOW = 6 * 60;

/** Abstract commands are interpreted against the current state so that every
 *  generated event is well-formed (fast-check stays free of state coupling). */
type Cmd =
  | { c: "tick"; d: number }
  | { c: "create"; timing: number; budget: number; at: number; ommf: boolean }
  | { c: "start"; pick: number }
  | { c: "pause" }
  | { c: "complete" }
  | { c: "cancel"; pick: number }
  | { c: "log"; ch: number; m: number }
  | { c: "decompose"; pick: number; budgets: number[] };

const cmdArb: fc.Arbitrary<Cmd> = fc.oneof(
  fc.record({ c: fc.constant("tick" as const), d: fc.integer({ min: 1, max: 45 }) }),
  fc.record({
    c: fc.constant("create" as const),
    timing: fc.integer({ min: 0, max: 3 }),
    budget: fc.integer({ min: 5, max: 120 }),
    at: fc.integer({ min: 0, max: 600 }),
    ommf: fc.boolean(),
  }),
  fc.record({ c: fc.constant("start" as const), pick: fc.nat() }),
  fc.record({ c: fc.constant("pause" as const) }),
  fc.record({ c: fc.constant("complete" as const) }),
  fc.record({ c: fc.constant("cancel" as const), pick: fc.nat() }),
  fc.record({
    c: fc.constant("log" as const),
    ch: fc.integer({ min: 0, max: 2 }),
    m: fc.integer({ min: 1, max: 60 }),
  }),
  fc.record({
    c: fc.constant("decompose" as const),
    pick: fc.nat(),
    budgets: fc.array(fc.integer({ min: 5, max: 90 }), { minLength: 1, maxLength: 3 }),
  }),
);

let uid = 0;
function toEvent(s: State, cmd: Cmd): Event | null {
  switch (cmd.c) {
    case "tick":
      return { type: "TICK", to: s.now + cmd.d };
    case "create": {
      const id = `t${++uid}`;
      const base = {
        id,
        title: id,
        headId: "h",
        activityId: "a",
        tier: "normal" as const,
        ommf: cmd.ommf,
        slideable: true,
        breakable: !cmd.ommf,
      };
      const timing = (["budgeted", "fixed", "semi-head", "semi-tail"] as const)[cmd.timing]!;
      const anchor = s.now + cmd.at;
      const task =
        timing === "budgeted"
          ? { ...base, timing, budget: cmd.budget }
          : timing === "fixed"
            ? { ...base, timing, anchorStart: anchor, anchorEnd: anchor + cmd.budget, budget: cmd.budget }
            : timing === "semi-head"
              ? { ...base, timing, anchorStart: anchor, budget: cmd.budget }
              : { ...base, timing, anchorEnd: anchor + cmd.budget, budget: cmd.budget };
      return { type: "CREATE_TASK", task: task as never };
    }
    case "start": {
      const tasks = s.plan.filter((i) => i.kind === "task");
      if (tasks.length === 0) return null;
      return { type: "START_TASK", taskId: tasks[cmd.pick % tasks.length]!.id };
    }
    case "pause":
      return s.running ? { type: "PAUSE_RUNNING" } : null;
    case "complete":
      return s.running ? { type: "COMPLETE_RUNNING" } : null;
    case "cancel": {
      const tasks = s.plan.filter((i) => i.kind === "task");
      if (tasks.length === 0) return null;
      return { type: "CANCEL_TASK", taskId: tasks[cmd.pick % tasks.length]!.id };
    }
    case "log":
      return s.running
        ? {
            type: "LOG_CHANNEL",
            channel: (["wasted", "managed", "breaks"] as const)[cmd.ch]!,
            minutes: cmd.m,
          }
        : null;
    case "decompose": {
      // §2.7: pick a plan task and split it into budgeted leaves (inherit head).
      const tasks = s.plan.filter((i) => i.kind === "task");
      if (tasks.length === 0) return null;
      const parentId = tasks[cmd.pick % tasks.length]!.id;
      return {
        type: "SET_SUBTASKS",
        parentId,
        children: cmd.budgets.map((b, k) => ({ title: `${parentId}.${k}`, budget: b })),
      };
    }
  }
}

describe("property: invariants hold under arbitrary event storms", () => {
  it("no-overlap, conservation, min-fragment, future-only — always", () => {
    fc.assert(
      fc.property(fc.array(cmdArb, { minLength: 1, maxLength: 60 }), (cmds) => {
        let s = initialState(START_NOW);
        for (const cmd of cmds) {
          const ev = toEvent(s, cmd);
          if (!ev) continue;
          s = reduce(s, ev);
          const violations = checkInvariants(s);
          expect(violations).toEqual([]);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("forward-only: ticking never moves a surviving placement earlier", () => {
    fc.assert(
      fc.property(
        fc.array(cmdArb, { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 1, max: 20 }),
        (cmds, ticks) => {
          let s = initialState(START_NOW);
          for (const cmd of cmds) {
            const ev = toEvent(s, cmd);
            if (ev) s = reduce(s, ev);
          }
          for (let i = 0; i < ticks; i++) {
            const before = s;
            s = reduce(s, { type: "TICK" });
            expect(checkForwardOnly(before, s)).toEqual([]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("deterministic replay: same events → identical state (event-sourcing)", () => {
    fc.assert(
      fc.property(fc.array(cmdArb, { minLength: 1, maxLength: 40 }), (cmds) => {
        const run = (): State => {
          let s = initialState(START_NOW);
          const events: Event[] = [];
          let localUid = uid; // isolate id generation per run
          for (const cmd of cmds) {
            const ev = toEvent(s, cmd);
            if (ev) {
              events.push(ev);
              s = reduce(s, ev);
            }
          }
          uid = localUid;
          return s;
        };
        const a = run();
        const b = run();
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      }),
      { numRuns: 50 },
    );
  });
});

describe("simulation: long random soup survives thousands of ticks", () => {
  it("5,000 ticks with periodic churn — zero violations, bounded work", () => {
    let s = initialState(START_NOW);
    let n = 0;
    const mk = (i: number): Event => {
      const timing = (["budgeted", "fixed", "semi-tail"] as const)[i % 3]!;
      const id = `sim${++n}`;
      const base = {
        id,
        title: id,
        headId: "h",
        activityId: "a",
        tier: "normal" as const,
        ommf: i % 7 === 0,
        slideable: true,
        breakable: true,
      };
      const budget = 5 + (i % 12) * 10;
      const anchor = s.now + 30 + (i % 9) * 40;
      const task =
        timing === "budgeted"
          ? { ...base, timing, budget }
          : timing === "fixed"
            ? { ...base, timing, anchorStart: anchor, anchorEnd: anchor + budget, budget }
            : { ...base, timing, anchorEnd: anchor + budget, budget };
      return { type: "CREATE_TASK", task: task as never };
    };

    for (let i = 0; i < 5000; i++) {
      if (i % 37 === 0) s = reduce(s, mk(i));
      if (i % 71 === 0) {
        // §2.7: periodically decompose a plan task into 2 budgeted leaves
        const tasks = s.plan.filter((x) => x.kind === "task");
        if (tasks.length > 0) {
          const p = tasks[i % tasks.length]!.id;
          s = reduce(s, {
            type: "SET_SUBTASKS",
            parentId: p,
            children: [
              { title: `${p}.a`, budget: 10 + (i % 5) * 10 },
              { title: `${p}.b`, budget: 10 + (i % 3) * 10 },
            ],
          });
        }
      }
      if (i % 101 === 0) {
        const tasks = s.plan.filter((x) => x.kind === "task");
        if (tasks.length > 0)
          s = reduce(s, { type: "START_TASK", taskId: tasks[i % tasks.length]!.id });
      }
      if (i % 149 === 0 && s.running) s = reduce(s, { type: "COMPLETE_RUNNING" });
      s = reduce(s, { type: "TICK" });
      if (i % 50 === 0) expect(checkInvariants(s)).toEqual([]);
    }
    expect(checkInvariants(s)).toEqual([]);
  });

  it("50,000 ticks with sleeps + SOD ceremonies — zero violations, day records tile", () => {
    // §4.2: back-log a sleep-cycle roughly every ~16 dev-hours, run a full SOD
    // ceremony whenever the precondition holds, and keep the invariant asserts
    // (incl. day-record-zero-sum) green throughout a long multi-day run.
    let s = initialState(START_NOW);
    let n = 0;
    let lastSleepEnd = START_NOW;
    let sods = 0;

    const mk = (i: number): Event => {
      const timing = (["budgeted", "fixed", "semi-tail"] as const)[i % 3]!;
      const id = `sm${++n}`;
      const base = {
        id,
        title: id,
        headId: "Work",
        activityId: "a",
        tier: "normal" as const,
        ommf: i % 7 === 0,
        slideable: true,
        breakable: true,
      };
      const budget = 5 + (i % 12) * 10;
      const anchor = s.now + 30 + (i % 9) * 40;
      const task =
        timing === "budgeted"
          ? { ...base, timing, budget }
          : timing === "fixed"
            ? { ...base, timing, anchorStart: anchor, anchorEnd: anchor + budget, budget }
            : { ...base, timing, anchorEnd: anchor + budget, budget };
      return { type: "CREATE_TASK", task: task as never };
    };

    const backlogSleep = (): void => {
      if (s.running) return; // never book into a live running span
      // Anchor the Finished Sleep strictly after the latest occupied minute so
      // it can't overlap any existing occupancy (BACKLOG would reject that, G7).
      const lastOcc = s.history
        .filter((h) => h.kind === "occupancy" && h.end > h.start)
        .reduce((m, h) => Math.max(m, h.end), START_NOW);
      const start = Math.max(lastSleepEnd, lastOcc) + 30;
      const end = start + 7 * 60;
      if (end >= s.now) return; // must be finished (in the past)
      s = reduce(s, {
        type: "BACKLOG",
        entry: {
          taskId: null,
          title: "Sleep",
          headId: "Recharge",
          activityId: "Sleep",
          kind: "occupancy",
          start,
          end,
          outcome: "completed",
          channels: { spent: end - start, wasted: 0, managed: 0, breaks: 0 },
          sleepKind: "sleep",
        },
      });
      lastSleepEnd = end;
    };

    for (let i = 0; i < 50000; i++) {
      if (i % 340 === 0) s = reduce(s, mk(i)); // ordinary tasks churn the plan
      if (i % 220 === 0) backlogSleep(); // ~ a sleep every few hours of dev-time
      if (i % 190 === 0) {
        const tasks = s.plan.filter((x) => x.kind === "task");
        if (tasks.length > 0)
          s = reduce(s, { type: "START_TASK", taskId: tasks[i % tasks.length]!.id });
      }
      if (i % 260 === 0 && s.running) s = reduce(s, { type: "COMPLETE_RUNNING" });
      // Run the ceremony whenever it's available (drives many SODs over the run).
      if (!s.ceremony) {
        const pre = sodPrecondition(s);
        if (pre.ok) {
          s = reduce(s, { type: "SOD" });
          sods++;
        }
      } else if (s.ceremony.phase === "pruning") {
        s = reduce(s, { type: "PRUNING_DONE" });
      } else {
        s = reduce(s, { type: "PLANNING_DONE" });
      }
      s = reduce(s, { type: "TICK" });
      if (i % 500 === 0) expect(checkInvariants(s)).toEqual([]);
    }
    expect(checkInvariants(s)).toEqual([]);
    expect(sods).toBeGreaterThan(5); // the run actually exercised the ceremony
    expect(s.days.length).toBeGreaterThan(5);
  });
});
