/**
 * SOD — the Start-of-Day commit ceremony (§4.2), a guided flow driven by
 * `state.ceremony.phase` (so a mid-ceremony reload resumes at the right step):
 *
 *   sweep    → preview the day being swept [Sleep A … Sleep B) + the Lost Hours
 *              about to be booked; "Sweep & continue" dispatches SOD.
 *   pruning  → review surviving leftovers: expired ones are auto-discarded;
 *              the rest get per-item Keep/Discard + Discard-all / Carry-all;
 *              "Done pruning" dispatches PRUNING_DONE { discardIds }.
 *   planning → injected weekly plan preview (empty until Stage 5) + carried
 *              leftovers; add ad-hoc tasks; "Go live" dispatches PLANNING_DONE.
 *
 * The "sweep" step is pre-dispatch (ceremony still null); the reducer no-ops SOD
 * unless the precondition holds, and the entry point (App) only opens this once
 * sodPrecondition is ok — otherwise it opens the missing-data GapFillModal.
 * Esc → back one level (closes the overlay; ceremony state persists and the SOD
 * button re-opens mid-ceremony).
 */
import { useState } from "react";
import type { Event, State, UnstartedTask } from "@maxtellar/core";
import { LOST_HOURS, deadLeftovers, sodPrecondition, unaccountedGaps } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { useSettings } from "../settings";
import { dayStartMin } from "../casualTime";
import { fmtDayTime, fmtDur, toDate } from "../time";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  onClose: () => void;
  /** Open the New Task drawer (planning step ad-hoc adds). */
  onAddTask: () => void;
}

export function SodCeremony({ state, dispatch, onClose, onAddTask }: Props): JSX.Element {
  useEscClose(onClose);
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const now = state.now;
  const fmtT = (m: number): string => fmtDayTime(m, now, hour12);

  const phase: "sweep" | "pruning" | "planning" = state.ceremony?.phase ?? "sweep";

  // Top-level unstarted leftovers (children ride with their parent bracket).
  const leftovers = state.plan.filter(
    (i): i is UnstartedTask => i.kind === "task" && !i.parentId,
  );
  const deadIds = new Set(deadLeftovers(state).map((t) => t.id));

  // Pruning selection: user-chosen discards among the non-expired leftovers.
  const [discard, setDiscard] = useState<Set<string>>(new Set());
  const toggle = (id: string): void =>
    setDiscard((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const prunable = leftovers.filter((t) => !deadIds.has(t.id));
  const carryAll = (): void => setDiscard(new Set());
  const discardAll = (): void => setDiscard(new Set(prunable.map((t) => t.id)));

  return (
    <div className="config-screen">
      <div className="config-header">
        <button className="theme-toggle" onClick={onClose} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>Start of Day</h2>
        <span style={{ flex: 1 }} />
        <ol className="sod-steps" aria-label="Ceremony steps">
          {(["sweep", "pruning", "planning"] as const).map((p, i) => (
            <li key={p} className={`sod-step${phase === p ? " active" : ""}${(["sweep", "pruning", "planning"] as const).indexOf(phase) > i ? " done" : ""}`}>
              {p === "sweep" ? "Sweep" : p === "pruning" ? "Prune" : "Plan"}
            </li>
          ))}
        </ol>
      </div>
      <div className="config-body">
        {phase === "sweep" && <SweepStep state={state} fmtT={fmtT} onSweep={() => dispatch({ type: "SOD", reportDate: dayStartMin(now) })} onClose={onClose} />}
        {phase === "pruning" && (
          <div className="config-section">
            <h3>Prune leftovers</h3>
            <p className="field-desc">
              Unstarted tasks survived the sweep. Expired ones are cleared automatically; keep or
              discard the rest, then commit.
            </p>
            {leftovers.length === 0 ? (
              <span className="config-empty">nothing left over — a clean slate</span>
            ) : (
              <>
                <div className="sod-bulk">
                  <button className="type-chip" data-status="budgeted" onClick={carryAll} disabled={discard.size === 0}>Carry all</button>
                  <button className="type-chip" data-status="fixed" onClick={discardAll} disabled={prunable.length > 0 && discard.size === prunable.length}>Discard all</button>
                </div>
                <ul className="sod-leftovers">
                  {leftovers.map((t) => {
                    const dead = deadIds.has(t.id);
                    const discarded = dead || discard.has(t.id);
                    return (
                      <li key={t.id} className={`sod-leftover${discarded ? " discarded" : ""}`}>
                        <span className="sl-title">{t.title}</span>
                        <span className="badge head-badge">{t.headId}{t.activityId && ` · ${t.activityId}`}</span>
                        {dead ? (
                          <span className="outcome-pill" data-outcome="skipped">expired — cleared</span>
                        ) : (
                          <button
                            className={`type-chip${discarded ? " active" : ""}`}
                            data-status={discarded ? "fixed" : "budgeted"}
                            onClick={() => toggle(t.id)}
                            aria-pressed={discarded}
                          >
                            {discarded ? "Discard" : "Keep"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="drawer-footer">
              <button
                className="primary"
                onClick={() =>
                  dispatch({
                    type: "PRUNING_DONE",
                    discardIds: [...discard],
                    // §4.4 injection: today's local-midnight + weekday for the
                    // weekly-plan instantiation (no-op if no week started).
                    inject: { midnight: dayStartMin(now), weekday: toDate(now).getDay() },
                  })
                }
              >
                Done pruning
              </button>
              <span style={{ flex: 1 }} />
            </div>
          </div>
        )}
        {phase === "planning" && (
          <div className="config-section">
            <h3>Plan today</h3>
            <p className="field-desc">
              Today's weekly-plan tasks have been injected below your carried-over leftovers. Add
              anything ad-hoc, then go live.
            </p>
            <div className="config-subsection">
              <h4>On today's list</h4>
              {leftovers.length === 0 ? (
                <span className="config-empty">nothing planned yet — add a task below</span>
              ) : (
                <ul className="sod-leftovers">
                  {leftovers.map((t) => (
                    <li key={t.id} className="sod-leftover">
                      <span className="sl-title">{t.title}</span>
                      <span className="badge head-badge">{t.headId}{t.activityId && ` · ${t.activityId}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="drawer-footer">
              <button className="primary" onClick={() => { dispatch({ type: "PLANNING_DONE" }); onClose(); }}>
                Go live
              </button>
              <button className="cancel-accent" onClick={onAddTask} data-tip="Add an ad-hoc task for today">+ Add task</button>
              <span style={{ flex: 1 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Step 1 — the sweep preview (pre-dispatch): the day boundary + Lost Hours. */
function SweepStep({
  state,
  fmtT,
  onSweep,
  onClose,
}: {
  state: State;
  fmtT: (m: number) => string;
  onSweep: () => void;
  onClose: () => void;
}): JSX.Element {
  const pre = sodPrecondition(state);
  if (!pre.ok || !pre.sleepA || !pre.sleepB) {
    return (
      <div className="config-section">
        <h3>Not ready to close the day</h3>
        <span className="config-empty">
          need two Finished Sleeps to bound a day — log the missing sleep first
        </span>
      </div>
    );
  }
  const winStart = pre.sleepA.start;
  const winEnd = pre.sleepB.start;
  const span = winEnd - winStart;
  const occ = state.history
    .filter((h) => h.kind === "occupancy" && h.end > h.start)
    .map((h) => ({ start: h.start, end: h.end }));
  const gaps = unaccountedGaps(occ, winStart, winEnd);
  const lostMin = gaps.reduce((a, g) => a + (g.end - g.start), 0);
  const accounted = span - lostMin;

  return (
    <div className="config-section">
      <h3>Sweep the day</h3>
      <p className="field-desc">
        This closes the sleep-cycle day from your first sleep to your latest. Its history is sealed;
        unaccounted time becomes <strong>Lost Hours</strong>. Unstarted tasks survive to the next
        step.
      </p>
      <div className="ledger-hero">
        <div className="stat">
          <span className="stat-label">Day span</span>
          <span className="stat-value num">{fmtDur(span)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Accounted</span>
          <span className="stat-value num">{fmtDur(accounted)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Lost</span>
          <span className={`stat-value num${lostMin > 0 ? " is-danger" : ""}`}>{fmtDur(lostMin)}</span>
        </div>
      </div>
      <p className="field-desc num">
        {fmtT(winStart)} → {fmtT(winEnd)}
      </p>
      {gaps.length > 0 && (
        <div className="config-subsection">
          <h4>Will be booked as Lost Hours</h4>
          <ul className="sod-leftovers">
            {gaps.map((g, i) => (
              <li key={i} className="sod-leftover">
                <span className="sl-title num">{fmtT(g.start)} – {fmtT(g.end)}</span>
                <span className="badge head-badge">{LOST_HOURS}</span>
                <span className="hr-dur num">{fmtDur(g.end - g.start)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="drawer-footer">
        <button className="primary" onClick={onSweep}>Sweep &amp; continue</button>
        <button className="cancel-accent" onClick={onClose}>Not now</button>
        <span style={{ flex: 1 }} />
      </div>
    </div>
  );
}
