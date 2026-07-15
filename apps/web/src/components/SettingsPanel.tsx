/**
 * Settings panel (SPEC VI): same slide-in chrome as the task drawer. Currently
 * holds the one app-wide setting — clock format (12h/24h) — applied to the
 * global clock, timeline ticks, and pipeline cards alike. Extend this panel
 * as more settings are added rather than scattering per-component toggles.
 */

import type { Event, TimingType } from "@maxtellar/core";
import { useSettings, type PresetId } from "../settings";
import { useEscClose } from "../useEscClose";

interface Props {
  minFragment: number;
  openExtentCap: number;
  semiTailFloor: number;
  dispatch: (e: Event) => void;
  /** Revert-and-close (Esc / × / scrim) — §06 transactional Settings. */
  onCancel: () => void;
  /** Commit-and-close (Done). */
  onDone: () => void;
  onOpenHeadsConfig: () => void;
  onOpenAiStudio: () => void;
}

const PRESET_TIMINGS: TimingType[] = ["unscheduled", "budgeted", "semi-head", "semi-tail", "fixed"];
const PRESET_ROWS: { id: PresetId; label: string }[] = [
  { id: "sleep", label: "Sleep" },
  { id: "nap", label: "Nap" },
  { id: "food", label: "Food" },
];

export function SettingsPanel({ minFragment, openExtentCap, semiTailFloor, dispatch, onCancel, onDone, onOpenHeadsConfig, onOpenAiStudio }: Props): JSX.Element {
  const { timeFormat, setTimeFormat, showWeekday, setShowWeekday, weekendDays, setWeekendDays, gridGranularity, setGridGranularity, devSandbox, setDevSandbox, presetDefaults, setPresetDefault, mlMode, setMlMode } = useSettings();
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const toggleWeekend = (d: number): void => {
    const next = weekendDays.includes(d) ? weekendDays.filter((x) => x !== d) : [...weekendDays, d].sort();
    setWeekendDays(next); // setter enforces ≥1
  };
  const gridOptions = [0, 5, 10, 15, 30] as const;
  useEscClose(onCancel);
  const capHours = Math.round((openExtentCap / 60) * 10) / 10;
  const floorHours = Math.round((semiTailFloor / 60) * 10) / 10;

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="drawer-header">
          <h2 id="settings-title">Settings</h2>
          <button className="drawer-close" aria-label="Close" onClick={onCancel}>&times;</button>
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
            <label data-tip="Show the weekday name on far-date times, e.g. 'Sun, Jul 19, 02:01 AM' vs 'Jul 19, 02:01 AM'. Either way the label is ignored when re-reading what you typed.">
              Show weekday on dates
            </label>
            <div className="type-chips" role="radiogroup" aria-label="Show weekday on dates">
              <button type="button" className={`type-chip${showWeekday ? " active" : ""}`} data-status="fixed" onClick={() => setShowWeekday(true)}>Show — Sun, Jul 19</button>
              <button type="button" className={`type-chip${!showWeekday ? " active" : ""}`} data-status="unscheduled" onClick={() => setShowWeekday(false)}>Hide — Jul 19</button>
            </div>
          </div>
          <div className="field">
            <label data-tip="Which days are your cultural 'weekend' (default Sat + Sun; at least one). Weekend days get the shaded column and are always OFF days in the week planner; you can add more OFF days there to lengthen the weekend.">
              Weekend days
            </label>
            <div className="type-chips" role="group" aria-label="Weekend days">
              {WD.map((w, d) => (
                <button key={d} type="button" className={`type-chip${weekendDays.includes(d) ? " active" : ""}`} data-status="semi-tail" onClick={() => toggleWeekend(d)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label data-tip="AI intensity. Maximum runs the on-device AI (smart suggestions for sub-heads, decompositions, and casual-time parsing). Lightweight runs the deterministic paths only — for low-end machines. AI is never load-bearing; the app works fully either way. Open AI Studio to tune each feature individually.">
              AI features {mlMode === "custom" && <span className="badge" data-timing="semi-head">custom</span>}
            </label>
            <div className="type-chips" role="radiogroup" aria-label="AI features">
              <button
                type="button"
                className={`type-chip${mlMode === "maximum" ? " active" : ""}`}
                data-status="fixed"
                onClick={() => setMlMode("maximum")}
              >
                Maximum AI
              </button>
              <button
                type="button"
                className={`type-chip${mlMode === "lightweight" ? " active" : ""}`}
                data-status="unscheduled"
                onClick={() => setMlMode("lightweight")}
              >
                Lightweight
              </button>
            </div>
            <button style={{ marginTop: 8 }} onClick={onOpenAiStudio}>AI Studio — tune each feature →</button>
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
            <label data-tip="Default timing type each preset pill (Sleep / Nap / Food) starts with in the task drawer — always overridable per task (§2.9).">
              Preset defaults
            </label>
            {PRESET_ROWS.map(({ id, label }) => (
              <div className="field" key={id} style={{ marginTop: 6 }}>
                <label style={{ fontSize: 11, marginBottom: 4 }}>{label}</label>
                <div className="type-chips" role="radiogroup" aria-label={`${label} default timing`}>
                  {PRESET_TIMINGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`type-chip${presetDefaults[id] === t ? " active" : ""}`}
                      data-status={t}
                      onClick={() => setPresetDefault(id, t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
          <button className="primary" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}
