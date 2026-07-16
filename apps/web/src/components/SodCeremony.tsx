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
import {
  LOST_HOURS,
  budgetEntries,
  deadLeftovers,
  quotaAdjustmentsAtSod,
  sodPrecondition,
  unaccountedGaps,
  weeklyShare,
} from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { useSettings } from "../settings";
import { dayStartMin } from "../casualTime";
import { fmtDayTime, fmtDur, fmtDurUnits, toDate } from "../time";
import { DurInput } from "./BudgetPanel";
import { SnapToast, useSnapToast } from "../SnapToast";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  onClose: () => void;
  /** Open the New Task drawer (planning step ad-hoc adds). */
  onAddTask: () => void;
}

export function SodCeremony({ state, dispatch, onClose, onAddTask }: Props): JSX.Element {
  useEscClose(onClose);
  const { timeFormat, showWeekday } = useSettings();
  const hour12 = timeFormat === "12h";
  const now = state.now;
  const fmtT = (m: number): string => fmtDayTime(m, now, hour12, showWeekday);

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

  // §5.1 Stage 6 — quota trims. Preview today's weekly shares WITH the pending
  // SOD redistribution folded in (the same ledger PRUNING_DONE will append),
  // so the number the user trims against is the number the reducer will cut.
  const midnight = dayStartMin(now);
  const weekday = toDate(now).getDay();
  const pending = state.week.startedAt !== null ? quotaAdjustmentsAtSod(state, midnight, weekday) : { adjust: [], notes: [] };
  const previewWeek = { ...state.week, quotaAdjust: [...state.week.quotaAdjust, ...pending.adjust] };
  const baseEntries = budgetEntries({ ...state.week, quotaAdjust: [] });
  const trimRows =
    state.week.startedAt === null || state.week.offDays.includes(weekday)
      ? []
      : budgetEntries(previewWeek)
          // at-least/exact only (§5.1): at-most never accumulates, so there is
          // no monster to trim — a ceiling never shows a trim row.
          .filter((b) => b.kind === "weekly" && b.weekdays.includes(weekday) && (b.quotaType ?? "atLeast") !== "atMost")
          .map((b) => {
            const base = weeklyShare(baseEntries.find((e) => e.headId === b.headId) ?? b, weekday);
            return { headId: b.headId, base, eff: weeklyShare(b, weekday) };
          })
          .filter((r) => r.eff > 0);
  const [trims, setTrims] = useState<Record<string, number>>({});
  const { toast, notify: showToast } = useSnapToast();
  // Bumped on every snap so the input remounts and reformats to the snapped
  // value even when the KEPT share didn't change (snap-at-entry: the field
  // must never keep displaying a rejected entry).
  const [snapSeq, setSnapSeq] = useState(0);
  const notify = (text: string): void => {
    showToast(text);
    setSnapSeq((n) => n + 1);
  };
  // Snap-at-entry: a trim can only REDUCE today's share — over-entry snaps
  // back to the effective share (with the notify naming head + rule); an
  // entry equal to the share clears the trim.
  const setTrim = (headId: string, eff: number, m: number | null): void => {
    if (m === null) return;
    let v = Math.max(0, Math.round(m));
    if (v > eff) {
      v = eff;
      notify(`Snapped ${headId} to ${fmtDurUnits(eff)} — a Pruning trim can only reduce today's share (§5.1)`);
    }
    setTrims((t) => {
      const next = { ...t };
      if (v >= eff) delete next[headId];
      else next[headId] = v;
      return next;
    });
  };

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
            {trimRows.length > 0 && (
              <div className="config-subsection">
                <h4>Weekly quotas today</h4>
                <p className="field-desc">
                  Today's shares, redistribution included. Trim a monster accumulation down to what
                  you'll actually do — the cut stays visible as <strong>deficit</strong> until
                  week's end (§5.1); it never redistributes again.
                </p>
                <ul className="sod-leftovers">
                  {trimRows.map(({ headId, base, eff }) => {
                    const kept = trims[headId] ?? eff;
                    return (
                      <li key={headId} className="sod-leftover">
                        <span className="badge head-badge">{headId}</span>
                        <span className="sl-title num">
                          {fmtDurUnits(eff)}
                          {eff > base && (
                            <span className="ledger-note" data-tip={`Base share ${fmtDurUnits(base)} + ${fmtDurUnits(eff - base)} redistributed from earlier days (§5.1)`}>
                              {" "}· +{fmtDurUnits(eff - base)} carried in
                            </span>
                          )}
                        </span>
                        <DurInput
                          key={`${headId}:${snapSeq}`}
                          value={kept}
                          onCommit={(m) => setTrim(headId, eff, m)}
                          ariaLabel={`Keep today's ${headId} share`}
                        />
                        {kept < eff && (
                          <span className="outcome-pill" data-outcome="skipped" data-tip="The trimmed share stays reported as deficit until week's end — nothing carries over (§5.1)">
                            −{fmtDurUnits(eff - kept)} deficit stays
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
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
                    inject: { midnight, weekday },
                    // §5.1 Stage 6: kept shares for trimmed heads (post-
                    // redistribution; the reducer re-derives and clamps).
                    quotaTrims: Object.entries(trims).map(([headId, shareMinutes]) => ({ headId, shareMinutes })),
                  })
                }
              >
                Done pruning
              </button>
              <span style={{ flex: 1 }} />
            </div>
            <SnapToast text={toast} />
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
