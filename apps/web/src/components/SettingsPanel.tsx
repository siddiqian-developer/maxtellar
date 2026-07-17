/**
 * Settings panel (SPEC VI): same slide-in chrome as the task drawer. Currently
 * holds the one app-wide setting — clock format (12h/24h) — applied to the
 * global clock, timeline ticks, and pipeline cards alike. Extend this panel
 * as more settings are added rather than scattering per-component toggles.
 */

import type { Event, WeekTemplate } from "@maxtellar/core";
import { headName } from "@maxtellar/core";
import { useSettings } from "../settings";
import { type PresetConfig } from "../presets";
import { FIELD_ROLES } from "./TaskSpecFields";
import { SleepTrioFields } from "./SleepTrioFields";
import { useEscClose } from "../useEscClose";
import { countStartWeekday } from "../workingDays";
import { capitalCase } from "../text";
import { fmtTod, fmtDurUnits } from "../time";
import { DurInput } from "./BudgetPanel";
import { BUILTIN_SOUNDS, playAlarm } from "../sound";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  minFragment: number;
  openExtentCap: number;
  semiTailFloor: number;
  /** §11.4 Sleep budget — the one global value, synced with Weekly Planning. */
  sleepMinutes: number;
  /** §11.4 revised 2026-07-21: the real Sleep WeekTemplate — the trio's
   * timing/anchors live here (always present, per budget.ts's `sleepTemplate`). */
  sleepTemplate: WeekTemplate | undefined;
  /** §4.4a: core's OFF set — the weekend must stay a subset of it. */
  offDays: number[];
  dispatch: (e: Event) => void;
  /** Revert-and-close (Esc / × / scrim) — §06 transactional Settings. */
  onCancel: () => void;
  /** Commit-and-close (Done). */
  onDone: () => void;
  onOpenHeadsConfig: () => void;
  onOpenAiStudio: () => void;
  /** §11.1c: opens the full Presets configuration screen. */
  onOpenPresets: () => void;
}

/** One-line summary of a preset's value for the Settings compact list (§11.1c
 * — full editing lives on the Presets SCREEN; here: summary + reorder only). */
function presetSummary(p: PresetConfig, hour12: boolean): string {
  const roles = FIELD_ROLES[p.timing];
  const src = capitalCase(p.timing === "budgeted" ? p.budgetSource : p.anchorSource);
  const tod = (m: number): string => fmtTod(m, hour12);
  if (roles.start !== "not used" || roles.end !== "not used") {
    const times = [
      roles.start !== "not used" ? tod(p.startFlat) : null,
      roles.end !== "not used" ? tod(p.endFlat) : null,
    ].filter(Boolean).join("–");
    return `${capitalCase(p.timing)} · ${times} · ${src}`;
  }
  if (roles.budget !== "not used") return `${capitalCase(p.timing)} · ${fmtDurUnits(p.budgetFlat)} · ${src}`;
  return capitalCase(p.timing);
}

/** Compact reorderable summary row (drag ⋮⋮ + ▴/▾) — ordering is fully
 * available right in Settings; everything ELSE about a preset is edited on
 * the Presets screen. */
function SortableSummaryRow({ p, index, count, hour12, onMove }: {
  p: PresetConfig;
  index: number;
  count: number;
  hour12: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style = { transform: CSS.Transform.toString(transform), transition, ...(isDragging ? { zIndex: 5, opacity: 0.7 } : {}) };
  return (
    <div ref={setNodeRef} style={style} className="preset-summary-row">
      <span className="bp-drag" data-tip="Drag to reorder" {...listeners} {...attributes}>⋮⋮</span>
      <span className="preset-row-name">{headName(p.headId)}</span>
      <span className="preset-summary">{presetSummary(p, hour12)}</span>
      <span className="preset-row-actions">
        <button type="button" className="link-btn preset-arrow up" disabled={index === 0} aria-label={`Move ${p.label} up`} onClick={() => onMove(p.id, -1)} />
        <button type="button" className="link-btn preset-arrow down" disabled={index === count - 1} aria-label={`Move ${p.label} down`} onClick={() => onMove(p.id, 1)} />
      </span>
    </div>
  );
}

export function SettingsPanel({ minFragment, openExtentCap, semiTailFloor, sleepMinutes, sleepTemplate, offDays, dispatch, onCancel, onDone, onOpenHeadsConfig, onOpenAiStudio, onOpenPresets }: Props): JSX.Element {
  const { timeFormat, setTimeFormat, showWeekday, setShowWeekday, weekendDays, setWeekendDays, gridGranularity, setGridGranularity, devSandbox, setDevSandbox, presetsConfig, setPresetsConfig, mlMode, setMlMode, pomodoroDefault, setPomodoroDefault, alarmsEnabled, setAlarmsEnabled, alarmBehavior, setAlarmBehavior, alarmSound, setAlarmSound, customSounds, addCustomSound, removeCustomSound } = useSettings();
  const hour12 = timeFormat === "12h";

  // §11.1c: ordering is fully available HERE (drag + ▴▾); all other preset
  // editing lives on the Presets screen (onOpenPresets).
  const movePreset = (id: string, dir: -1 | 1): void => {
    const i = presetsConfig.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= presetsConfig.length) return;
    setPresetsConfig(arrayMove(presetsConfig, i, j));
  };
  const presetDndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onPresetDndEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = presetsConfig.findIndex((p) => p.id === String(active.id));
    const to = presetsConfig.findIndex((p) => p.id === String(over.id));
    if (from >= 0 && to >= 0) setPresetsConfig(arrayMove(presetsConfig, from, to));
  };

  const enableAlarms = (on: boolean): void => {
    setAlarmsEnabled(on);
    // §5.3 best-effort: ask for system-notification permission on enable; the
    // in-app banner + sound work regardless of the answer.
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };
  const onUploadSound = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = `${Date.now()}`;
      addCustomSound({ id, name: f.name, dataUrl: String(reader.result) });
      setAlarmSound(`custom:${id}`);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const toggleWeekend = (d: number): void => {
    const next = weekendDays.includes(d) ? weekendDays.filter((x) => x !== d) : [...weekendDays, d].sort();
    if (next.length < 1) return; // ≥1 weekend day (the setter enforces it too)
    setWeekendDays(next);
    // §4.4a invariant `weekend ⊆ offDays`: a day marked weekend is ALWAYS an OFF day
    // — "you cannot mark a day 'weekend' yet have it inject". Without this the day
    // was tinted as weekend and still injected its templates.
    // UNMARKING does not un-OFF it: offDays may exceed the weekend, so it simply
    // becomes a non-weekend off, which the planner's chips can toggle freely.
    const union = [...new Set([...offDays, ...next])].sort((a, b) => a - b);
    const fw = countStartWeekday(next, union) ?? undefined; // §4.4b: the run moved
    dispatch({ type: "SET_OFF_DAYS", offDays: union, ...(fw !== undefined ? { firstWeekday: fw } : {}) });
  };
  const gridOptions = [0, 5, 10, 15, 30] as const;
  useEscClose(onCancel);

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
              Minimum fragment
            </label>
            <DurInput ariaLabel="Minimum fragment" value={minFragment} min={1}
              onCommit={(m) => { if (m !== null && m >= 1) dispatch({ type: "SET_MIN_FRAGMENT", minutes: m }); }} />
          </div>
          <div className="field">
            <label data-tip="Sleep is the head of the day (§11.4) — a real, always-planned template. One global value, synced with the Weekly Planning Budgets column AND the Calendar block.">
              Sleep
            </label>
            <SleepTrioFields
              hour12={hour12}
              minFragment={minFragment}
              value={{
                timing: sleepTemplate?.timing ?? "budgeted",
                budget: sleepTemplate?.budget ?? sleepMinutes,
                anchorStartTod: sleepTemplate?.anchorStartTod,
                anchorEndTod: sleepTemplate?.anchorEndTod,
                anchorEndDayOffset: sleepTemplate?.anchorEndDayOffset,
              }}
              onChange={(next) => dispatch({
                type: "SET_SLEEP_BUDGET",
                minutes: next.budget ?? sleepMinutes,
                timing: next.timing,
                ...(next.anchorStartTod !== undefined ? { anchorStartTod: next.anchorStartTod } : {}),
                ...(next.anchorEndTod !== undefined ? { anchorEndTod: next.anchorEndTod } : {}),
                ...(next.anchorEndDayOffset !== undefined ? { anchorEndDayOffset: next.anchorEndDayOffset } : {}),
              })}
            />
          </div>
          <div className="field">
            <label data-tip="How far an open (unscheduled / budget-less) task fills the day before lower-priority tasks are placed after it (§3.9)">
              Open-task cap
            </label>
            <DurInput ariaLabel="Open-task cap" value={openExtentCap} min={1}
              onCommit={(m) => { if (m !== null && m > 0) dispatch({ type: "SET_OPEN_CAP", minutes: m }); }} />
          </div>
          <div className="field">
            <label data-tip="The minimum span an open end-anchored (semi-tail) task's claim can be compressed to by a new task; at the floor it slides later (if slideable) or stays put as an obstacle (§3.9.1)">
              Semi-tail floor
            </label>
            <DurInput ariaLabel="Semi-tail floor" value={semiTailFloor} min={1}
              onCommit={(m) => { if (m !== null && m > 0) dispatch({ type: "SET_TAIL_FLOOR", minutes: m }); }} />
          </div>
          <div className="field">
            <label data-tip="Each preset pre-fills a locked bundle in the task drawer — timing type, and the value that timing needs, from a fixed number, today's week-plan line, or (Sleep) Settings' sleep budget. Reorder here (drag or ▴▾); everything else is edited on the Presets screen.">
              Presets
            </label>
            <DndContext sensors={presetDndSensors} collisionDetection={closestCenter} onDragEnd={onPresetDndEnd}>
              <SortableContext items={presetsConfig.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="preset-summary-list">
                  {presetsConfig.map((p, i) => (
                    <SortableSummaryRow key={p.id} p={p} index={i} count={presetsConfig.length} hour12={timeFormat === "12h"} onMove={movePreset} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <button onClick={onOpenPresets} style={{ marginTop: 8 }}>Manage presets →</button>
          </div>
          <div className="field">
            <label data-tip="§5.2 default pomodoro preset — the intervals a task starts with when you check 'Start as pomodoro'. Work/break are overridable per task at Start.">
              🍅 Pomodoro default
            </label>
            <div className="pomo-settings">
              <label>Work <DurInput ariaLabel="Default work length" value={pomodoroDefault.workMin} onCommit={(m) => { if (m !== null) setPomodoroDefault({ ...pomodoroDefault, workMin: Math.max(1, m) }); }} /></label>
              <label>Break <DurInput ariaLabel="Default break length" value={pomodoroDefault.breakMin} onCommit={(m) => { if (m !== null) setPomodoroDefault({ ...pomodoroDefault, breakMin: Math.max(1, m) }); }} /></label>
              <label>Long break <DurInput ariaLabel="Default long-break length" value={pomodoroDefault.longBreakMin} onCommit={(m) => { if (m !== null) setPomodoroDefault({ ...pomodoroDefault, longBreakMin: Math.max(1, m) }); }} /></label>
              <label>Every
                <input className="num bp-input pomo-cycles" type="number" min={1} aria-label="Work intervals before a long break"
                  value={pomodoroDefault.cyclesBeforeLong}
                  onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 1) setPomodoroDefault({ ...pomodoroDefault, cyclesBeforeLong: n }); }} />
                intervals
              </label>
            </div>
          </div>
          <div className="field">
            <label className="flag" data-tip="§5.3 best-effort alarms: in-app banner always, plus system sound + notifications where allowed (fixed-start approaching, overrun, at-most quota, pomodoro transitions, SOD reminder).">
              <input type="checkbox" checked={alarmsEnabled} onChange={(e) => enableAlarms(e.target.checked)} />
              🔔 Alarms
            </label>
            {alarmsEnabled && (
              <div className="alarm-settings">
                <div className="field" style={{ marginTop: 6 }}>
                  <label style={{ fontSize: 11 }}>When an alarm fires</label>
                  <div className="type-chips" role="radiogroup" aria-label="Alarm behavior">
                    <button type="button" className={`type-chip${alarmBehavior === "persist" ? " active" : ""}`} onClick={() => setAlarmBehavior("persist")} data-tip="Keeps showing until you dismiss it or the condition clears">Persist</button>
                    <button type="button" className={`type-chip${alarmBehavior === "oneshot" ? " active" : ""}`} onClick={() => setAlarmBehavior("oneshot")} data-tip="Fires once, then clears itself">One-shot</button>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 6 }}>
                  <label style={{ fontSize: 11 }}>Sound</label>
                  <div className="alarm-sound-row">
                    <select aria-label="Alarm sound" value={alarmSound} onChange={(e) => setAlarmSound(e.target.value)}>
                      {BUILTIN_SOUNDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      {customSounds.map((c) => <option key={c.id} value={`custom:${c.id}`}>{c.name}</option>)}
                    </select>
                    <button type="button" onClick={() => playAlarm(alarmSound, customSounds)} data-tip="Preview">▶ Play</button>
                    <label className="alarm-upload" data-tip="Add your own audio file">
                      + Add sound
                      <input type="file" accept="audio/*" onChange={onUploadSound} style={{ display: "none" }} />
                    </label>
                  </div>
                  {customSounds.length > 0 && (
                    <ul className="alarm-custom-list">
                      {customSounds.map((c) => (
                        <li key={c.id}>
                          <span>{c.name}</span>
                          <button type="button" onClick={() => playAlarm(`custom:${c.id}`, customSounds)}>▶</button>
                          <button type="button" onClick={() => removeCustomSound(c.id)} aria-label={`Remove ${c.name}`}>&times;</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
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
