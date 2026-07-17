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
  DatedTask,
  DayRecord,
  Dur,
  Event,
  HistoryEntry,
  HistoryOutcome,
  Min,
  PlanItem,
  PomodoroPhase,
  RunningView,
  State,
  UnstartedTask,
  WeekPlan,
  WeekTemplate,
} from "./types.js";
import { emptyChannels, SELF_MANAGEMENT, SLEEP } from "./types.js";
import { headName } from "./headPath.js";
import { CORE_WORK, LOST_HOURS_ID, OFF_PERIOD_ID, RECHARGING, SLEEP_ID, SLEEP_TEMPLATE_ID, sleepTemplate, sleepBudgetEntry, weekBudgetValidity } from "./budget.js";
import { deadLeftovers, sodPrecondition, unaccountedGaps } from "./ceremony.js";
import { canPlanWeek, injectTodayDetailed, quotaAdjustmentsAtSod, quotaTrimsAtPruning } from "./week.js";
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
export const DEFAULT_SLEEP_MINUTES: Dur = 480; // 8h (§11.4)

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
    ceremony: null,
    days: [],
    week: {
      startedAt: null,
      firstWeekday: null,
      offDays: [0],
      // §11.4 (revised 2026-07-21): Sleep is always present as a real,
      // undeletable template + budget entry — see `sleepTemplate`/
      // `sleepBudgetEntry` in budget.ts for why (real injection capacity,
      // not a synthetic accounting-only line).
      templates: [sleepTemplate({ budget: DEFAULT_SLEEP_MINUTES })],
      sleepMinutes: DEFAULT_SLEEP_MINUTES,
      budgets: [sleepBudgetEntry(DEFAULT_SLEEP_MINUTES)],
      categoryTargets: {},
      quotaAdjust: [],
    },
    dated: [],
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

/** §4.1/§7 history laws — the single validator for both the single-entry
 * back-log insert and the full-history editor replace. Occupancy edges are
 * snapped into the legal past (end ≤ now, start ≤ end — the past can never push
 * `now`, §1.2), then any occupancy overlap is REJECTED by throwing. A throw
 * leaves the caller's `live` state unreferenced (pure reduce) — the same
 * backstop guarantee as EDIT_COMMIT. Insertion order of `entries` is preserved
 * (the overlap scan sorts a copy); zero-occupancy markers never bound overlap. */
function validateHistoryBatch<T extends { kind: HistoryEntry["kind"]; start: Min; end: Min }>(
  entries: T[],
  now: Min,
): T[] {
  const snapped = entries.map((e) => {
    const end = Math.min(e.end, now);
    const start = Math.min(e.start, end);
    return { ...e, start, end };
  });
  const occ = snapped
    .filter((e) => e.kind === "occupancy")
    .slice()
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < occ.length; i++) {
    if (occ[i - 1]!.end > occ[i]!.start)
      throw new Error("history edit would overlap occupancy history (G7)");
  }
  return snapped;
}

/** The first schedulable instant for the plan (§3.13). */
/** §5.2: minutes that consume the countdown budget — work spent PLUS sanctioned
 * breaks (breaks eat budget). `breaks` is 0 for every non-pomodoro task, so this
 * is a pure generalization of the old `spent`-only remaining. */
const budgetUsed = (c: Channels): Dur => c.spent + c.breaks;

export function cursorOf(s: State): Min {
  if (!s.running) return s.now;
  if (s.running.budget === undefined) return s.now; // stopwatch: open tail rides now
  const remaining = Math.max(0, s.running.budget - budgetUsed(s.running.channels));
  return s.now + remaining; // countdown: projected end (overrun → now)
}

export function runningView(s: State): RunningView | null {
  const r = s.running;
  if (!r) return null;
  const elapsedWall = s.now - r.startedAt;
  if (r.budget === undefined) {
    return { mode: "stopwatch", elapsedWall, remaining: 0, overrun: false, projectedEnd: s.now };
  }
  const remaining = Math.max(0, r.budget - budgetUsed(r.channels));
  return {
    mode: "countdown",
    elapsedWall,
    remaining,
    overrun: budgetUsed(r.channels) > r.budget,
    projectedEnd: s.now + remaining,
  };
}

/** §5.2: derived pomodoro view for the UI — current phase, how far into it, and
 * whether it's DUE (elapsed ≥ phaseLen), i.e. the alarm+modal should show. Pure;
 * null when the running task is not a pomodoro. */
export interface PomodoroView {
  phase: PomodoroPhase;
  phaseLen: Dur;
  phaseElapsed: Dur;
  due: boolean;
  cycle: number;
  /** if a break is taken NOW, would it be the long break? (drives the label). */
  nextBreakIsLong: boolean;
}
export function pomodoroView(s: State): PomodoroView | null {
  const p = s.running?.pomodoro;
  if (!p) return null;
  const phaseElapsed = Math.max(0, s.now - p.phaseStartedAt);
  return {
    phase: p.phase,
    phaseLen: p.phaseLen,
    phaseElapsed,
    due: phaseElapsed >= p.phaseLen,
    cycle: p.cycle,
    nextBreakIsLong: (p.cycle + 1) % Math.max(1, p.config.cyclesBeforeLong) === 0,
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
        const r = s.running;
        const p = r.pomodoro;
        let channels: Channels;
        if (p) {
          // §5.2 phase-aware accrual: minutes up to phaseLen → the phase's
          // primary channel (work→spent, break→breaks); minutes BEYOND it →
          // the decision channel (after work→managed, after break→wasted —
          // the app never auto-pauses). Split the delta at the phase boundary.
          const elapsed = Math.max(0, state.now - p.phaseStartedAt);
          const room = Math.max(0, p.phaseLen - elapsed);
          const primary = Math.min(delta, room);
          const overflow = delta - primary;
          const primaryCh = p.phase === "work" ? "spent" : "breaks";
          const overflowCh = p.phase === "work" ? "managed" : "wasted";
          channels = { ...r.channels };
          channels[primaryCh] += primary;
          channels[overflowCh] += overflow;
        } else {
          // default accrual: running minutes are spent(work); reattribution via LOG_CHANNEL
          channels = { ...r.channels, spent: r.channels.spent + delta };
        }
        s = { ...s, running: { ...r, channels } };
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
        ...(target.parentId !== undefined ? { parentId: target.parentId } : {}),
        channels: emptyChannels(),
        // §5.2: begin a pomodoro run when the Start carries a config — first
        // phase is work, its clock anchored at now.
        ...(event.pomodoro
          ? {
              pomodoro: {
                config: event.pomodoro,
                phase: "work" as const,
                phaseLen: event.pomodoro.workMin,
                phaseStartedAt: s.now,
                cycle: 0,
              },
            }
          : {}),
      };
      return resettle({ ...s, plan, history, running });
    }

    case "PAUSE_RUNNING": {
      const r = state.running;
      if (!r) return state;
      // Occupied part → history (§3.10); unspent budget → remainder in the plan.
      // A zero-wall pause (paused the same minute it started) occupied nothing —
      // recording a [t,t] occupancy would be a spurious point that a later Lost
      // Hours span (§4.2) or the no-overlap scan reads as an overlap. Skip it;
      // the remainder below carries the whole budget forward.
      const occupied = state.now > r.startedAt;
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
        ...parentLink(state.plan, r.parentId),
      };
      let s: State = {
        ...state,
        running: null,
        history: occupied ? [...state.history, entry] : state.history,
        seq: state.seq + 1,
      };

      const remaining = r.budget !== undefined ? r.budget - budgetUsed(r.channels) : undefined;
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

    // §9.2 two-stage completion: SOFT_END_RUNNING is the FIRST tap — it ends the
    // task *now* without classifying it ("never block the flow"); the verdict can
    // follow later in the history editor (which already edits `outcome`).
    // It is NOT a pause: pause returns the unspent budget to the plan as a
    // remainder because the task continues; a soft-end ends it, exactly like
    // COMPLETE_RUNNING but with the verdict withheld. Hence the shared path below.
    case "SOFT_END_RUNNING":
    case "COMPLETE_RUNNING": {
      const r = state.running;
      if (!r) return state;
      const outcome: HistoryOutcome = event.type === "SOFT_END_RUNNING" ? "soft-ended" : "completed";
      // Zero-wall complete (completed the same minute it started) occupied
      // nothing — omit the spurious [t,t] occupancy point (see PAUSE_RUNNING).
      const occupied = state.now > r.startedAt;
      const entry: HistoryEntry = {
        id: `occ-${r.id}-${state.seq}`,
        taskId: r.id,
        title: r.title,
        headId: r.headId,
        activityId: r.activityId,
        kind: "occupancy",
        start: r.startedAt,
        end: state.now,
        outcome,
        channels: r.channels,
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
        history: occupied ? [...state.history, entry] : state.history,
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

    case "RERANK": {
      // §3.11/§3.13: drag-to-reorder. Recompute the task's LexoRank so it lands
      // immediately after `afterId` (null = front), then resettle — list
      // position IS priority (E4), so the fill order and placements follow. A
      // pure between-key insert (rank.ts); no other item's rank changes.
      const target = state.plan.find((i) => i.id === event.taskId);
      if (!target || event.afterId === event.taskId) return state;
      const others = state.plan.filter((i) => i.id !== event.taskId).sort(byRank);
      let newRank: string;
      if (event.afterId == null) {
        newRank = rankBetween(null, others[0]?.rank ?? null);
      } else {
        const idx = others.findIndex((i) => i.id === event.afterId);
        if (idx === -1) return state; // unknown anchor — no-op
        newRank = rankBetween(others[idx]!.rank, others[idx + 1]?.rank ?? null);
      }
      if (newRank === target.rank) return state;
      const plan = state.plan
        .map((i) => (i.id === event.taskId ? ({ ...i, rank: newRank } as PlanItem) : i))
        .sort(byRank);
      return resettle({ ...state, plan });
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

    case "POMODORO_BREAK": {
      // §5.2 work-end tap: work → break (or the long break every
      // cyclesBeforeLong-th completed work interval). Zero automation — only
      // this explicit tap transitions; the phase clock resets to now.
      const r = state.running;
      if (!r?.pomodoro || r.pomodoro.phase !== "work") return state;
      const p = r.pomodoro;
      const cycle = p.cycle + 1;
      const isLong = cycle % Math.max(1, p.config.cyclesBeforeLong) === 0;
      const pomodoro = {
        ...p,
        phase: (isLong ? "longBreak" : "break") as PomodoroPhase,
        phaseLen: isLong ? p.config.longBreakMin : p.config.breakMin,
        phaseStartedAt: state.now,
        cycle,
      };
      return resettle({ ...state, running: { ...r, pomodoro } });
    }

    case "POMODORO_RESUME": {
      // §5.2 break-end tap: break/longBreak → a fresh work interval.
      const r = state.running;
      if (!r?.pomodoro || r.pomodoro.phase === "work") return state;
      const pomodoro = {
        ...r.pomodoro,
        phase: "work" as PomodoroPhase,
        phaseLen: r.pomodoro.config.workMin,
        phaseStartedAt: state.now,
      };
      return resettle({ ...state, running: { ...r, pomodoro } });
    }

    case "POMODORO_EXTEND": {
      // §5.2 Keep working / Extend break +N (and +1 pomodoro = +workMin): grow
      // the CURRENT phase's cap so the modal won't re-fire until the new length.
      // No phase change, no clock reset.
      const r = state.running;
      if (!r?.pomodoro) return state;
      const minutes = Math.max(0, Math.round(event.minutes));
      const pomodoro = { ...r.pomodoro, phaseLen: r.pomodoro.phaseLen + minutes };
      return resettle({ ...state, running: { ...r, pomodoro } });
    }

    case "BACKLOG": {
      // History is born directly into the past (G6); never pushes now (1.2).
      // Validated against the whole existing history via the shared law helper
      // (snap edges, reject overlap) so back-log and the editor share one path.
      const [id, s1] = nextId(state, "log");
      const history = validateHistoryBatch([...s1.history, { ...event.entry, id }], s1.now);
      return { ...s1, history };
    }

    case "EDIT_HISTORY": {
      // History editor commit (§4.1): the batch atomically REPLACES history
      // after validation — edits (changed spans) and deletes (omitted entries)
      // in one shot. Any missing id is assigned; overlap/illegal spans throw and
      // discard the batch upstream (pure reduce, EDIT_COMMIT backstop). History
      // is scheduler-immune — no resettle.
      let s = state;
      const withIds: HistoryEntry[] = event.batch.map((e) => {
        let id = e.id;
        if (!id) {
          const [nid, ns] = nextId(s, "log");
          id = nid;
          s = ns;
        }
        return { ...e, id };
      });
      const history = validateHistoryBatch(withIds, s.now);
      return { ...s, history };
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

    case "SOD": {
      // §4.2 (G13/G15): the commit ceremony. Precondition ≥2 Finished Sleep in
      // the forming day; A = topmost, B = the next (3+ → first two, iterative).
      // The UI gates on sodPrecondition and opens the missing-data GapFillModal
      // when not ok; the reducer no-ops defensively.
      const pre = sodPrecondition(state);
      if (!pre.ok || !pre.sleepA || !pre.sleepB) return state;
      const start = pre.sleepA.start;
      const end = pre.sleepB.start; // sweep [A.start, B.start); B is the new head
      const [id, s1] = nextId(state, "day");
      // Book every unaccounted gap in the swept span as Lost Hours occupancy
      // (open-item 10: one entry per span, taskId null). History is append-only
      // and scheduler-immune; nothing is moved — the DayRecord marks boundaries
      // and the Lost Hours entries fill the gutter so the day tiles fully
      // (wall = accounted + lost, made explicit).
      const occ = state.history
        .filter((h) => h.kind === "occupancy" && h.end > h.start)
        .map((h) => ({ start: h.start, end: h.end }));
      const gaps = unaccountedGaps(occ, start, end);
      const lost: HistoryEntry[] = gaps.map((g, k) => ({
        id: `lost-${id}-${k}`,
        taskId: null,
        title: "Lost Hours",
        headId: LOST_HOURS_ID,
        activityId: "",
        kind: "occupancy",
        start: g.start,
        end: g.end,
        outcome: "completed",
        channels: { spent: g.end - g.start, wasted: 0, managed: 0, breaks: 0 },
      }));
      const history = validateHistoryBatch([...state.history, ...lost], state.now);
      const record: DayRecord = { id, start, end, reportDate: event.reportDate ?? state.now };
      // Unstarted leftovers SURVIVE the sweep; enter Pruning. No resettle — the
      // plan is untouched and history is scheduler-immune.
      return { ...s1, history, days: [...state.days, record], ceremony: { phase: "pruning" } };
    }

    case "PRUNING_DONE": {
      // §4.2 step 2 → 3. Discard dead leftovers (auto-dead ∪ user-chosen) via the
      // existing CANCEL_TASK path (records a cancelled entry, cleans up parent
      // brackets, resettles). Then §5.1 redistribution → quota trims (sticky
      // deficit) → §4.4 weekly-plan injection. → phase "planning".
      if (!state.ceremony || state.ceremony.phase !== "pruning") return state;
      const dead = deadLeftovers(state).map((t) => t.id);
      const discard = new Set<string>([...dead, ...(event.discardIds ?? [])]);
      let s: State = state;
      for (const taskId of discard) {
        if (s.plan.some((i) => i.id === taskId)) s = reduce(s, { type: "CANCEL_TASK", taskId });
      }
      // §4.4/§3.13 injection: instantiate today's templates BELOW the surviving
      // leftovers, then settle+amputate (partly-past anchored → amputate head at
      // birth, G18; fully-past → perish). Only when a week is started and the web
      // supplied today's midnight/weekday. Injected anchors keep their TRUE
      // coordinates (no proposal relocation), so a passed moment amputates.
      if (event.inject && s.week.startedAt !== null) {
        const { midnight, weekday } = event.inject;
        // §5.1: settle the sealed day's weekly quotas FIRST — shortfall/exact-
        // overshoot adjusts the remaining days' shares (today included), so the
        // injection below draws against the redistributed shape.
        const redis = quotaAdjustmentsAtSod(s, midnight, weekday);
        if (redis.adjust.length > 0) {
          s = { ...s, week: { ...s.week, quotaAdjust: [...s.week.quotaAdjust, ...redis.adjust] } };
        }
        // §5.1 Stage 6: Pruning trims apply AFTER redistribution (so they cut
        // the post-pile-up share) and BEFORE injection (so drawing-down uses
        // the trimmed budget). The cut is the sticky visible deficit.
        const trims = quotaTrimsAtPruning(s.week, weekday, event.quotaTrims ?? []);
        if (trims.adjust.length > 0) {
          s = { ...s, week: { ...s.week, quotaAdjust: [...s.week.quotaAdjust, ...trims.adjust] } };
        }
        const below = s.plan.length
          ? s.plan.reduce((m, i) => (i.rank > m ? i.rank : m), s.plan[0]!.rank)
          : null;
        let lo = below;
        const rankBelow = (prev: string | null): string => {
          const r = rankAfter(prev ?? lo);
          lo = r;
          return r;
        };
        const mkId = (): string => {
          const [id, ns] = nextId(s, "task");
          s = ns;
          return id;
        };
        const { tasks: injected, spilled, firedOnceIds, notes } = injectTodayDetailed(s, midnight, weekday, mkId, rankBelow);
        if (injected.length > 0) {
          const plan = [...s.plan, ...injected].sort(byRank);
          s = applyAmputations({ ...s, plan });
          s = resettle(s);
        }
        // §4.4: retire the `once` templates that just fired — mark firedOn so
        // they never inject again (they stay listed, marked, until deleted).
        if (firedOnceIds.length > 0) {
          const fired = new Set(firedOnceIds);
          s = {
            ...s,
            week: {
              ...s.week,
              templates: s.week.templates.map((t) =>
                fired.has(t.id) && t.validity?.kind === "once"
                  ? { ...t, validity: { kind: "once", firedOn: midnight } }
                  : t,
              ),
            },
          };
        }
        // §11.7 spill: push what didn't fit to the NEXT day's dated adds.
        if (spilled.length > 0) {
          const nextDate = midnight + 1440;
          const others = s.dated.filter((e) => e.date !== nextDate);
          const existing = s.dated.find((e) => e.date === nextDate) ?? { date: nextDate, adds: [], skips: [], overrides: [] };
          let prev: string | null = existing.adds.length ? existing.adds[existing.adds.length - 1]!.rank : null;
          const adds = [...existing.adds];
          for (const spec of spilled) {
            const [id, ns] = nextId(s, "dtl");
            s = ns;
            const rank = rankAfter(prev);
            prev = rank;
            adds.push({ ...spec, id, rank });
          }
          s = { ...s, dated: [...others, { ...existing, adds }].sort((a, b) => a.date - b.date) };
        }
        // Universal snap-NOTIFY: every meaning-change is surfaced.
        const allNotes = [...redis.notes, ...trims.notes, ...notes];
        if (allNotes.length > 0) {
          s = { ...s, notice: { text: allNotes.join(" "), seq: (s.notice?.seq ?? 0) + 1 } };
        }
      }
      return { ...s, ceremony: { phase: "planning" } };
    }

    case "PLANNING_DONE": {
      // §4.2 step 4 → 5: Planning Done → Live.
      if (!state.ceremony) return state;
      return { ...state, ceremony: null };
    }

    case "SET_WEEK_PLAN": {
      // §4.4: replace the structural template set. LOCKED mid-week (canPlanWeek);
      // the web gates the affordance and passes today's weekday for the OFF-day
      // window check (reducer stays Date-free).
      if (!canPlanWeek(state, event.weekday ?? null, event.urgent)) return state;
      let s = state;
      let prev: string | null = null;
      const templates: WeekTemplate[] = event.templates.map((t) => {
        let id = t.id;
        if (!id) {
          const [nid, ns] = nextId(s, "tpl");
          id = nid;
          s = ns;
        }
        const rank = t.rank ?? rankAfter(prev);
        prev = rank;
        return {
          id,
          rank,
          title: t.title,
          headId: t.headId,
          activityId: t.activityId,
          timing: t.timing,
          tier: t.tier,
          ommf: t.ommf,
          slideable: t.slideable,
          breakable: t.breakable,
          weekdays: [...t.weekdays],
          ...(t.validity !== undefined ? { validity: t.validity } : {}),
          ...(t.budget !== undefined ? { budget: t.budget } : {}),
          ...(t.anchorStartTod !== undefined ? { anchorStartTod: t.anchorStartTod } : {}),
          ...(t.anchorEndTod !== undefined ? { anchorEndTod: t.anchorEndTod } : {}),
        };
      });
      // §11.4 (revised 2026-07-21): the Sleep template is undeletable — SET_WEEK_PLAN
      // replaces the WHOLE array, so a caller that simply forgot to carry it
      // forward (or a delete UI that never should've let it through) would
      // otherwise silently drop it. Re-inject the STATE's own copy (never
      // reconstructed from scratch — an edit to its anchors/timing/budget
      // survives) if it's missing from the incoming set.
      const hasSleep = templates.some((t) => t.id === SLEEP_TEMPLATE_ID);
      const prevSleep = s.week.templates.find((t) => t.id === SLEEP_TEMPLATE_ID);
      const withSleep = hasSleep || !prevSleep ? templates : [...templates, prevSleep];
      return { ...s, week: { ...s.week, templates: withSleep } };
    }

    case "SET_DATED": {
      // §4.6: replace the override entry for one calendar date. Assign ids/ranks
      // to new adds in order; drop the entry entirely if it ends up empty. Always
      // allowed — a specific date is never structurally locked (unlike the week).
      let s = state;
      let prev: string | null = null;
      const adds: DatedTask[] = event.adds.map((a) => {
        let id = a.id;
        if (!id) {
          const [nid, ns] = nextId(s, "dtl");
          id = nid;
          s = ns;
        }
        const rank = a.rank ?? rankAfter(prev);
        prev = rank;
        return {
          id,
          rank,
          title: a.title,
          headId: a.headId,
          activityId: a.activityId,
          timing: a.timing,
          tier: a.tier,
          ommf: a.ommf,
          slideable: a.slideable,
          breakable: a.breakable,
          ...(a.budget !== undefined ? { budget: a.budget } : {}),
          ...(a.anchorStartTod !== undefined ? { anchorStartTod: a.anchorStartTod } : {}),
          ...(a.anchorEndTod !== undefined ? { anchorEndTod: a.anchorEndTod } : {}),
        };
      });
      const skips = [...new Set(event.skips)];
      const overrides = event.overrides.map((o) => ({
        templateId: o.templateId,
        ...(o.anchorStartTod !== undefined ? { anchorStartTod: o.anchorStartTod } : {}),
        ...(o.anchorEndTod !== undefined ? { anchorEndTod: o.anchorEndTod } : {}),
        ...(o.budget !== undefined ? { budget: o.budget } : {}),
      }));
      const others = s.dated.filter((e) => e.date !== event.date);
      const empty = adds.length === 0 && skips.length === 0 && overrides.length === 0;
      const dated = empty ? others : [...others, { date: event.date, adds, skips, overrides }].sort((a, b) => a.date - b.date);
      return { ...s, dated };
    }

    case "START_WEEK": {
      // §4.4: explicit week rollover — mark the boundary + First Weekday + OFF
      // days. Daily SOD injection does the instantiating (three realities: with a
      // plan, without a plan yet, or never — all just start).
      // §11.2 gate: WITH head budgets, every planned weekday must balance to
      // exactly 24h (a week with no budgets is exempt — reality 3).
      const probe: WeekPlan = { ...state.week, offDays: event.offDays ?? state.week.offDays };
      if (!weekBudgetValidity(probe).ok) return state;
      return {
        ...state,
        week: {
          ...state.week,
          startedAt: event.startedAt ?? state.now,
          firstWeekday: event.firstWeekday ?? state.week.firstWeekday,
          offDays: event.offDays ?? state.week.offDays,
          quotaAdjust: [], // §5.1 ledger is per week instance
        },
      };
    }

    case "SET_OFF_DAYS": {
      // §4.4a: the OFF set (and the §4.4b First Weekday) change; the WEEK does not.
      // Deliberately does NOT touch `startedAt` (the week window weekly quotas and
      // Analytics measure from) or `quotaAdjust` (the §5.1 ledger) — only START_WEEK,
      // the rollover, may reset those. Nor is this gated on weekBudgetValidity: the
      // §11.2 gate exists to stop a week STARTING unbalanced, and it still guards the
      // Start-Week button. Gating here would make the chip a silent no-op instead.
      const offDays = [...new Set(event.offDays)].sort((a, b) => a - b);
      if (offDays.length === 0) return state; // §4.4: ≥1 OFF day required
      return {
        ...state,
        week: {
          ...state.week,
          offDays,
          firstWeekday: event.firstWeekday ?? state.week.firstWeekday,
        },
      };
    }

    case "SET_BUDGETS": {
      // §11: replace the head-budget set + explicit Category targets. Same
      // structural lock as SET_WEEK_PLAN. Percent is only legal on Core Work
      // heads and never Self-Management (§11.3) — invalid entries coerce to
      // absolute with their resolved minutes... there are none yet mid-edit, so
      // coerce to absolute 0 and let the planner's gate surface it.
      if (!canPlanWeek(state, event.weekday ?? null, event.urgent)) return state;
      const clampMin = (n: number): number => Math.max(0, Math.round(n));
      const budgets = event.budgets.map((b) => {
        const base = { ...b, weekdays: [...new Set(b.weekdays)].sort((x, y) => x - y) };
        if (b.kind === "percent" && (b.categoryId !== CORE_WORK || headName(b.headId) === SELF_MANAGEMENT)) {
          const { pct: _pct, ...rest } = base;
          return { ...rest, kind: "absolute" as const, minutes: clampMin(base.minutes ?? 0) };
        }
        if (b.kind === "percent") return { ...base, pct: Math.min(100, Math.max(0, b.pct ?? 0)) };
        if (b.kind === "weekly") return { ...base, quotaMinutes: clampMin(b.quotaMinutes ?? 0) };
        return { ...base, minutes: clampMin(b.minutes ?? 0) };
      });
      const categoryTargets = Object.fromEntries(
        Object.entries(event.categoryTargets ?? state.week.categoryTargets).map(([k, v]) => [k, clampMin(v)]),
      );
      // §11.4 (revised 2026-07-21): same "always present" guard as
      // SET_WEEK_PLAN's Sleep template — SET_BUDGETS also replaces the WHOLE
      // array, so a caller building its own list from scratch (never a real
      // risk from BudgetPanel, which always starts from `week.budgets` and so
      // already carries Sleep's entry forward, but a defensive guard costs
      // nothing) could otherwise silently drop Sleep's real budget entry.
      const prevSleepBudget = state.week.budgets.find((b) => b.headId === SLEEP_ID);
      const withSleep = budgets.some((b) => b.headId === SLEEP_ID) || !prevSleepBudget
        ? budgets
        : [prevSleepBudget, ...budgets];
      return { ...state, week: { ...state.week, budgets: withSleep, categoryTargets } };
    }

    case "SET_SLEEP_BUDGET": {
      // §11.4 (revised 2026-07-21): the ONE dispatch behind Sleep's synced
      // trio (Settings, BudgetPanel's pinned row, the Calendar block's own
      // editor) — updates the real template's timing/anchors/budget, the
      // real week.budgets entry (both injection capacity AND the 24h math
      // read this), and the `sleepMinutes` mirror (kept for existing
      // consumers — presets.ts's "settings" budget source, App.tsx's
      // transactional Settings draft — all still read the one number).
      const minutes = Math.max(0, Math.min(1440, Math.round(event.minutes)));
      const prevTpl = state.week.templates.find((t) => t.id === SLEEP_TEMPLATE_ID);
      const timing = event.timing ?? prevTpl?.timing;
      const anchorStartTod = event.anchorStartTod ?? prevTpl?.anchorStartTod;
      const anchorEndTod = event.anchorEndTod ?? prevTpl?.anchorEndTod;
      const anchorEndDayOffset = event.anchorEndDayOffset ?? prevTpl?.anchorEndDayOffset;
      const tpl = sleepTemplate({
        budget: minutes,
        ...(timing !== undefined ? { timing } : {}),
        ...(anchorStartTod !== undefined ? { anchorStartTod } : {}),
        ...(anchorEndTod !== undefined ? { anchorEndTod } : {}),
        ...(anchorEndDayOffset !== undefined ? { anchorEndDayOffset } : {}),
      });
      const templates = state.week.templates.some((t) => t.id === SLEEP_TEMPLATE_ID)
        ? state.week.templates.map((t) => (t.id === SLEEP_TEMPLATE_ID ? tpl : t))
        : [...state.week.templates, tpl];
      const budgets = state.week.budgets.some((b) => b.headId === SLEEP_ID)
        ? state.week.budgets.map((b) => (b.headId === SLEEP_ID ? sleepBudgetEntry(minutes) : b))
        : [sleepBudgetEntry(minutes), ...state.week.budgets];
      return { ...state, week: { ...state.week, sleepMinutes: minutes, templates, budgets } };
    }

    case "START_OFF_PERIOD": {
      // §4.5: begin an Inviolable running block. Pause any current runner (its
      // remainder survives); plan tasks push below (cursorOf uses the block's
      // projected end). Known end → countdown; unknown → open stopwatch. Books
      // to the Off-Periods head. Displaced-tasks perish/carry is a UI choice.
      let s = state;
      if (s.running) s = reduce(s, { type: "PAUSE_RUNNING" });
      const [id, s1] = nextId(s, "off");
      s = s1;
      const title = event.title?.trim() || "Off";
      const budget =
        event.knownEnd !== undefined ? Math.max(s.minFragment, event.knownEnd - s.now) : undefined;
      const running = {
        id,
        title,
        headId: OFF_PERIOD_ID,
        activityId: title,
        rank: rankAfter(s.plan.length ? s.plan[s.plan.length - 1]!.rank : null),
        tier: "inviolable" as const,
        ommf: false,
        timing: (budget !== undefined ? "fixed" : "unscheduled") as UnstartedTask["timing"],
        startedAt: s.now,
        ...(budget !== undefined ? { budget } : {}),
        channels: emptyChannels(),
        isOff: true,
      };
      return resettle({ ...s, running });
    }

    case "END_OFF_PERIOD": {
      // §4.5: complete the running off-period (no-op if none). COMPLETE_RUNNING
      // writes its Off-Periods occupancy and resettles the plan.
      if (!state.running || !state.running.isOff) return state;
      return reduce(state, { type: "COMPLETE_RUNNING" });
    }
  }
}

/** Convenience: run a sequence of events. */
export function reduceAll(state: State, events: Event[]): State {
  return events.reduce(reduce, state);
}
