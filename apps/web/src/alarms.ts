/**
 * §5.3 Alarms — a PURE, derived watcher (no core changes, no events). Given the
 * current state it returns the set of active alarm conditions with stable keys;
 * the useAlarms hook diffs these against what's already fired to decide what to
 * sound/notify. Best-effort presentation (sound + Notification + in-app banner)
 * lives in the hook — this file is just the signal derivation, so it unit-tests
 * without a DOM.
 *
 * A stable `key` per instance is the contract: one-shot mode fires a key once;
 * persist mode keeps it active until the key disappears (condition clears) or
 * the user dismisses it.
 */
import type { State } from "@maxtellar/core";
import {
  budgetEntries,
  pomodoroView,
  runningView,
  sodPrecondition,
} from "@maxtellar/core";

export type AlarmKind =
  | "pomodoro"
  | "overrun"
  | "fixedApproaching"
  | "startArrived"
  | "atMostQuota"
  | "sodReminder";

export interface AlarmSignal {
  kind: AlarmKind;
  /** stable per instance — one-shot fires once, persist tracks until it clears. */
  key: string;
  title: string;
  body: string;
  /** overrun / at-most / arrived — the "you should act" alarms that persist mode
   * keeps ringing; the rest are gentle one-offs even under persist. */
  urgent: boolean;
}

export interface AlarmOptions {
  /** minutes ahead of an anchored start that counts as "approaching". */
  approachingMin: number;
}

const DAY = 1440;

/** Minutes of [s,e) that fall within [ws,we). */
const overlap = (s: number, e: number, ws: number, we: number): number =>
  Math.max(0, Math.min(e, we) - Math.max(s, ws));

/** The alarm conditions currently active for `state`. Pure + deterministic. */
export function alarmSignals(state: State, opts: AlarmOptions = { approachingMin: 5 }): AlarmSignal[] {
  const out: AlarmSignal[] = [];
  const now = state.now;

  // 1. Pomodoro phase due (interval elapsed → decide).
  const pv = pomodoroView(state);
  if (pv?.due && state.running) {
    const work = pv.phase === "work";
    out.push({
      kind: "pomodoro",
      key: `pomo:${state.running.pomodoro!.phaseStartedAt}`,
      title: work ? "Work interval done 🍅" : `${pv.phase === "longBreak" ? "Long break" : "Break"} over`,
      body: work ? "Take a break or keep working." : "Resume work or extend the break.",
      urgent: false,
    });
  }

  // 2. Running task over budget.
  const rv = runningView(state);
  if (rv?.overrun && state.running) {
    out.push({
      kind: "overrun",
      key: `overrun:${state.running.id}`,
      title: "Over budget",
      body: `“${state.running.title}” has passed its budget.`,
      urgent: true,
    });
  }

  // 3/4. Anchored starts — arrived (start ≤ now, still unstarted) or approaching.
  for (const it of state.plan) {
    if (it.kind !== "task") continue;
    const start = it.anchorStart;
    if (start === undefined) continue;
    if (start <= now) {
      out.push({
        kind: "startArrived",
        key: `arrived:${it.id}`,
        title: "Start time reached",
        body: `“${it.title}” was due to start — start it or reschedule.`,
        urgent: true,
      });
    } else if (start - now <= opts.approachingMin) {
      out.push({
        kind: "fixedApproaching",
        key: `approach:${it.id}:${start}`,
        title: "Starting soon",
        body: `“${it.title}” starts in ${start - now} min.`,
        urgent: false,
      });
    }
  }

  // 5. At-most weekly quota exceeded (warn, never block — §5.1/§5.3).
  const winStart = state.week.startedAt ?? now - 6 * DAY;
  for (const b of budgetEntries(state.week)) {
    if (b.kind !== "weekly" || (b.quotaType ?? "atLeast") !== "atMost") continue;
    const quota = b.quotaMinutes ?? 0;
    const achieved =
      state.history
        .filter((h) => h.kind === "occupancy" && h.headId === b.headId)
        .reduce((a, h) => a + overlap(h.start, h.end, winStart, now), 0) +
      (state.running?.headId === b.headId ? overlap(state.running.startedAt, now, winStart, now) : 0);
    if (achieved > quota) {
      out.push({
        kind: "atMostQuota",
        key: `atmost:${b.headId}:${winStart}`,
        title: "At-most quota exceeded",
        body: `“${b.headId}” is over its weekly ceiling by ${achieved - quota} min.`,
        urgent: true,
      });
    }
  }

  // 6. SOD is ready to run (two finished sleeps bound a day) but hasn't been.
  const pre = sodPrecondition(state);
  if (pre.ok && pre.sleepB && !state.ceremony) {
    out.push({
      kind: "sodReminder",
      key: `sod:${pre.sleepB.start}`,
      title: "Ready to start the day",
      body: "Two sleeps bound yesterday — run Start of Day to sweep and plan.",
      urgent: false,
    });
  }

  return out;
}
