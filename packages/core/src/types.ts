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
  /** §2.9 wearable provision — schema only in MVP, no behavior. Where a Sleep/
   * Nap task's timing came from: `manual` (typed) or `wearable` (a pluggable
   * source). Detected sleep only ever PROPOSES; it never auto-commits. */
  sleepSource?: "manual" | "wearable";
  /** §3.7 per-task MIN_FRAGMENT override provision — schema only in MVP, no UI.
   * When set, this task's own fragment floor (≥ the global MIN_FRAGMENT); absent
   * = use the global floor. The global setting governs everything today. */
  minFragment?: Dur;
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

/** §5.2 pomodoro preset — work / break / long-break lengths + how many WORK
 * intervals precede a long break (25/5 ×4 + 15 by default). */
export interface PomodoroConfig {
  workMin: Dur;
  breakMin: Dur;
  longBreakMin: Dur;
  cyclesBeforeLong: number;
}
export type PomodoroPhase = "work" | "break" | "longBreak";
/** Live pomodoro state on a RunningTask (present only when started as one). */
export interface PomodoroState {
  config: PomodoroConfig;
  phase: PomodoroPhase;
  /** the current phase's target length: config length + any POMODORO_EXTEND. */
  phaseLen: Dur;
  /** epoch minute the current phase began (drives elapsed + overshoot split). */
  phaseStartedAt: Min;
  /** completed WORK intervals in this set (drives the long break). */
  cycle: number;
}

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
  /** §5.2: live pomodoro state, present only when the task was started as a
   * pomodoro. Absent = an ordinary run (all minutes → spent). */
  pomodoro?: PomodoroState;
}

/** §4.4/§4.6: the schedulable shape shared by a recurring template and a dated
 * one-off. Anchored coordinates are MINUTES-INTO-THE-DAY [0,1440) (a "9am
 * meeting"), converted to an absolute epoch for the target day at injection. */
export interface TaskSpec {
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
}

/** §4.4 one-time/ranged template validity (ruled in-scope 2026-07-16). Absent =
 * recurs on its weekday set forever.
 *  - `once`   → fires on its next matching-weekday occurrence, then RETIRES
 *    (`firedOn` = the day-midnight it fired; set at injection, never fires again;
 *    the retired template stays listed, marked, until deleted).
 *  - `ranged` → the weekday set fires only within [`from`, `to`] (inclusive
 *    local-midnight epoch-minutes; either edge may be open). */
export type TemplateValidity =
  | { kind: "once"; firedOn?: Min }
  | { kind: "ranged"; from?: Min; to?: Min };

/** §4.4 weekly planning (G19). A reusable task template that SOD injection
 * instantiates onto matching weekdays. Recurrence = the weekday set it fires on. */
export interface WeekTemplate extends TaskSpec {
  id: string;
  /** Recurrence: weekdays it instantiates on (0=Sun … 6=Sat). daily = all 7,
   * weekend = [0,6]. */
  weekdays: number[];
  /** §4.4: one-time/ranged bound on when the weekday set fires (absent = always). */
  validity?: TemplateValidity;
  /** LexoRank among templates — injection preserves this relative order. */
  rank: string;
}

/** §4.6 dated overrides (G28): a one-off task pinned to a specific calendar date
 * (not a weekday recurrence). Injected at that date's SOD, ranked below the
 * day's surviving leftovers and its recurring templates. */
export interface DatedTask extends TaskSpec {
  id: string;
  /** LexoRank among a date's adds — injection preserves this relative order. */
  rank: string;
}

/** §4.6: a per-date tweak to a recurring template — move its anchor and/or
 * resize its budget on this date only. Undefined fields inherit the template. */
export interface TemplateOverride {
  templateId: string;
  anchorStartTod?: number;
  anchorEndTod?: number;
  budget?: Dur;
}

/** §4.6 the dated override layer for one calendar date. `date` is that date's
 * LOCAL-MIDNIGHT epoch-minute (web-computed; core stays Date-free), the same key
 * SOD injection uses. An entry with empty adds/skips/overrides is dropped. */
export interface DatedEntry {
  date: Min;
  /** Extra one-off tasks that fire only on this date. */
  adds: DatedTask[];
  /** templateIds whose recurring injection is suppressed on this date. */
  skips: string[];
  /** Per-template anchor/budget tweaks applied on this date. */
  overrides: TemplateOverride[];
}

/** §4.4: the week commitment. `templates` is the structural plan; `startedAt`
 * marks the current week's rollover (START_WEEK); `firstWeekday` is the declared
 * First Weekday; `offDays` are the planning/OFF weekdays (default Sunday) that
 * also open the mid-week planning lock (§4.4) AND skip recurring injection. */
export interface WeekPlan {
  startedAt: Min | null;
  firstWeekday: number | null;
  offDays: number[];
  templates: WeekTemplate[];
  /** §11.4: Sleep — the head of the day. One global absolute value, part of
   * every day's 24h sum, edited from Weekly Planning AND Settings (synced —
   * this field is the single source of truth). */
  sleepMinutes: Dur;
  /** §11 head budgets (the reusable weekly shape). Array order IS the fill
   * rank (§11.5) — reorder = reorder the array. */
  budgets: import("./budget.js").HeadBudget[];
  /** §11.6 explicit per-Category targets (hard fits). Absent key = roll-up only. */
  categoryTargets: Record<string, Dur>;
  /** §5.1 redistribution ledger for THIS week instance (never mutates
   * `budgets`); reset at START_WEEK. */
  quotaAdjust: import("./budget.js").QuotaAdjustment[];
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
  /** §4.6: the dated override layer — one entry per calendar date that has any
   * add/skip/override. SOD injection consults the entry for the injection date.
   * Future dates are PARKED here until their own SOD (open-item 11). */
  dated: DatedEntry[];
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
  | { type: "START_TASK"; taskId: string; pomodoro?: PomodoroConfig }
  | { type: "PAUSE_RUNNING" }
  | { type: "COMPLETE_RUNNING" }
  | { type: "POMODORO_BREAK" } // §5.2 work-end tap: Take break (→ break/longBreak)
  | { type: "POMODORO_RESUME" } // §5.2 break-end tap: Resume work
  | { type: "POMODORO_EXTEND"; minutes: Dur } // §5.2 keep working / extend break +N
  | { type: "CANCEL_TASK"; taskId: string }
  // §3.11/§3.13 drag-to-reorder: recompute `taskId`'s LexoRank so it sits
  // immediately AFTER the plan item `afterId` (null/omitted = move to the front,
  // before the first item). The between-key is infinite-insertable (rank.ts);
  // list position IS priority (E4), so a resettle re-lays-out by the new order.
  | { type: "RERANK"; taskId: string; afterId?: string | null }
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
  | {
      type: "PRUNING_DONE";
      discardIds?: string[];
      inject?: { midnight: Min; weekday: number };
      /** §5.1 Stage 6: per-head trims of today's (post-redistribution) weekly
       * share, applied AFTER redistribution and BEFORE injection. `shareMinutes`
       * is the kept share; the cut becomes a sticky visible deficit. */
      quotaTrims?: { headId: string; shareMinutes: Min }[];
    }
  // §4.2 step 4 → 5: Planning Done → ceremony = null (Live).
  | { type: "PLANNING_DONE" }
  // §4.4 SET_WEEK_PLAN — replace the structural template set. LOCKED mid-week
  // (the week is a commitment): accepted only before the first week starts, on
  // an OFF day, or with the `urgent` bypass; otherwise a no-op.
  | { type: "SET_WEEK_PLAN"; templates: (Omit<WeekTemplate, "id" | "rank"> & { id?: string; rank?: string })[]; weekday?: number; urgent?: boolean }
  // §4.6 SET_DATED — replace the whole override entry for one calendar `date`
  // (local-midnight epoch-minute). Adds may omit id/rank (assigned in order).
  // An entry that ends up empty (no adds/skips/overrides) is dropped. Dated
  // edits are always allowed (a specific future date is never "locked").
  | { type: "SET_DATED"; date: Min; adds: (Omit<DatedTask, "id" | "rank"> & { id?: string; rank?: string })[]; skips: string[]; overrides: TemplateOverride[] }
  // §4.4 START_WEEK — explicit week rollover; marks the boundary + First Weekday
  // + OFF days. Daily SOD injection does the instantiating (three realities:
  // planned / no-plan-yet / no-plan-ever all just start).
  | { type: "START_WEEK"; firstWeekday?: number; offDays?: number[]; startedAt?: Min }
  /**
   * §4.4a: edit the OFF-day set (and the §4.4b First Weekday it implies) WITHOUT
   * rolling the week over. `START_WEEK` marks a week boundary — it resets
   * `startedAt` (the week WINDOW read by weekly quotas + Analytics) and clears the
   * §5.1 `quotaAdjust` ledger. Reusing it to toggle an OFF day silently restarted
   * the week and threw the ledger away; this event exists so that can't happen.
   */
  | { type: "SET_OFF_DAYS"; offDays: number[]; firstWeekday?: number }
  // §4.5 START_OFF_PERIOD — begin an Inviolable running block on the spine.
  // Known end → countdown [now, knownEnd]; unknown → open stopwatch. Pauses any
  // current runner (remainder survives); plan tasks push below (displaced-tasks
  // perish/carry is a UI choice via CANCEL_TASK). Books to the Off-Periods head.
  | { type: "START_OFF_PERIOD"; title?: string; knownEnd?: Min }
  // §4.5 END_OFF_PERIOD — complete the running off-period (no-op otherwise).
  | { type: "END_OFF_PERIOD" }
  // §11 SET_BUDGETS — replace the head-budget set (+ explicit Category targets).
  // Same mid-week lock as SET_WEEK_PLAN (structural planning). Invalid percent
  // entries (non-Core-Work or Self-Management) are coerced to absolute.
  | { type: "SET_BUDGETS"; budgets: import("./budget.js").HeadBudget[]; categoryTargets?: Record<string, Dur>; weekday?: number; urgent?: boolean }
  // §11.4 SET_SLEEP_BUDGET — the one global Sleep value (Settings-grade: always
  // allowed, from either surface). Clamped to [0, 1440].
  | { type: "SET_SLEEP_BUDGET"; minutes: Dur };

export interface RunningView {
  mode: TimerMode;
  elapsedWall: Dur;
  remaining: Dur; // clamped ≥ 0 (overrun shows 0)
  overrun: boolean;
  projectedEnd: Min; // countdown: now + remaining; stopwatch: now
}
