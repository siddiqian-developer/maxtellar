/**
 * Settings panel (SPEC VI): same slide-in chrome as the task drawer. Currently
 * holds the one app-wide setting — clock format (12h/24h) — applied to the
 * global clock, timeline ticks, and pipeline cards alike. Extend this panel
 * as more settings are added rather than scattering per-component toggles.
 */

import type { Event } from "@timekeeper/core";
import { useSettings } from "../settings";
import { useEscClose } from "../useEscClose";

interface Props {
  openExtentCap: number;
  dispatch: (e: Event) => void;
  onClose: () => void;
  onOpenHeadsConfig: () => void;
}

export function SettingsPanel({ openExtentCap, dispatch, onClose, onOpenHeadsConfig }: Props): JSX.Element {
  const { timeFormat, setTimeFormat, devSandbox, setDevSandbox } = useSettings();
  useEscClose(onClose);
  const capHours = Math.round((openExtentCap / 60) * 10) / 10;

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="drawer-header">
          <h2 id="settings-title">Settings</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label>Clock format</label>
            <div className="type-chips" role="radiogroup" aria-label="Clock format">
              <button
                type="button"
                className={`type-chip${timeFormat === "12h" ? " active" : ""}`}
                data-status="budgeted"
                onClick={() => setTimeFormat("12h")}
              >
                12h — AM/PM
              </button>
              <button
                type="button"
                className={`type-chip${timeFormat === "24h" ? " active" : ""}`}
                data-status="fixed"
                onClick={() => setTimeFormat("24h")}
              >
                24h
              </button>
            </div>
          </div>
          <div className="field">
            <label data-tip="How far an open (unscheduled / budget-less) task fills the day before lower-priority tasks are placed after it (§3.9)">
              Open-task cap (hours)
            </label>
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={capHours}
              onChange={(e) => {
                const h = Number(e.target.value);
                if (Number.isFinite(h) && h > 0) dispatch({ type: "SET_OPEN_CAP", minutes: Math.round(h * 60) });
              }}
            />
          </div>
          <div className="field">
            <label>Heads &amp; sub-heads</label>
            <button onClick={onOpenHeadsConfig}>Manage heads &amp; sub-heads →</button>
          </div>
          <div className="field">
            <label className="flag" data-tip="Testing affordances — adds a speed-up control to the running task. Never changes scheduler behavior.">
              <input
                type="checkbox"
                checked={devSandbox}
                onChange={(e) => setDevSandbox(e.target.checked)}
              />
              Dev sandbox
            </label>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
