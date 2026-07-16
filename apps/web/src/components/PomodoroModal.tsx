/**
 * §5.2 Pomodoro modal — the zero-automation decision point. Shown when the
 * running task is a pomodoro and its current phase is DUE (elapsed ≥ phaseLen,
 * from the pure `pomodoroView`). Work-end: Take break / Keep working +N / +1
 * pomodoro. Break-end: Resume work / Extend +N. Every button is an explicit
 * tap — the reducer never transitions on its own; while the modal is up (or
 * dismissed) the clock keeps running and books to managed (after work) or
 * wasted (after break), the honest mirror.
 *
 * Dismiss (Esc / "Not now" / backdrop) hides it for THIS phase only — keyed by
 * `phaseStartedAt`, so the next due phase re-raises it. Time keeps accruing
 * either way (the app never auto-pauses).
 */
import type { Event, State } from "@maxtellar/core";
import { pomodoroView } from "@maxtellar/core";
import { fmtDur } from "../time";
import { useEscClose } from "../useEscClose";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  /** Hide until the next phase (keyed on phaseStartedAt in App). */
  onDismiss: () => void;
}

export function PomodoroModal({ state, dispatch, onDismiss }: Props): JSX.Element {
  useEscClose(onDismiss);
  const pv = pomodoroView(state)!; // parent only mounts this when due
  const isWork = pv.phase === "work";
  const workMin = state.running!.pomodoro!.config.workMin;
  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="drawer pomo-modal" role="dialog" aria-modal="true" aria-labelledby="pomo-title">
        <div className="drawer-header">
          <h2 id="pomo-title">{isWork ? "Work interval done 🍅" : `${pv.phase === "longBreak" ? "Long break" : "Break"} over`}</h2>
          <button className="drawer-close" aria-label="Not now" onClick={onDismiss}>&times;</button>
        </div>
        <div className="drawer-body">
          <p className="field-desc">
            {isWork
              ? <>You've hit <strong>{fmtDur(pv.phaseLen)}</strong> of focus (interval {pv.cycle + 1}). Take a break, or keep going.</>
              : <>Your <strong>{fmtDur(pv.phaseLen)}</strong> break is up. Resume work, or extend it.</>}
          </p>
        </div>
        <div className="drawer-footer">
          {isWork ? (
            <>
              <button className="primary" onClick={() => dispatch({ type: "POMODORO_BREAK" })}>
                Take {pv.nextBreakIsLong ? "long break" : "break"}
              </button>
              <span className="pomo-extend-label">Keep working</span>
              <button onClick={() => dispatch({ type: "POMODORO_EXTEND", minutes: 5 })}>+5</button>
              <button onClick={() => dispatch({ type: "POMODORO_EXTEND", minutes: 10 })}>+10</button>
              <button onClick={() => dispatch({ type: "POMODORO_EXTEND", minutes: 15 })}>+15</button>
              <button onClick={() => dispatch({ type: "POMODORO_EXTEND", minutes: workMin })}>+1 pomodoro</button>
            </>
          ) : (
            <>
              <button className="primary" onClick={() => dispatch({ type: "POMODORO_RESUME" })}>Resume work</button>
              <span className="pomo-extend-label">Extend break</span>
              <button onClick={() => dispatch({ type: "POMODORO_EXTEND", minutes: 5 })}>+5</button>
              <button onClick={() => dispatch({ type: "POMODORO_EXTEND", minutes: 10 })}>+10</button>
              <button onClick={() => dispatch({ type: "POMODORO_EXTEND", minutes: 15 })}>+15</button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button className="cancel-accent" onClick={onDismiss}>Not now</button>
        </div>
      </div>
    </div>
  );
}
