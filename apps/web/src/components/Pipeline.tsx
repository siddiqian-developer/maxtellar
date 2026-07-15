/**
 * Pipeline — the control surface (SPEC VI): Running + unstarted only, uniform
 * cards, gaps as subtle spacing. Start/Pause/Complete/Cancel sync to the
 * timeline unconditionally (one spine, two projections).
 *
 * Card anatomy per SPEC VI "card anatomy" (2026-07-12): state-hued left bar;
 * one header row — index badge (+ live dot on running), title, neutral head
 * badge, status capsule (CATEGORY • SUBSTATE) right-pinned; a single-row
 * read-only labelled fields strip (a paused remainder's first field is
 * Restart, not Start); quiet wasted pill; compact semantic footer actions.
 * All read-only — editing stays in the drawer/fork, never inline on the card.
 */

import type { Dur, Event, Min, State, TimingType, UnstartedTask } from "@maxtellar/core";
import { runningView } from "@maxtellar/core";
import { fmtAbs, fmtDur } from "../time";
import { useSettings } from "../settings";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
}

/** Padlock on a non-slideable card (2026-07-13): neutral, text-sized, sits
 * right after the title. Absence = slideable — only the immovable is marked. */
function LockIcon(): JSX.Element {
  return (
    <svg
      className="lock-icon"
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Not slideable"
    >
      <title>Not slideable</title>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Substate label + hue key for an unstarted task's timing type. */
const TIMING_LABEL: Record<TimingType, string> = {
  fixed: "Fixed",
  "semi-head": "Semi-head",
  "semi-tail": "Semi-tail",
  budgeted: "Budgeted",
  unscheduled: "Unscheduled",
};

const TIMING_HUE: Record<TimingType, string> = {
  fixed: "fixed",
  "semi-head": "semi",
  "semi-tail": "semi",
  budgeted: "budgeted",
  unscheduled: "unscheduled",
};

/** A paused remainder's prior segments: history occupancy entries whose taskId
 * follows the reducer's pause lineage — each pause appends "-rem" to the id
 * (X → X-rem → X-rem-rem), so stripping suffixes walks back to the origin. */
function pauseLineage(remainderOf: string): string[] {
  const ids: string[] = [];
  let cur: string | undefined = remainderOf;
  while (cur !== undefined) {
    ids.push(cur);
    cur = cur.endsWith("-rem") ? cur.slice(0, -4) : undefined;
  }
  return ids;
}

/** Spent so far + the pause moment (last segment's end) for a remainder. */
function lineageTotals(state: State, remainderOf: string): { spent: Dur; pausedAt: Min } {
  const ids = new Set(pauseLineage(remainderOf));
  let spent = 0;
  let pausedAt = 0;
  for (const h of state.history) {
    if (h.kind !== "occupancy" || h.taskId === null || !ids.has(h.taskId)) continue;
    spent += h.channels.spent;
    if (h.end > pausedAt) pausedAt = h.end;
  }
  return { spent, pausedAt };
}

/** Lifecycle-only capsule: `Started • Running/Overrun/Paused`, or single-segment
 * `Unstarted` (no substate — the timing type has its own pill on every card). */
function Capsule({ category, substate, hue }: { category: string; substate?: string | undefined; hue: string }): JSX.Element {
  return (
    <span className="state-capsule" data-hue={hue}>
      <span className="cap-cat">{category}</span>
      {substate !== undefined && (
        <>
          <span className="cap-dot">•</span>
          <span className="cap-sub">{substate}</span>
        </>
      )}
    </span>
  );
}

function Field({ label, value, floating }: { label: string; value: string | null; floating?: boolean }): JSX.Element {
  return (
    <div className="cf-group">
      <span className="cf-label">{label}</span>
      {value === null ? (
        <span className="cf-value cf-empty">—</span>
      ) : (
        <span className={`cf-value num${floating ? " cf-floating" : ""}`}>
          {floating && "~"}
          {value}
        </span>
      )}
    </div>
  );
}

export function Pipeline({ state, dispatch }: Props): JSX.Element {
  const rv = runningView(state);
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const abs = (m: Min): string => fmtAbs(m, { now: state.now, hour12 });

  // Pipeline index: the running card is #1; unstarted cards continue from
  // there in display (time) order. Gaps don't consume a number.
  let idx = state.running ? 1 : 0;

  return (
    <div className="pipeline">
      <h2>Now</h2>
      {state.running && rv ? (
        <div className="card running" data-state={rv.overrun ? "overrun" : "running"}>
          <div className="row">
            <span className="pipe-idx num">
              <span className={`live-dot${rv.overrun ? " overrun" : ""}`} aria-label="Task is live" />
              #1
            </span>
            <span className="title">{state.running.title}</span>
            <span className="badge head-badge">
              {state.running.headId}
              {state.running.activityId && ` · ${state.running.activityId}`}
            </span>
            {state.running.ommf && <span className="badge">ommf</span>}
            <span className="badge" data-timing={state.running.timing}>
              {TIMING_LABEL[state.running.timing]}
            </span>
            <Capsule
              category="Started"
              substate={rv.overrun ? "Overrun" : "Running"}
              hue={rv.overrun ? "overrun" : "running"}
            />
          </div>
          <div className="card-fields">
            <Field label="Started" value={abs(state.running.startedAt)} />
            {rv.mode === "countdown" ? (
              <>
                {/* Upright/~ is a property of the COORDINATE, not lifecycle:
                    a fixed/semi-tail runner's end is its anchor — an exact
                    fact (in overrun it rides `now`, still exact). Only a
                    budgeted runner's projected end is a presumption. */}
                <Field
                  label="Ends"
                  value={abs(rv.projectedEnd)}
                  floating={
                    state.running.timing !== "fixed" && state.running.timing !== "semi-tail"
                  }
                />
                <Field label="Budget" value={fmtDur(state.running.budget ?? 0)} />
                <Field label="Spent" value={fmtDur(state.running.channels.spent)} />
                <Field label="Remaining" value={fmtDur(rv.remaining)} />
              </>
            ) : (
              <>
                {/* open/stopwatch: the tail rides `now` — Spent IS the meter */}
                <Field label="Ends" value={null} />
                <Field label="Budget" value="open" />
                <Field label="Spent" value={fmtDur(state.running.channels.spent)} />
                <Field label="Remaining" value={null} />
              </>
            )}
          </div>
          <div className="actions">
            {state.running.channels.wasted > 0 && (
              <span className="wasted-badge">
                Wasted <strong className="num">{fmtDur(state.running.channels.wasted)}</strong>
              </span>
            )}
            <button onClick={() => dispatch({ type: "PAUSE_RUNNING" })}>Pause</button>
            <button className="primary" onClick={() => dispatch({ type: "COMPLETE_RUNNING" })}>
              Complete
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <span className="meta">nothing running — start a task below</span>
        </div>
      )}

      <h2>Up next</h2>
      {/* Cards follow TIME order (first placed part), mirroring the timeline —
          not raw rank order: anchored tasks can be placed earlier in time than
          higher-priority floats. Unplaced items sink to the end in rank order. */}
      {[...state.plan]
        .sort((a, b) => {
          const sa = state.placements.find((p) => p.itemId === a.id)?.parts[0]?.start;
          const sb = state.placements.find((p) => p.itemId === b.id)?.parts[0]?.start;
          if (sa === undefined && sb === undefined) return 0; // keep rank order
          if (sa === undefined) return 1;
          if (sb === undefined) return -1;
          return sa - sb;
        })
        .map((item) => {
          if (item.kind === "gap") return <div key={item.id} className="gap-spacer" title={`buffer ${item.budget}m`} />;
          const t = item as UnstartedTask;
          const placement = state.placements.find((p) => p.itemId === t.id);
          const parts = placement?.parts ?? [];
          const first = parts[0];
          const last = parts[parts.length - 1];
          const isRemainder = t.remainderOf !== undefined;
          idx += 1;

          // Edge language mirrors the timeline: an anchored coordinate reads
          // upright; a scheduler-placed (presumed, will-reflow) one ~italic.
          // A riding (slid) task needs no special case: slide MOVES the anchor
          // (G28), so anchorEnd is always the live, exact value.
          const start = t.anchorStart ?? first?.start;
          const end = t.anchorEnd ?? last?.end;

          // Spent/Remaining on every card: a fresh task has spent 00:00 and its
          // whole budget remaining; a remainder's spent sums its prior segments,
          // and its Budget reads as the ORIGINAL total (spent + remaining) so
          // `remaining = budget − spent` holds on every card alike.
          const totals = isRemainder ? lineageTotals(state, t.remainderOf as string) : null;
          const spent = totals ? totals.spent : 0;
          const originalBudget =
            t.budget !== undefined ? t.budget + spent : undefined;

          return (
            <div key={t.id} className="card" data-state={TIMING_HUE[t.timing]}>
              <div className="row">
                <span className="pipe-idx num">#{idx}</span>
                <span className="title">{t.title}</span>
                {!t.slideable && <LockIcon />}
                <span className="badge head-badge">
                  {t.headId}
                  {t.activityId && ` · ${t.activityId}`}
                </span>
                {t.ommf && <span className="badge">ommf</span>}
                <span className="badge" data-timing={t.timing}>{TIMING_LABEL[t.timing]}</span>
                {/* Paused is never Unstarted — the remainder continues begun work */}
                <Capsule
                  category={isRemainder ? "Started" : "Unstarted"}
                  substate={isRemainder ? "Paused" : undefined}
                  hue={isRemainder ? "paused" : TIMING_HUE[t.timing]}
                />
              </div>
              <div className="card-fields">
                {/* A paused remainder has no "start" — its first field is the
                    RESTART moment (scheduler-placed resume; ~italic unless
                    anchored). The old "Resumes at" pill was redundant with it. */}
                <Field
                  label={isRemainder ? "Restart" : "Start"}
                  value={start !== undefined ? abs(start) : null}
                  floating={start !== undefined && t.anchorStart === undefined}
                />
                <Field
                  label="End"
                  value={end !== undefined ? abs(end) : null}
                  floating={end !== undefined && t.anchorEnd === undefined}
                />
                <Field label="Budget" value={originalBudget !== undefined ? fmtDur(originalBudget) : "open"} />
                <Field label="Spent" value={fmtDur(spent)} />
                <Field label="Remaining" value={t.budget !== undefined ? fmtDur(t.budget) : null} />
                {totals && totals.pausedAt > 0 && (
                  <Field label="Paused" value={fmtDur(Math.max(0, state.now - totals.pausedAt))} />
                )}
              </div>
              {(first === undefined || parts.length > 1 || (placement && placement.squeezedDeficit > 0)) && (
                <div className="meta num">
                  {first === undefined && "unplaced"}
                  {parts.length > 1 && `${parts.length} parts`}
                  {placement && placement.squeezedDeficit > 0 &&
                    `${parts.length > 1 ? " · " : ""}squeezed ${placement.squeezedDeficit}m`}
                </div>
              )}
              <div className="actions">
                <button className="primary" onClick={() => dispatch({ type: "START_TASK", taskId: t.id })}>
                  Start
                </button>
                <button className="cancel-accent" onClick={() => dispatch({ type: "CANCEL_TASK", taskId: t.id })}>Cancel</button>
              </div>
            </div>
          );
        })}
    </div>
  );
}
