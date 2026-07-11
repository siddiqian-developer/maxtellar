/**
 * Pipeline — the control surface (SPEC VI): Running + unstarted only, uniform
 * cards, gaps as subtle spacing. Start/Pause/Complete/Cancel sync to the
 * timeline unconditionally (one spine, two projections).
 */

import type { Event, State, UnstartedTask } from "@timekeeper/core";
import { runningView } from "@timekeeper/core";
import { fmtAbs, fmtDur } from "../time";
import { useSettings } from "../settings";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
}

export function Pipeline({ state, dispatch }: Props): JSX.Element {
  const rv = runningView(state);
  const { timeFormat, devSandbox } = useSettings();
  const hour12 = timeFormat === "12h";
  // Dev sandbox: fast-forward logical `now` (batch TICK). Wall-clock ticks
  // resume once real time catches up — testing affordance only.
  const speedUp = (mins: number): void => {
    dispatch({ type: "TICK", to: state.now + mins });
  };

  return (
    <div className="pipeline">
      <h2>Now</h2>
      {state.running && rv ? (
        <div className="card running">
          <div className="row">
            <span className="title">▶ {state.running.title}</span>
            <span className="badge">{rv.mode}</span>
          </div>
          <div className="meta num">
            {rv.mode === "countdown" ? (
              <>
                remaining {fmtDur(rv.remaining)}
                {rv.overrun && " · OVERRUN"}
              </>
            ) : (
              <>elapsed {fmtDur(rv.elapsedWall)}</>
            )}
          </div>
          <div className="actions">
            <button onClick={() => dispatch({ type: "PAUSE_RUNNING" })}>Pause</button>
            <button className="primary" onClick={() => dispatch({ type: "COMPLETE_RUNNING" })}>
              Complete
            </button>
            {devSandbox && (
              <>
                <button className="dev-speed" onClick={() => speedUp(5)} data-tip="Dev sandbox: fast-forward 5 min">⏩ +5m</button>
                <button className="dev-speed" onClick={() => speedUp(15)} data-tip="Dev sandbox: fast-forward 15 min">⏩ +15m</button>
              </>
            )}
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
        const first = placement?.parts[0];
        return (
          <div key={t.id} className="card">
            <div className="row">
              <span className="title">{t.title}</span>
              <span className="badge" data-timing={t.timing}>{t.timing}</span>
              {t.ommf && <span className="badge">ommf</span>}
            </div>
            <div className="meta num">
              {t.budget !== undefined ? (
                <>{fmtDur(t.budget)} · </>
              ) : (
                <>open · </>
              )}
              {first ? fmtAbs(first.start, { now: state.now, hour12 }) : "unplaced"}
              {placement && placement.parts.length > 1 && ` · ${placement.parts.length} parts`}
              {placement && placement.squeezedDeficit > 0 && ` · squeezed ${placement.squeezedDeficit}m`}
            </div>
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
