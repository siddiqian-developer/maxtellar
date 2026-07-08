/**
 * Pipeline — the control surface (SPEC VI): Running + unstarted only, uniform
 * cards, gaps as subtle spacing. Start/Pause/Complete/Cancel sync to the
 * timeline unconditionally (one spine, two projections).
 */

import type { Event, State, UnstartedTask } from "@timekeeper/core";
import { runningView } from "@timekeeper/core";
import { fmtAbs, fmtDur } from "../time";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
}

export function Pipeline({ state, dispatch }: Props): JSX.Element {
  const rv = runningView(state);

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
          </div>
        </div>
      ) : (
        <div className="card">
          <span className="meta">nothing running — start a task below</span>
        </div>
      )}

      <h2>Up next</h2>
      {state.plan.map((item) => {
        if (item.kind === "gap") return <div key={item.id} className="gap-spacer" title={`buffer ${item.budget}m`} />;
        const t = item as UnstartedTask;
        const placement = state.placements.find((p) => p.itemId === t.id);
        const first = placement?.parts[0];
        return (
          <div key={t.id} className="card">
            <div className="row">
              <span className="title">{t.title}</span>
              <span className="badge">{t.timing}</span>
              {t.ommf && <span className="badge">ommf</span>}
            </div>
            <div className="meta num">
              {t.budget !== undefined && <>{fmtDur(t.budget)} · </>}
              {first ? fmtAbs(first.start, { now: state.now }) : "unplaced"}
              {placement && placement.parts.length > 1 && ` · ${placement.parts.length} parts`}
              {placement && placement.squeezedDeficit > 0 && ` · squeezed ${placement.squeezedDeficit}m`}
            </div>
            <div className="actions">
              <button className="primary" onClick={() => dispatch({ type: "START_TASK", taskId: t.id })}>
                Start
              </button>
              <button onClick={() => dispatch({ type: "CANCEL_TASK", taskId: t.id })}>Cancel</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
