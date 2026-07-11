/**
 * Core types — SPEC-timekeeper.md Part II.
 * All times are INTEGER MINUTES since an arbitrary epoch (absolute), durations in minutes.
 */

export type Min = number; // absolute minutes since epoch (integer)
export type Dur = number; // duration in minutes (integer)

/** Task-level accounting identity (§2.6, locked):
 *  wall = spent + wasted + managed + breaks */
export interface Channels {
  spent: Dur;
  wasted: Dur;
  managed: Dur;
  breaks: Dur;
}

export const emptyChannels = (): Channels => ({ spent: 0, wasted: 0, managed: 0, breaks: 0 });

/** Timing types apply to UNSTARTED tasks only (§2.5 ruling). */
export type TimingType =
  | "fixed" // start+end+budget known; immovable wall
  | "semi-head" // start anchored, tail floats
  | "semi-tail" // end anchored, head floats
  | "budgeted" // budget only; slides; the only breakable type
  | "unscheduled"; // nothing known

export type Tier = "normal" | "protected" | "inviolable";

export interface UnstartedTask {
  kind: "task";
  id: string;
  title: string;
  headId: string;
  activityId: string;
  /** LexoRank-style orderable string — list position IS priority (E4). */
  rank: string;
  tier: Tier;
  timing: TimingType;
  /** "once missed, missed forever" — perish on being passed (§2.5). */
  ommf: boolean;
  /** Stored + validated (maximal editability); see validate.ts. */
  slideable: boolean;
  breakable: boolean;
  /** Anchored coordinates (fixed: both; semi-head: start; semi-tail: end). */
  anchorStart?: Min;
  anchorEnd?: Min;
  /** Planned duration (fixed/budgeted/semi with budget). ≥ MIN_FRAGMENT when set. */
  budget?: Dur;
  /** Set when this is a paused remainder of a started task (§3.10). */
  remainderOf?: string;
}

/** A deliberate user buffer on the plan (inert; shrinks under pressure; vanishes at 0). */
export interface GapItem {
  kind: "gap";
  id: string;
  rank: string;
  budget: Dur;
}

export type PlanItem = UnstartedTask | GapItem;

/** One placed piece of a task on the future timeline. [start, end) */
export interface Part {
  start: Min;
  end: Min;
}

/** Result of the settle-pass for one plan item. */
export interface Placement {
  itemId: string;
  /** Placed parts in time order. A squeezed/compressed task has fewer minutes placed
   *  than its budget; the deficit is tracked (budget conservation). */
  parts: Part[];
  /** Minutes of budget not placeable before its obstacle while within squeeze
   *  tolerance (display: compressed). Conservation: sum(parts) + squeezedDeficit
   *  + overflowDeficit = budget. */
  squeezedDeficit: Dur;
  /** Minutes that could not be placed at all (e.g., ommf being amputated in place). */
  overflowDeficit: Dur;
}

export type HistoryOutcome = "completed" | "cancelled" | "skipped" | "soft-ended";

export interface HistoryEntry {
  id: string;
  taskId: string | null; // null for back-logged ad-hoc entries
  title: string;
  headId: string;
  activityId: string;
  /** occupancy = real time consumed; skipped = zero-occupancy marker (§3.1). */
  kind: "occupancy" | "skipped";
  start: Min;
  end: Min;
  outcome: HistoryOutcome;
  channels: Channels;
}

export type TimerMode = "countdown" | "stopwatch"; // §9.2 (from the 8-yr AppScript)

export interface RunningTask {
  id: string;
  title: string;
  headId: string;
  activityId: string;
  rank: string;
  tier: Tier;
  ommf: boolean;
  startedAt: Min;
  /** countdown when budget set; stopwatch otherwise. */
  budget?: Dur;
  channels: Channels;
}

export interface State {
  now: Min;
  minFragment: Dur;
  /** §3.9: a budget-less (open) task reserves its presumed extent up to this
   * cap (default 600 = 10h), not just minFragment — so lower-rank tasks land
   * after it rather than shrinking it. User-configurable. */
  openExtentCap: Dur;
  running: RunningTask | null;
  /** Append-only past. Occupancy entries non-overlapping, end ≤ now. */
  history: HistoryEntry[];
  /** The unstarted chunk (plus user gap buffers), sorted by rank. */
  plan: PlanItem[];
  /** Derived by settle() after every event — the laid-out future. */
  placements: Placement[];
  /** Monotonic counter for deterministic ids. */
  seq: number;
}

/* ------------------------------- Events ---------------------------------- */

export type Event =
  | { type: "TICK"; to?: Min } // advance now by 1 (or batch catch-up to `to`)
  | { type: "CREATE_TASK"; task: Omit<UnstartedTask, "kind" | "rank"> & { rank?: string } }
  | { type: "CREATE_GAP"; afterRank?: string; budget: Dur; id?: string }
  | { type: "START_TASK"; taskId: string }
  | { type: "PAUSE_RUNNING" }
  | { type: "COMPLETE_RUNNING" }
  | { type: "CANCEL_TASK"; taskId: string }
  | { type: "SET_OPEN_CAP"; minutes: Dur } // §3.9 open-task presumed-extent cap
  | { type: "LOG_CHANNEL"; channel: keyof Channels; minutes: Dur } // reattribute on running
  | { type: "BACKLOG"; entry: Omit<HistoryEntry, "id"> }
  | { type: "EDIT_COMMIT"; batch: PlanItem[] } // fork commit: replacement plan (re-settled at real now)
  // Bulk-reassigns every plan/running/history reference from one (head,activity)
  // pair to another — used when deleting a head/sub-head still in use (§2.1).
  // Pure label swap: never touches timing/placement, no resettle needed.
  | { type: "REASSIGN_HEAD"; fromHeadId: string; fromActivityId: string; toHeadId: string; toActivityId: string };

export interface RunningView {
  mode: TimerMode;
  elapsedWall: Dur;
  remaining: Dur; // clamped ≥ 0 (overrun shows 0)
  overrun: boolean;
  projectedEnd: Min; // countdown: now + remaining; stopwatch: now
}
