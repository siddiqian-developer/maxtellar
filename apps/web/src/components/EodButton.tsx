/**
 * EOD — the End-of-Day ritual (§4.3). User-activated, never automatic; it
 * "processes nothing" and work after it is legal, so there is NO core event —
 * this is pure UI. If a task is Running when EOD is pressed, a modal offers
 * [Complete] / [Pause] / [Keep working], mapping to the existing
 * COMPLETE_RUNNING / PAUSE_RUNNING events. Otherwise EOD just acknowledges the
 * day is done (a transient marker). Real rollover is the next SOD.
 *
 * Esc → closes the modal (back one level).
 */
import { useState } from "react";
import type { Event, State } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
}

export function EodButton({ state, dispatch }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [acked, setAcked] = useState(false);

  const press = (): void => {
    if (state.running) setOpen(true);
    else {
      setAcked(true);
      setTimeout(() => setAcked(false), 4000);
    }
  };

  return (
    <>
      <button className="eod-btn" onClick={press} data-tip="End of day — a ritual close (work after is still fine)">
        End Day
      </button>
      {acked && <div className="notice-toast" role="status">Day marked done — real rollover is the next Start of Day.</div>}
      {open && state.running && (
        <EodModal
          title={state.running.title}
          onComplete={() => { dispatch({ type: "COMPLETE_RUNNING" }); setOpen(false); }}
          onPause={() => { dispatch({ type: "PAUSE_RUNNING" }); setOpen(false); }}
          onKeep={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EodModal({
  title,
  onComplete,
  onPause,
  onKeep,
}: {
  title: string;
  onComplete: () => void;
  onPause: () => void;
  onKeep: () => void;
}): JSX.Element {
  useEscClose(onKeep);
  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onKeep(); }}>
      <div className="drawer eod-modal" role="dialog" aria-modal="true" aria-labelledby="eod-title">
        <div className="drawer-header">
          <h2 id="eod-title">End the day?</h2>
          <button className="drawer-close" aria-label="Close" onClick={onKeep}>&times;</button>
        </div>
        <div className="drawer-body">
          <p className="field-desc">
            <strong>{title}</strong> is still running. What should happen to it?
          </p>
        </div>
        <div className="drawer-footer">
          <button className="primary" onClick={onComplete}>Complete</button>
          <button className="cancel-accent" onClick={onPause}>Pause</button>
          <span style={{ flex: 1 }} />
          <button className="cancel-accent" onClick={onKeep}>Keep working</button>
        </div>
      </div>
    </div>
  );
}
