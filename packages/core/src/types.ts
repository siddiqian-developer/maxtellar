/**
 * Core types — SPEC.md Part II.
 * All times are INTEGER MINUTES since an arbitrary epoch (absolute), durations in minutes.
 */

export type Min = number; // absolute minutes since epoch (integer)
export type Dur = number; // duration in minutes (integer)

/** Built-in heads (§2.10) — real heads, undeletable. Shared by core (Lost
 * Hours booking at SOD) and the web registry so the names have one source.
 * Two kinds: PLANNABLE (schedulable like any head) and SYSTEM (accounting-owned,
 * never planned). Recharge/Food are "inevitable-necessity" heads (§2.10). */
export const SELF_MANAGEMENT = "Self-Management";
export const RECHARGE = "Recharge";
export const FOOD = "Food";
export const WASTED_TIME = "Wasted Time";
export const LOST_HOURS = "Lost Hours";
/** §4.5: off-periods (illness, travel, abrupt breaks) book their Inviolable-tier
 * time here — a built-in head, undeletable, never a planning-picker option. */
export const OFF_PERIOD = "Off-Periods";

/** §2.9 (G14): Sleep = main day-defining sleep; Nap = any other. Explicit at
 * logging, never inferred. Both are ordinary tasks. */
export type SleepKind = "sleep" | "nap";

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
  /** §2.7 (G24) composition: the task this is a subtask of. A task that is
   * itself named by some other task's `parentId` is a PARENT (a derived
   * bracket) — it never occupies the spine; only its descendant leaves do,
   * and its budget is the zero-sum Σ of its children (enforced, §2.7). */
  parentId?: string;
  /** §2.7: on a PARENT, the count of children at decomposition (display only —
   * views name each leaf by its original 1-based ordinal and label the parent's
   * Start button "first … 2nd last, last"). Remaining leaves are always a
   * suffix (starting a leaf cancels earlier siblings), so the front ordinal of
   * the next leaf = subtaskCount − remaining + 1. */
  subtaskCount?: number;
  /** §2.9: marks a Sleep/Nap task. Explicit at logging, never inferred. */
  sleepKind?: SleepKind;
  /** §2.8 rider provision (G9) — schema only in MVP, no behavior. A rider is
   * softly bound to its primary; placement derives from the primary. */
  riderOf?: string;
  /** What happens to a rider's tail when the primary ends (§2.8). */
  spillPolicy?: "dismount" | "re-anchor";
  /** Rider lane; lane 2 exists but is hidden in MVP (§2.2). */
  lane?: number;
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
  /** §2.9: carried from the task (or set directly on back-log). A Finished
   * Sleep occupancy entry is what the SOD precondition counts (§4.2). */
  sleepKind?: SleepKind;
  /** §2.7 (G24): if this entry was a subtask leaf, the composition it belonged
   * to — persisted so the timeline can still bracket completed/running/paused
   * leaves as a composed group after the parent task object is gone. */
  parentId?: string;
  parentTitle?: string;
}

/** §4.2 (G13/G15): one sealed sleep-cycle day, appended at each SOD. The day is
 * Sleep-start → Sleep-start by construction: [start, end) = [Sleep A start,
 * Sleep B start). MINIMAL by design (open-item 7, settled 2026-07-15) — it
 * stores only the boundary facts; accounted/lost/per-head aggregates stay a
 * derived selector over `history` (SOD books Lost Hours occupancy so the day
 * tiles fully: within [start,end), Σ occupancy = end − start, hence the zero-sum
 * identity wall = accounted + lost with nothing cached to go stale. */
export interface DayRecord {
  id: string;
  /** Sweep start = Sleep A's start (this day's head sleep). */
  start: Min;
  /** Sweep end, exclusive = Sleep B's start (the next day's head sleep). */
  end: Min;
  /** Calendar day SOD was pressed — local-midnight epoch-minute; the UI derives
   * the label. Carried by the SOD event (the web computes it; core stays Date-
   * free), defaulting to `now` when omitted. */
  reportDate: Min;
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
  /** the started task's timing type, carried over so views can show it. */
  timing: TimingType;
  startedAt: Min;
  /** countdown when budget set; stopwatch otherwise. */
  budget?: Dur;
  channels: Channels;
  /** §2.9: carried from the unstarted task so completion writes it to history. */
  sleepKind?: SleepKind;
  /** §2.7 (G24): carried from the started leaf so completing the last leaf can
   * complete its ancestors, and a paused remainder stays bound to its parent. */
  parentId?: string;
  /** §4.5: this running block is an off-period (Inviolable tier) — lets
   * END_OFF_PERIOD and the UI distinguish it from an ordinary running task. */
  isOff?: boolean;
}

/** §4.4 weekly planning (G19). A reusable task template that SOD injection
 * instantiates onto matching weekdays. Anchored coordinates are stored as
 * MINUTES-INTO-THE-DAY [0,1440) (a "9am meeting"), converted to an absolute
 * epoch for today at injection. Recurrence = the weekday set it fires on. */
export interface WeekTemplate {
  id: string;
  title: string;
  headId: string;
  activityId: string;
  timing: TimingType;
  tier: Tier;
  ommf: boolean;
  slideable: boolean;
  breakable: boolean;
  /** Planned duration (fixed/budgeted/semi with budget). */
  budget?: Dur;
  /** Anchored time-of-day [0,1440) for fixed/semi-head start, fixed/semi-tail end. */
  anchorStartTod?: number;
  anchorEndTod?: number;
  sleepKind?: SleepKind;
  /** Recurrence: weekdays it instantiates on (0=Sun … 6=Sat). daily = all 7,
   * weekend = [0,6]. One-time/ranged is a future extension (§4.4). */
  weekdays: number[];
  /** LexoRank among templates — injection preserves this relative order. */
  rank: string;
}

/** §4.4: the week commitment. `templates` is the structural plan; `startedAt`
 * marks the current week's rollover (START_WEEK); `firstWeekday` is the declared
 * First Weekday; `offDays` are the planning/OFF weekdays (default Sunday) that
 * also open the mid-week planning lock (§4.4). */
export interface WeekPlan {
  startedAt: Min | null;
  firstWeekday: number | null;
  offDays: number[];
  templates: WeekTemplate[];
}

export interface State {
  now: Min;
  minFragment: Dur;
  /** §3.9: a budget-less (open) task reserves its presumed extent up to this
   * cap (default 600 = 10h), not just minFragment — so lower-rank tasks land
   * after it rather than shrinking it. User-configurable. */
  openExtentCap: Dur;
  /** §3.9.1 (G27): the floor an open semi-tail's ballooned claim can be
   * compressed to by a firm contester (default 60 = 1h). At the floor it
   * slides (slideable) or pins as a firm obstacle. User-configurable. */
  semiTailFloor: Dur;
  running: RunningTask | null;
  /** Append-only past. Occupancy entries non-overlapping, end ≤ now. */
  history: HistoryEntry[];
  /** The unstarted chunk (plus user gap buffers), sorted by rank. */
  plan: PlanItem[];
  /** Derived by settle() after every event — the laid-out future. */
  placements: Placement[];
  /** §4.2 (G13): null when Live; during the SOD ceremony the current guided
   * phase. Set by SOD (→ "pruning"), advanced by PRUNING_DONE (→ "planning"),
   * cleared by PLANNING_DONE (→ Live). Persisted so a mid-ceremony reload
   * resumes at the right step (deterministic replay). */
  ceremony: null | { phase: "pruning" | "planning" };
  /** §4.2: sealed sleep-cycle days, appended one per SOD. NOT re-derived each
   * render (open-item 7) — stored via the SOD event, reproduced by replay. */
  days: DayRecord[];
  /** §4.4: the weekly plan (templates + week boundary). Event-sourced. */
  week: WeekPlan;
  /** Monotonic counter for deterministic ids. */
  seq: number;
  /** Transient UI notice (§7.0.2 snap-notify) — set when the scheduler moves a
   * just-added task to respect priority (e.g. an anchored task placed after
   * earlier, higher-priority tasks). `seq` lets the UI show each notice once.
   * Derived/deterministic; ignored by invariants. */
  notice?: { text: string; seq: number };
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
  | { type: "SET_MIN_FRAGMENT"; minutes: Dur } // §3.7/7.1 fragment floor (settable in Settings)
  | { type: "SET_OPEN_CAP"; minutes: Dur } // §3.9 open-task presumed-extent cap
  | { type: "SET_TAIL_FLOOR"; minutes: Dur } // §3.9.1 open semi-tail compression floor
  | { type: "LOG_CHANNEL"; channel: keyof Channels; minutes: Dur } // reattribute on running
  // §2.7 (G24): decompose `parentId` into leaves in one atomic rebalance.
  // Children default to the parent's head; the parent budget becomes Σ(children)
  // and the parent turns into a derived bracket (leaves only occupy the spine).
  // Re-issuing replaces the whole decomposition. Empty children = recompose.
  | {
      type: "SET_SUBTASKS";
      parentId: string;
      // Each child needs only a title; head/activity default to the parent's,
      // timing defaults to budgeted. id/rank are assigned if omitted.
      children: (Partial<Omit<UnstartedTask, "kind" | "parentId">> & { title: string })[];
    }
  | { type: "BACKLOG"; entry: Omit<HistoryEntry, "id"> }
  // §4.1 history editor: atomically REPLACE history with a validated batch —
  // edits (changed spans) and deletes (omitted entries) in one shot. Entries
  // may omit `id` (assigned on insert). Overlap/illegal spans throw → discarded
  // (pure reduce, same backstop as EDIT_COMMIT). History is scheduler-immune.
  | { type: "EDIT_HISTORY"; batch: (Omit<HistoryEntry, "id"> & { id?: string })[] }
  | { type: "EDIT_COMMIT"; batch: PlanItem[] } // fork commit: replacement plan (re-settled at real now)
  // Bulk-reassigns every plan/running/history reference from one (head,activity)
  // pair to another — used when deleting a head/sub-head still in use (§2.1).
  // Pure label swap: never touches timing/placement, no resettle needed.
  | { type: "REASSIGN_HEAD"; fromHeadId: string; fromActivityId: string; toHeadId: string; toActivityId: string }
  // §4.2 SOD (G13/G15) — the commit ceremony. Precondition: ≥2 Finished Sleep
  // occupancy entries in the forming day (else the UI opens the missing-data
  // GapFillModal instead; the reducer no-ops). Sweeps [Sleep A start … Sleep B
  // start) into a DayRecord, books every unaccounted gap in that span as Lost
  // Hours occupancy (headId LOST_HOURS, taskId null — one per span, open-item
  // 10), leaves unstarted leftovers untouched, and enters phase "pruning".
  // `reportDate` (local-midnight Min) defaults to `now`.
  | { type: "SOD"; reportDate?: Min }
  // §4.2 step 2 → 3: discard dead leftovers (auto-dead ∪ user-chosen `discardIds`),
  // trim quotas (no quotas until Stage 6 → no-op), then auto-run today's
  // weekly-plan injection (§4.4) — `inject` carries today's local-midnight +
  // weekday from the web; instantiate today's templates below the leftovers and
  // settle (partly-past → amputate at birth). No week started → no-op. → "planning".
  | { type: "PRUNING_DONE"; discardIds?: string[]; inject?: { midnight: Min; weekday: number } }
  // §4.2 step 4 → 5: Planning Done → ceremony = null (Live).
  | { type: "PLANNING_DONE" }
  // §4.4 SET_WEEK_PLAN — replace the structural template set. LOCKED mid-week
  // (the week is a commitment): accepted only before the first week starts, on
  // an OFF day, or with the `urgent` bypass; otherwise a no-op.
  | { type: "SET_WEEK_PLAN"; templates: (Omit<WeekTemplate, "id" | "rank"> & { id?: string; rank?: string })[]; weekday?: number; urgent?: boolean }
  // §4.4 START_WEEK — explicit week rollover; marks the boundary + First Weekday
  // + OFF days. Daily SOD injection does the instantiating (three realities:
  // planned / no-plan-yet / no-plan-ever all just start).
  | { type: "START_WEEK"; firstWeekday?: number; offDays?: number[]; startedAt?: Min }
  // §4.5 START_OFF_PERIOD — begin an Inviolable running block on the spine.
  // Known end → countdown [now, knownEnd]; unknown → open stopwatch. Pauses any
  // current runner (remainder survives); plan tasks push below (displaced-tasks
  // perish/carry is a UI choice via CANCEL_TASK). Books to the Off-Periods head.
  | { type: "START_OFF_PERIOD"; title?: string; knownEnd?: Min }
  // §4.5 END_OFF_PERIOD — complete the running off-period (no-op otherwise).
  | { type: "END_OFF_PERIOD" };

export interface RunningView {
  mode: TimerMode;
  elapsedWall: Dur;
  remaining: Dur; // clamped ≥ 0 (overrun shows 0)
  overrun: boolean;
  projectedEnd: Min; // countdown: now + remaining; stopwatch: now
}
