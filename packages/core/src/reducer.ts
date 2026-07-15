/**
 * THE EVENT REDUCER (E5) — every mutation is one sequential event:
 * (State, Event) → State. Pure; no I/O; integer minutes.
 *
 * Tick pipeline follows the fixed op order (R3):
 *   1. advance now / accrue running occupancy
 *   2. amputations (walls passed by the cursor; ommf remainders)
 *   3. settle (top-down chain resolution — slide/squeeze/wrap emergent)
 *   4..5. gap merge/vanish + reunification (emergent in settle)
 *   6. invariant asserts (see invariants.ts; run in tests)
 */

import type {
  Channels,
  Dur,
  Event,
  HistoryEntry,
  Min,
  PlanItem,
  RunningView,
  State,
  UnstartedTask,
} from "./types.js";
import { emptyChannels } from "./types.js";
import { settle } from "./settle.js";
import { snapTask } from "./validate.js";
import { rankAfter, rankBetween } from "./rank.js";
import { placeAnchored, placeBatch, wallInterval } from "./placement.js";

/** Rank strictly after `target` but before `next` (or just after target). */
function rankAfterTarget(target: string, next: string | null): string {
  return rankBetween(target, next);
}

export const DEFAULT_MIN_FRAGMENT: Dur = 5;
export const DEFAULT_OPEN_EXTENT_CAP: Dur = 600; // 10h (§3.9)
export const DEFAULT_SEMI_TAIL_FLOOR: Dur = 60; // 1h (§3.9.1, G27)

export function initialState(now: Min, minFragment: Dur = DEFAULT_MIN_FRAGMENT): State {
  return {
    now,
    minFragment,
    openExtentCap: DEFAULT_OPEN_EXTENT_CAP,
    semiTailFloor: DEFAULT_SEMI_TAIL_FLOOR,
    running: null,
    history: [],
    plan: [],
    placements: [],
    seq: 0,
  };
}

/* ------------------------------ helpers ---------------------------------- */

const byRank = (a: PlanItem, b: PlanItem): number => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

/** §2.7 (G24): a decomposed task's committed size is Σ of its children. A
 * fixed child's size is its wall; otherwise its budget (0 if truly open). */
function childBudget(t: UnstartedTask): Dur {
  if (t.budget !== undefined) return t.budget;
  if (t.timing === "fixed" && t.anchorStart !== undefined && t.anchorEnd !== undefined)
    return t.anchorEnd - t.anchorStart;
  return 0;
}

/** §2.7: walk the composition tree down to the first unstarted leaf (lowest
 * rank at each level). A leaf (no children in the plan) resolves to itself —
 * so START on a parent starts its first leaf. */
function firstLeaf(plan: PlanItem[], t: UnstartedTask): UnstartedTask {
  let cur = t;
  for (;;) {
    const kids = plan
      .filter((i): i is UnstartedTask => i.kind === "task" && i.parentId === cur.id)
      .sort(byRank);
    if (kids.length === 0) return cur;
    cur = kids[0]!;
  }
}

/** §2.7 (G24): zero-sum is recursive — recompute every parent's budget as Σ of
 * its children, bottom-up, to a fixpoint (a child's own decomposition changes
 * its size, which must ripple up to the grandparent). Bounded by tree depth. */
function rebalanceParents(plan: PlanItem[]): PlanItem[] {
  const parentIds = new Set<string>();
  for (const i of plan) if (i.kind === "task" && i.parentId) parentIds.add(i.parentId);
  if (parentIds.size === 0) return plan;
  let result = plan;
  for (let pass = 0; pass < parentIds.size + 1; pass++) {
    let changed = false;
    result = result.map((i) => {
      if (i.kind !== "task" || !parentIds.has(i.id)) return i;
      const sum = result
        .filter((c): c is UnstartedTask => c.kind === "task" && c.parentId === i.id)
        .reduce((acc, c) => acc + childBudget(c), 0);
      if (i.budget !== sum) {
        changed = true;
        return { ...i, budget: sum };
      }
      return i;
    });
    if (!changed) break;
  }
  return result;
}

/** §2.7 (G24): the composition link to stamp on a leaf's history entry, so the
 * timeline can still bracket it after the parent object is gone. */
function parentLink(
  plan: PlanItem[],
  parentId: string | undefined,
): { parentId?: string; parentTitle?: string } {
  if (parentId === undefined) return {};
  const title = (plan.find((i) => i.id === parentId) as UnstartedTask | undefined)?.title;
  return { parentId, ...(title !== undefined ? { parentTitle: title } : {}) };
}

/** §2.7: the chain of ancestor ids above a task (nearest first). */
function ancestorIds(plan: PlanItem[], t: UnstartedTask): Set<string> {
  const out = new Set<string>();
  let pid = t.parentId;
  while (pid) {
    out.add(pid);
    const p = plan.find((i) => i.id === pid) as UnstartedTask | undefined;
    pid = p?.parentId;
  }
  return out;
}

function nextId(s: State, prefix: string): [string, State] {
  const id = `${prefix}-${s.seq + 1}`;
  return [id, { ...s, seq: s.seq + 1 }];
}

/** The first schedulable instant for the plan (§3.13). */
export function cursorOf(s: State): Min {
  if (!s.running) return s.now;
  if (s.running.budget === undefined) return s.now; // stopwatch: open tail rides now
  const remaining = Math.max(0, s.running.budget - s.running.channels.spent);
  return s.now + remaining; // countdown: projected end (overrun → now)
}

export function runningView(s: State): RunningView | null {
  const r = s.running;
  if (!r) return null;
  const elapsedWall = s.now - r.startedAt;
  if (r.budget === undefined) {
    return { mode: "stopwatch", elapsedWall, remaining: 0, overrun: false, projectedEnd: s.now };
  }
  const remaining = Math.max(0, r.budget - r.channels.spent);
  return {
    mode: "countdown",
    elapsedWall,
    remaining,
    overrun: r.channels.spent > r.budget,
    projectedEnd: s.now + remaining,
  };
}

const totalChannels = (c: Channels): Dur => c.spent + c.wasted + c.managed + c.breaks;

/** §2.7 (G24): ids of the running leaf's ancestors — kept as brackets while
 * their sole leaf runs so a decomposed task never re-places as a schedulable
 * task (its stored budget/anchors may not agree once it de-parents). */
function runningBracketIds(s: State): Set<string> {
  const ids = new Set<string>();
  let pid = s.running?.parentId;
  while (pid) {
    ids.add(pid);
    pid = (s.plan.find((i) => i.id === pid) as UnstartedTask | undefined)?.parentId;
  }
  return ids;
}

function resettle(s: State): State {
  // §2.7 (G24): keep every parent's zero-sum budget in step with its CURRENT
  // plan children on every event — a leaf entering (paused remainder returns) or
  // leaving (started/completed/cancelled) the plan changes the sum. No-ops for a
  // plan with no parents. So a composed bracket's budget always equals the sum
  // of the leaves still to do under it.
  const rebalanced = rebalanceParents(s.plan);
  if (rebalanced !== s.plan) s = { ...s, plan: rebalanced };
  const placements = settle({
    plan: s.plan,
    cursor: cursorOf(s),
    minFragment: s.minFragment,
    openExtentCap: s.openExtentCap,
    semiTailFloor: s.semiTailFloor,
    bracketIds: runningBracketIds(s),
  });
  // G28: slide = MOVING (§3.2) — a slid task's anchor coordinate moves WITH
  // the ride, every settle. The stored anchor always equals the placed edge,
  // so views read it as an exact, upright fact (never ~italic) and there is
  // no "commit" moment. Idempotent: re-deriving the wall from the moved
  // anchor reproduces the same placement.
  let changed = false;
  const plan = s.plan.map((i) => {
    if (i.kind !== "task" || !i.slideable || i.timing === "fixed") return i;
    const p = placements.find((pl) => pl.itemId === i.id);
    if (!p || p.parts.length === 0) return i;
    if (i.timing === "semi-tail") {
      const end = p.parts[p.parts.length - 1]!.end;
      if (i.anchorEnd !== undefined && end !== i.anchorEnd) {
        changed = true;
        return { ...i, anchorEnd: end };
      }
    } else if (i.timing === "semi-head") {
      const start = p.parts[0]!.start;
      if (i.anchorStart !== undefined && start !== i.anchorStart) {
        changed = true;
        return { ...i, anchorStart: start };
      }
    }
    return i;
  });
  return changed ? { ...s, plan, placements } : { ...s, placements };
}

/** Record (or extend) the amputated head of an anchored task as zero-occupancy
 *  Skipped history (§3.7); remove tasks fully consumed by the cursor. */
function applyAmputations(s: State): State {
  const cursor = cursorOf(s);
  let state = s;
  const surviving: PlanItem[] = [];
  let history = state.history;

  for (const item of state.plan) {
    if (item.kind !== "task") {
      surviving.push(item);
      continue;
    }
    // G28: a slideable anchored task is NEVER amputated — under any pressure
    // (bare now, a runner's span, overrun) settle rides it ahead of the
    // cursor instead; its moment never silently passes. Fixed is never
    // slideable; R4 amputation is non-slideable business only.
    if (item.slideable && item.timing !== "fixed") {
      surviving.push(item);
      continue;
    }
    const anchoredStart =
      item.timing === "fixed" || item.timing === "semi-head" ? item.anchorStart : undefined;
    const anchoredEnd =
      item.timing === "fixed"
        ? item.anchorEnd
        : item.timing === "semi-tail"
          ? item.anchorEnd
          : undefined;

    // semi-tail amputates in place only when even its floor is invaded (R4).
    const floorInvaded =
      item.timing === "semi-tail" && anchoredEnd !== undefined && cursor >= anchoredEnd;

    if (anchoredStart !== undefined && cursor > anchoredStart) {
      const skipEnd = Math.min(cursor, item.timing === "fixed" ? item.anchorEnd! : cursor);
      const skipId = `skip-${item.id}`;
      const existing = history.find((h) => h.id === skipId);
      if (existing) {
        history = history.map((h) => (h.id === skipId ? { ...h, end: skipEnd } : h));
      } else {
        history = [
          ...history,
          {
            id: skipId,
            taskId: item.id,
            title: item.title,
            headId: item.headId,
            activityId: item.activityId,
            kind: "skipped",
            start: anchoredStart,
            end: skipEnd,
            outcome: "skipped",
            channels: emptyChannels(),
            ...parentLink(state.plan, item.parentId),
          },
        ];
      }
      // fully consumed?
      if (item.timing === "fixed" && cursor >= item.anchorEnd!) continue; // dies Skipped
      if (item.timing === "semi-head" && item.budget !== undefined && cursor >= anchoredStart + item.budget)
        continue;
    }
    if (floorInvaded) {
      const skipId = `skip-${item.id}`;
      // open semi-tail dies at its floor span (G27), not MIN_FRAGMENT
      const start = anchoredEnd! - (item.budget ?? Math.max(state.minFragment, state.semiTailFloor));
      if (!history.find((h) => h.id === skipId)) {
        history = [
          ...history,
          {
            id: skipId,
            taskId: item.id,
            title: item.title,
            headId: item.headId,
            activityId: item.activityId,
            kind: "skipped",
            start,
            end: anchoredEnd!,
            outcome: "skipped",
            channels: emptyChannels(),
            ...parentLink(state.plan, item.parentId),
          },
        ];
      }
      continue; // dies Skipped (amputated in place)
    }
    surviving.push(item);
  }
  return { ...state, plan: surviving, history };
}

/* ------------------------------ reducer ---------------------------------- */

export function reduce(state: State, event: Event): State {
  switch (event.type) {
    case "TICK": {
      const to = event.to ?? state.now + 1;
      if (to <= state.now) return state; // monotonic internal clock (R11)
      const delta = to - state.now;
      let s: State = { ...state, now: to };
      if (s.running) {
        // default accrual: running minutes are spent(work); reattribution via LOG_CHANNEL
        s = {
          ...s,
          running: {
            ...s.running,
            channels: { ...s.running.channels, spent: s.running.channels.spent + delta },
          },
        };
      }
      s = applyAmputations(s);
      return resettle(s);
    }

    case "CREATE_TASK": {
      const [id, s1] = event.task.id ? [event.task.id, state] : nextId(state, "task");
      const rank = event.task.rank ?? rankAfter(state.plan.length ? state.plan[state.plan.length - 1]!.rank : null);
      const draft: UnstartedTask = { kind: "task", ...event.task, id, rank } as UnstartedTask;
      const { task: snapped } = snapTask(draft, state.minFragment, state.now);
      // G4/G5 + priority (2026-07-15): an anchored proposal lands at the nearest
      // legal coordinates. PRIORITY IS ENTRY ORDER, not timing type — a newly
      // added task ranks LAST, so it yields to EVERY existing task regardless of
      // its own timing (a late-added Fixed task does NOT preempt earlier work).
      // So the obstacles are the current occupied EXTENTS of all existing plan
      // tasks (from their placements), plus anchored wall intervals for any not
      // yet placed. Only anchored proposals actually relocate (placeAnchored
      // leaves budgeted/unscheduled tasks untouched).
      const occupied = s1.placements
        .filter((p) => (s1.plan.find((i) => i.id === p.itemId) as UnstartedTask | undefined)?.kind === "task")
        .map((p) => (p.parts.length ? { start: p.parts[0]!.start, end: p.parts[p.parts.length - 1]!.end } : null))
        .filter((iv): iv is { start: Min; end: Min } => iv !== null);
      const anchoredWalls = s1.plan
        .filter((i): i is UnstartedTask => i.kind === "task")
        .map((t) => wallInterval(t, state.minFragment))
        .filter((w): w is NonNullable<typeof w> => w !== null);
      const task = placeAnchored(snapped, [...occupied, ...anchoredWalls], state.now, state.minFragment);
      // §7.0.2 snap-notify: if the anchored proposal was pushed later than
      // requested to respect priority, tell the user (once, via `seq`).
      const req = wallInterval(snapped, state.minFragment);
      const got = wallInterval(task, state.minFragment);
      const relocated = req !== null && got !== null && got.start > req.start;
      const plan = [...s1.plan, task].sort(byRank);
      const settled = resettle({ ...s1, plan }); // preserves s1.notice via spread
      return relocated
        ? {
            ...settled,
            notice: {
              text: `“${task.title}” was added after your earlier tasks, so its start moved later to avoid overlapping higher-priority work.`,
              seq: (s1.notice?.seq ?? 0) + 1,
            },
          }
        : settled;
    }

    case "CREATE_GAP": {
      const [id, s1] = event.id ? [event.id, state] : nextId(state, "gap");
      const rank = event.afterRank ? rankAfter(event.afterRank) : rankAfter(
        state.plan.length ? state.plan[state.plan.length - 1]!.rank : null,
      );
      const plan = [...s1.plan, { kind: "gap" as const, id, rank, budget: event.budget }].sort(byRank);
      return resettle({ ...s1, plan });
    }

    case "START_TASK": {
      const requested = state.plan.find((i) => i.kind === "task" && i.id === event.taskId) as
        | UnstartedTask
        | undefined;
      if (!requested) return state;
      // §2.7 (G24): starting a parent resolves to its first unstarted leaf —
      // only leaves ever run. A leaf resolves to itself.
      const target = firstLeaf(state.plan, requested);
      let s = state;

      // 1. Start-over-running default: PAUSE the runner (locked ruling, §3.10).
      //    Its remainder must SURVIVE the cancel-above rule below — it re-ranks
      //    to just below the newly started task ("Y now, R later").
      const pausedRemainderId = s.running ? `${s.running.id}-rem` : null;
      if (s.running) s = reduce(s, { type: "PAUSE_RUNNING" });
      if (pausedRemainderId) {
        const rem = s.plan.find((i) => i.id === pausedRemainderId);
        if (rem) {
          const below = s.plan
            .filter((i) => i.rank > target.rank && i.id !== rem.id)
            .map((i) => i.rank)
            .sort()[0];
          const newRank = rankAfterTarget(target.rank, below ?? null);
          s = {
            ...s,
            plan: s.plan
              .map((i) => (i.id === rem.id ? { ...i, rank: newRank } : i))
              .sort(byRank),
          };
        }
      }

      // 2. Starting a mid-queue task CANCELS all unstarted tasks above it (§3.10,
      //    sheet muscle-memory); gaps above are dropped. §2.7 (G24): the
      //    started leaf's own ANCESTORS are exempt — they rank above it as
      //    brackets but must survive so the composition stays intact while the
      //    leaf runs.
      const ancestors = ancestorIds(s.plan, target);
      const cancelled = s.plan.filter(
        (i): i is UnstartedTask => i.kind === "task" && i.rank < target.rank && !ancestors.has(i.id),
      );
      let history = s.history;
      for (const c of cancelled) {
        history = [
          ...history,
          {
            id: `cancel-${c.id}`,
            taskId: c.id,
            title: c.title,
            headId: c.headId,
            activityId: c.activityId,
            kind: "skipped",
            start: s.now,
            end: s.now,
            outcome: "cancelled",
            channels: emptyChannels(),
            ...parentLink(s.plan, c.parentId),
          },
        ];
      }
      let plan = s.plan.filter(
        (i) => (i.rank >= target.rank || ancestors.has(i.id)) && i.id !== target.id,
      );
      // §2.7: earlier siblings cancelled by starting this leaf vanish from the
      // numbering too — shrink the parent's planned count by that many.
      if (target.parentId) {
        const cancelledSiblings = cancelled.filter((c) => c.parentId === target.parentId).length;
        if (cancelledSiblings > 0)
          plan = plan.map((i) =>
            i.id === target.parentId && i.kind === "task"
              ? ({ ...i, subtaskCount: Math.max(0, (i.subtaskCount ?? cancelledSiblings) - cancelledSiblings) } as UnstartedTask)
              : i,
          );
      }

      // 3. Start (explicit human act — the only way anything runs, G11).
      // An anchored END is a contract that survives starting: fixed AND
      // semi-tail run a countdown to their anchor (late start runs the
      // remainder; the anchor outranks a stored budget). Never a stopwatch
      // that erases the end.
      const budget =
        (target.timing === "fixed" || target.timing === "semi-tail") &&
        target.anchorEnd !== undefined
          ? Math.max(s.minFragment, target.anchorEnd - s.now)
          : target.budget;
      const running = {
        id: target.id,
        title: target.title,
        headId: target.headId,
        activityId: target.activityId,
        rank: target.rank,
        tier: target.tier,
        ommf: target.ommf,
        timing: target.timing,
        startedAt: s.now,
        ...(budget !== undefined ? { budget } : {}),
        ...(target.sleepKind !== undefined ? { sleepKind: target.sleepKind } : {}),
        ...(target.parentId !== undefined ? { parentId: target.parentId } : {}),
        channels: emptyChannels(),
      };
      return resettle({ ...s, plan, history, running });
    }

    case "PAUSE_RUNNING": {
      const r = state.running;
      if (!r) return state;
      // Occupied part → history (§3.10); unspent budget → remainder in the plan.
      const entry: HistoryEntry = {
        id: `occ-${r.id}-${state.seq}`,
        taskId: r.id,
        title: r.title,
        headId: r.headId,
        activityId: r.activityId,
        kind: "occupancy",
        start: r.startedAt,
        end: state.now,
        outcome: "soft-ended",
        channels: r.channels,
        ...(r.sleepKind !== undefined ? { sleepKind: r.sleepKind } : {}),
        ...parentLink(state.plan, r.parentId),
      };
      let s: State = { ...state, running: null, history: [...state.history, entry], seq: state.seq + 1 };

      const remaining = r.budget !== undefined ? r.budget - r.channels.spent : undefined;
      if (remaining === undefined || remaining > 0) {
        const remBudget =
          remaining === undefined ? undefined : Math.max(s.minFragment, remaining); // floor (7.1)
        const remainder: UnstartedTask = {
          kind: "task",
          id: `${r.id}-rem`,
          title: r.title,
          headId: r.headId,
          activityId: r.activityId,
          rank: r.rank, // inherits parent's priority (G25)
          tier: r.tier,
          timing: r.ommf ? "semi-head" : remBudget === undefined ? "unscheduled" : "budgeted",
          ommf: r.ommf,
          slideable: !r.ommf,
          breakable: !r.ommf && remBudget !== undefined,
          ...(r.ommf ? { anchorStart: s.now } : {}), // ommf remainder holds its coords (G25)
          ...(remBudget !== undefined ? { budget: remBudget } : {}),
          ...(r.sleepKind !== undefined ? { sleepKind: r.sleepKind } : {}),
          ...(r.parentId !== undefined ? { parentId: r.parentId } : {}), // §2.7: stay a child
          remainderOf: r.id,
        };
        const { task: snapped } = snapTask(remainder, s.minFragment, s.now);
        // At BIRTH the remainder is a proposal (G4): nearest-legal placement
        // against existing walls. (G25's "cannot shift" binds after commit.)
        const walls = s.plan
          .filter((i): i is UnstartedTask => i.kind === "task")
          .map((t) => wallInterval(t, s.minFragment))
          .filter((w): w is NonNullable<typeof w> => w !== null);
        const task = placeAnchored(snapped, walls, s.now, s.minFragment);
        s = { ...s, plan: [...s.plan, task].sort(byRank) };
      }
      return resettle(s);
    }

    case "COMPLETE_RUNNING": {
      const r = state.running;
      if (!r) return state;
      const entry: HistoryEntry = {
        id: `occ-${r.id}-${state.seq}`,
        taskId: r.id,
        title: r.title,
        headId: r.headId,
        activityId: r.activityId,
        kind: "occupancy",
        start: r.startedAt,
        end: state.now,
        outcome: "completed",
        channels: r.channels,
        ...(r.sleepKind !== undefined ? { sleepKind: r.sleepKind } : {}),
        ...parentLink(state.plan, r.parentId),
      };
      // §2.7 (G24): completing the last leaf completes its ancestors. The
      // leaf already left the plan at START; walk up removing any ancestor
      // that has no remaining child in the plan. Ancestors carry no history
      // of their own — each leaf's occupancy is the sole record (analytics
      // split per-leaf head). Recurses to the grandparent and beyond.
      let plan = state.plan;
      let pid = r.parentId;
      while (pid) {
        const parent = plan.find((i) => i.id === pid) as UnstartedTask | undefined;
        if (!parent) break;
        const stillHasChildren = plan.some((i) => i.kind === "task" && i.parentId === pid);
        if (stillHasChildren) break; // pending leaves remain — parent lives on
        plan = plan.filter((i) => i.id !== pid);
        pid = parent.parentId;
      }
      return resettle({
        ...state,
        running: null,
        history: [...state.history, entry],
        plan,
        seq: state.seq + 1,
      });
    }

    case "CANCEL_TASK": {
      const t = state.plan.find((i) => i.kind === "task" && i.id === event.taskId) as
        | UnstartedTask
        | undefined;
      if (!t) return state;
      const entry: HistoryEntry = {
        id: `cancel-${t.id}`,
        taskId: t.id,
        title: t.title,
        headId: t.headId,
        activityId: t.activityId,
        kind: "skipped",
        start: state.now,
        end: state.now,
        outcome: "cancelled",
        channels: emptyChannels(),
        ...parentLink(state.plan, t.parentId),
      };
      let plan = state.plan.filter((i) => i.id !== t.id);
      // §2.7 (G24): cancelling a LEAF makes it vanish from the numbering — the
      // parent's planned count shrinks so the surviving leaves renumber
      // contiguously (unlike a STARTED leaf, which keeps its slot). A parent
      // left with no children (and none running under it) is removed too.
      if (t.parentId) {
        const runBrackets = runningBracketIds(state);
        plan = plan.map((i) =>
          i.id === t.parentId && i.kind === "task"
            ? ({ ...i, subtaskCount: Math.max(0, (i.subtaskCount ?? 1) - 1) } as UnstartedTask)
            : i,
        );
        let pid: string | undefined = t.parentId;
        while (pid) {
          const parent = plan.find((i) => i.id === pid) as UnstartedTask | undefined;
          if (!parent) break;
          const hasKids = plan.some((i) => i.kind === "task" && i.parentId === pid);
          if (hasKids || runBrackets.has(pid)) break;
          plan = plan.filter((i) => i.id !== pid);
          pid = parent.parentId;
        }
      }
      return resettle({ ...state, plan, history: [...state.history, entry] });
    }

    case "SET_MIN_FRAGMENT": {
      // §3.7/7.1: the fragment floor is settable in Settings. Every stored
      // budget must respect the new floor (no budget below it, ever), so each
      // plan task re-snaps; the dependent floors (open cap, semi-tail floor)
      // are themselves floored at minFragment, so they rise with it.
      const minFragment = Math.max(1, Math.round(event.minutes));
      const s: State = {
        ...state,
        minFragment,
        openExtentCap: Math.max(minFragment, state.openExtentCap),
        semiTailFloor: Math.max(minFragment, state.semiTailFloor),
      };
      const plan = s.plan
        .map((i) => (i.kind === "task" ? snapTask(i, minFragment, s.now).task : i))
        .sort(byRank);
      return resettle({ ...s, plan });
    }

    case "SET_OPEN_CAP": {
      // §3.9: change the open-task presumed-extent cap; re-settle so the new
      // reservation takes effect immediately. Floor at minFragment (a cap
      // below it would make open tasks smaller than the fragment floor).
      const cap = Math.max(state.minFragment, Math.round(event.minutes));
      return resettle({ ...state, openExtentCap: cap });
    }

    case "SET_TAIL_FLOOR": {
      // §3.9.1 (G27): change the open semi-tail compression floor; re-settle
      // so contested claims re-lay out. Floored at minFragment for the same
      // reason as SET_OPEN_CAP.
      const floor = Math.max(state.minFragment, Math.round(event.minutes));
      return resettle({ ...state, semiTailFloor: floor });
    }

    case "LOG_CHANNEL": {
      // Reattribute running minutes: spent → wasted/managed/breaks (§2.6).
      const r = state.running;
      if (!r || event.channel === "spent") return state;
      const minutes = Math.min(Math.max(0, event.minutes), r.channels.spent); // physics (E3)
      const channels: Channels = { ...r.channels };
      channels.spent -= minutes;
      channels[event.channel] += minutes;
      return resettle({ ...state, running: { ...r, channels } });
    }

    case "BACKLOG": {
      // History is born directly into the past (G6); never pushes now (1.2).
      const e = event.entry;
      const end = Math.min(e.end, state.now);
      const start = Math.min(e.start, end);
      if (e.kind === "occupancy") {
        const overlaps = state.history.some(
          (h) => h.kind === "occupancy" && h.start < end && start < h.end,
        );
        if (overlaps) throw new Error("BACKLOG would overlap occupancy history (G7)");
      }
      const [id, s1] = nextId(state, "log");
      return { ...s1, history: [...s1.history, { ...e, start, end, id }] };
    }

    case "EDIT_COMMIT": {
      // Fork commit (§3.12): the sandbox's batch replaces the plan; we re-settle
      // at REAL now (live wins). Each task re-snapped, anchored proposals
      // re-placed (G4/G5). Errors discard the batch upstream (sandbox pattern).
      const snapped = event.batch
        .map((i) => (i.kind === "task" ? snapTask(i, state.minFragment, state.now).task : i))
        .sort(byRank);
      // §2.7: a fork may have edited leaf budgets or re-parented — re-derive
      // every parent's zero-sum budget before placing.
      const plan = rebalanceParents(placeBatch(snapped, state.now, state.minFragment));
      return resettle(applyAmputations({ ...state, plan }));
    }

    case "REASSIGN_HEAD": {
      // Pure label swap (§2.1) — headId/activityId never influence placement,
      // so no resettle/re-snap is needed; matches by the (head,activity) PAIR,
      // not activity alone (an activity name only means something under its head).
      const { fromHeadId, fromActivityId, toHeadId, toActivityId } = event;
      const matches = (headId: string, activityId: string): boolean =>
        headId === fromHeadId && activityId === fromActivityId;
      const plan = state.plan.map((i) =>
        i.kind === "task" && matches(i.headId, i.activityId)
          ? { ...i, headId: toHeadId, activityId: toActivityId }
          : i,
      );
      const running =
        state.running && matches(state.running.headId, state.running.activityId)
          ? { ...state.running, headId: toHeadId, activityId: toActivityId }
          : state.running;
      const history = state.history.map((h) =>
        matches(h.headId, h.activityId) ? { ...h, headId: toHeadId, activityId: toActivityId } : h,
      );
      return { ...state, plan, running, history };
    }

    case "SET_SUBTASKS": {
      // §2.7 (G24): decompose a parent into leaves in ONE atomic rebalance.
      // Re-issuing replaces the whole prior decomposition (one direction, R5).
      const parent = state.plan.find((i) => i.kind === "task" && i.id === event.parentId) as
        | UnstartedTask
        | undefined;
      if (!parent) return state;
      // Drop the parent's existing direct children (and their subtrees, since
      // an orphaned child is removed with its parent link) before re-creating.
      const descendantIds = new Set<string>();
      const collect = (pid: string): void => {
        for (const i of state.plan) {
          if (i.kind === "task" && i.parentId === pid && !descendantIds.has(i.id)) {
            descendantIds.add(i.id);
            collect(i.id);
          }
        }
      };
      collect(parent.id);
      let plan = state.plan.filter((i) => !descendantIds.has(i.id));

      // New children rank CONTIGUOUSLY just below the parent (parent brackets
      // its leaves), between the parent's rank and the next sibling's.
      const after = plan
        .filter((i) => i.rank > parent.rank && i.id !== parent.id)
        .map((i) => i.rank)
        .sort()[0] ?? null;
      let s: State = state;
      let lo = parent.rank;
      const children: UnstartedTask[] = [];
      for (const spec of event.children) {
        let id = spec.id;
        if (!id) {
          const [nid, ns] = nextId(s, "task");
          id = nid;
          s = ns;
        }
        const rank = spec.rank ?? rankBetween(lo, after);
        // Build explicitly (no spread of an optional-field object — a spread
        // `undefined` would clobber a default). Head/activity inherit the
        // parent's unless the child overrides (§2.7: a subtask may carry its
        // own head, splitting analytics per-leaf).
        const draft: UnstartedTask = {
          kind: "task",
          id,
          rank,
          title: spec.title,
          headId: spec.headId ?? parent.headId,
          activityId: spec.activityId ?? parent.activityId,
          tier: spec.tier ?? parent.tier,
          timing: spec.timing ?? "budgeted",
          ommf: spec.ommf ?? false,
          slideable: spec.slideable ?? true,
          breakable: spec.breakable ?? false,
          parentId: parent.id,
          ...(spec.budget !== undefined ? { budget: spec.budget } : {}),
          ...(spec.anchorStart !== undefined ? { anchorStart: spec.anchorStart } : {}),
          ...(spec.anchorEnd !== undefined ? { anchorEnd: spec.anchorEnd } : {}),
          ...(spec.sleepKind !== undefined ? { sleepKind: spec.sleepKind } : {}),
        };
        const { task: snapped } = snapTask(draft, state.minFragment, state.now);
        children.push(snapped);
        lo = rank;
      }

      // Record the child count on the parent (display only — leaf ordinals and
      // the Start-first/…/last label). Cleared when recomposing to a leaf.
      plan = plan.map((i) =>
        i.id === parent.id
          ? ({ ...i, subtaskCount: children.length > 0 ? children.length : undefined } as UnstartedTask)
          : i,
      );
      // Zero-sum: recompute the parent's budget (and any ancestor's) as Σ of
      // its children, rippling up the tree. With no children the parent
      // recomposes into an ordinary leaf (budget left as-is).
      plan = rebalanceParents(plan.concat(children).sort(byRank));
      return resettle({ ...s, plan });
    }
  }
}

/** Convenience: run a sequence of events. */
export function reduceAll(state: State, events: Event[]): State {
  return events.reduce(reduce, state);
}
