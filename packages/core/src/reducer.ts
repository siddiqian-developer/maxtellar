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

function resettle(s: State): State {
  const placements = settle({
    plan: s.plan,
    cursor: cursorOf(s),
    minFragment: s.minFragment,
    openExtentCap: s.openExtentCap,
    semiTailFloor: s.semiTailFloor,
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
      // G4/G5: an anchored proposal lands at the nearest legal coordinates,
      // never overlapping an existing wall. (Never says no — relocates.)
      const walls = s1.plan
        .filter((i): i is UnstartedTask => i.kind === "task")
        .map((t) => wallInterval(t, state.minFragment))
        .filter((w): w is NonNullable<typeof w> => w !== null);
      const task = placeAnchored(snapped, walls, state.now, state.minFragment);
      const plan = [...s1.plan, task].sort(byRank);
      return resettle({ ...s1, plan });
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
      const target = state.plan.find((i) => i.kind === "task" && i.id === event.taskId) as
        | UnstartedTask
        | undefined;
      if (!target) return state;
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
      //    sheet muscle-memory); gaps above are dropped.
      const cancelled = s.plan.filter(
        (i): i is UnstartedTask => i.kind === "task" && i.rank < target.rank,
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
          },
        ];
      }
      const plan = s.plan.filter((i) => i.rank >= target.rank && i.id !== target.id);

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
      };
      return resettle({
        ...state,
        running: null,
        history: [...state.history, entry],
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
      };
      return resettle({
        ...state,
        plan: state.plan.filter((i) => i.id !== t.id),
        history: [...state.history, entry],
      });
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
      const plan = placeBatch(snapped, state.now, state.minFragment);
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
  }
}

/** Convenience: run a sequence of events. */
export function reduceAll(state: State, events: Event[]): State {
  return events.reduce(reduce, state);
}
