/**
 * Settings panel (SPEC VI): same slide-in chrome as the task drawer. Currently
 * holds the one app-wide setting — clock format (12h/24h) — applied to the
 * global clock, timeline ticks, and pipeline cards alike. Extend this panel
 * as more settings are added rather than scattering per-component toggles.
 */

import type { Event } from "@maxtellar/core";
import { useSettings } from "../settings";
import { useEscClose } from "../useEscClose";

interface Props {
  minFragment: number;
  openExtentCap: number;
  semiTailFloor: number;
  dispatch: (e: Event) => void;
  onClose: () => void;
  onOpenHeadsConfig: () => void;
}

export function SettingsPanel({ minFragment, openExtentCap, semiTailFloor, dispatch, onClose, onOpenHeadsConfig }: Props): JSX.Element {
  const { timeFormat, setTimeFormat, gridGranularity, setGridGranularity, devSandbox, setDevSandbox } = useSettings();
  const gridOptions = [0, 5, 10, 15, 30] as const;
  useEscClose(onClose);
  const capHours = Math.round((openExtentCap / 60) * 10) / 10;
  const floorHours = Math.round((semiTailFloor / 60) * 10) / 10;

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
            <label data-tip="Ruler graduation marks between the hour labels on the timeline. Off by default.">
              Timeline grid
            </label>
            <div className="type-chips" role="radiogroup" aria-label="Timeline grid">
              {gridOptions.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`type-chip${gridGranularity === g ? " active" : ""}`}
                  data-status={g === 0 ? "unscheduled" : "semi-head"}
                  onClick={() => setGridGranularity(g)}
                >
                  {g === 0 ? "Off" : `${g} min`}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label data-tip="The smallest schedulable piece of a task, in minutes — no budget or split ever goes below it (§3.7). Raising it re-snaps existing budgets up to the new floor.">
              Minimum fragment (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={minFragment}
              onChange={(e) => {
                const m = Number(e.target.value);
                if (Number.isFinite(m) && m >= 1) dispatch({ type: "SET_MIN_FRAGMENT", minutes: Math.round(m) });
              }}
            />
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
            <label data-tip="The minimum span an open end-anchored (semi-tail) task's claim can be compressed to by a new task; at the floor it slides later (if slideable) or stays put as an obstacle (§3.9.1)">
              Semi-tail floor (hours)
            </label>
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={floorHours}
              onChange={(e) => {
                const h = Number(e.target.value);
                if (Number.isFinite(h) && h > 0) dispatch({ type: "SET_TAIL_FLOOR", minutes: Math.round(h * 60) });
              }}
            />
          </div>
          <div className="field">
            <label>Heads &amp; sub-heads</label>
            <button onClick={onOpenHeadsConfig}>Manage heads &amp; sub-heads →</button>
          </div>
          <div className="field">
            <label className="flag" data-tip="Testing affordances — shows a dev clock beside the global clock that ticks/fast-forwards logical time. Never changes scheduler behavior.">
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
