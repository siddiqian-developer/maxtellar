/**
 * Week plan (§4.4) — the structural weekly commitment: reusable task templates
 * that SOD injection instantiates onto matching weekdays. Full-page config-screen
 * chrome. Mid-week planning is LOCKED (the week is a commitment); editing is open
 * before the first week starts, on an OFF weekday, or via an explicit urgent
 * override. "Start New Week" marks the boundary. Esc → Day.
 *
 * Every time/duration field inherits smart-input (§7.0.2): anchor times parse
 * casually into a time-of-day; budgets via casual duration. Templates store
 * time-of-day (0..1439); injection resolves them to today's date.
 */
import { useMemo, useState } from "react";
import type { Event, State, TimingType, WeekTemplate } from "@maxtellar/core";
import { canPlanWeek } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { useSettings } from "../settings";
import { parseTimeOfDay, parseCasualDuration } from "../casualTime";
import { fmtClock, fmtDurUnits, toDate } from "../time";
import { weekPreview } from "../weekPreview";
import { SubheadField } from "./SubheadField";

const GRID_H = 460; // px, the shared column body height

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  onBack: () => void;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMINGS: TimingType[] = ["budgeted", "fixed", "semi-head", "semi-tail", "unscheduled"];
const TIMING_LABEL: Record<TimingType, string> = {
  budgeted: "Budgeted",
  fixed: "Fixed",
  "semi-head": "Start-anchored",
  "semi-tail": "End-anchored",
  unscheduled: "Unscheduled",
};

/** tod (minutes-into-day) → clock string per the 12/24h setting. */
function fmtTod(tod: number, hour12: boolean): string {
  const d = toDate(0);
  d.setHours(0, 0, 0, 0);
  return fmtClock(new Date(d.getTime() + tod * 60000), hour12);
}

export function WeekView({ state, dispatch, onBack }: Props): JSX.Element {
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const [editing, setEditing] = useState<WeekTemplate | "new" | null>(null);
  const [urgent, setUrgent] = useState(false);
  useEscClose(editing ? () => setEditing(null) : onBack);

  const todayWeekday = toDate(state.now).getDay();
  const started = state.week.startedAt !== null;
  const locked = !canPlanWeek(state, todayWeekday, urgent);

  // Replace-all commit: rebuild the template array and dispatch SET_WEEK_PLAN
  // (passing today's weekday for the OFF-day lock check + the urgent bypass).
  const commit = (templates: WeekTemplate[]): void => {
    dispatch({ type: "SET_WEEK_PLAN", templates, weekday: todayWeekday, urgent });
  };
  const upsert = (t: WeekTemplate): void => {
    const exists = state.week.templates.some((x) => x.id === t.id);
    commit(exists ? state.week.templates.map((x) => (x.id === t.id ? t : x)) : [...state.week.templates, t]);
    setEditing(null);
  };
  const remove = (id: string): void => {
    commit(state.week.templates.filter((x) => x.id !== id));
    setEditing(null);
  };

  const toggleOffDay = (d: number): void => {
    const offDays = state.week.offDays.includes(d)
      ? state.week.offDays.filter((x) => x !== d)
      : [...state.week.offDays, d].sort();
    if (offDays.length === 0) return; // ≥1 OFF day (§4.4)
    dispatch({ type: "START_WEEK", offDays });
  };

  return (
    <div className="config-screen">
      <div className="config-header">
        <button className="theme-toggle" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>Week Plan</h2>
        <span style={{ flex: 1 }} />
        <button
          className="sod-btn ready"
          onClick={() => dispatch({ type: "START_WEEK", firstWeekday: todayWeekday })}
          data-tip="Roll over to a new week — today becomes the First Weekday"
        >
          {started ? "Start New Week" : "Start Week"}
        </button>
      </div>
      <div className="config-body">
        <div className="config-section">
          <h3>This week</h3>
          <p className="field-desc">
            {started
              ? `Week started; First Weekday ${state.week.firstWeekday !== null ? WD[state.week.firstWeekday] : "—"}. Structural changes are locked until an OFF day.`
              : "No week started yet — plan freely, then Start Week."}
          </p>
          <div className="config-subsection">
            <h4>OFF days (weekly planning window)</h4>
            <div className="type-chips" role="group" aria-label="OFF days">
              {WD.map((w, d) => (
                <button
                  key={d}
                  type="button"
                  className={`type-chip${state.week.offDays.includes(d) ? " active" : ""}`}
                  data-status="semi-tail"
                  onClick={() => toggleOffDay(d)}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        {locked && (
          <div className="form-warning" role="status">
            <div>Mid-week structural planning is locked (the week is a commitment).</div>
            <label className="off-urgent">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent override
            </label>
          </div>
        )}

        <div className="config-section">
          <div className="wk-section-head">
            <h3>The week, placed</h3>
            <button className="hist-add-btn" disabled={locked} onClick={() => setEditing("new")} data-tip={locked ? "Locked until an OFF day" : "Add a recurring task template"}>
              + Add template
            </button>
          </div>
          {state.week.templates.length === 0 ? (
            <span className="config-empty">no templates yet — add recurring tasks; they appear placed across the week here</span>
          ) : (() => {
            const preview = weekPreview(state.week.templates, state.minFragment, state.openExtentCap, state.semiTailFloor);
            const span = preview.winEnd - preview.winStart;
            const scale = GRID_H / span;
            const step = span > 14 * 60 ? 180 : 120; // hour-label spacing
            const hours: number[] = [];
            for (let m = Math.ceil(preview.winStart / step) * step; m <= preview.winEnd; m += step) hours.push(m);
            const openEdit = (id: string): void => {
              if (locked) return;
              const t = state.week.templates.find((x) => x.id === id);
              if (t) setEditing(t);
            };
            return (
              <div className="wk-grid-scroll">
                <div className="wk-grid">
                  <div className="wk-axis" style={{ height: GRID_H }}>
                    {hours.map((h) => (
                      <span key={h} className="wk-axis-label num" style={{ top: (h - preview.winStart) * scale }}>{fmtTod(h, hour12)}</span>
                    ))}
                  </div>
                  {preview.days.map((day) => (
                    <div key={day.weekday} className="wk-col">
                      <div className={`wk-col-head${state.week.offDays.includes(day.weekday) ? " off" : ""}${day.weekday === todayWeekday ? " today" : ""}`}>
                        {WD[day.weekday]}
                      </div>
                      <div className="wk-col-body" style={{ height: GRID_H }}>
                        {hours.map((h) => (
                          <div key={h} className="wk-hourline" style={{ top: (h - preview.winStart) * scale }} />
                        ))}
                        {day.blocks.map((b) => (
                          <button
                            key={`${day.weekday}-${b.templateId}`}
                            className="wk-block"
                            data-timing={b.timing}
                            style={{ top: (b.start - preview.winStart) * scale, height: Math.max(15, (b.end - b.start) * scale - 2) }}
                            onClick={() => openEdit(b.templateId)}
                            data-tip={locked ? undefined : `${b.title} · ${fmtTod(b.start, hour12)}–${fmtTod(b.end, hour12)}`}
                          >
                            <span className="wk-block-title">{b.title}</span>
                            <span className="wk-block-time num">{fmtTod(b.start, hour12)}</span>
                          </button>
                        ))}
                        {day.blocks.length === 0 && <span className="wk-col-empty">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {editing && (
        <TemplateEditor
          template={editing === "new" ? null : editing}
          hour12={hour12}
          onSave={upsert}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Add/edit one template — reuses drawer chrome. Smart-input on time/duration. */
function TemplateEditor({
  template,
  hour12,
  onSave,
  onDelete,
  onClose,
}: {
  template: WeekTemplate | null;
  hour12: boolean;
  onSave: (t: WeekTemplate) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  useEscClose(onClose);
  const isNew = template === null;
  const [title, setTitle] = useState(template?.title ?? "");
  const [activity, setActivity] = useState(template?.activityId ?? "");
  const [head, setHead] = useState<string | undefined>(template?.headId);
  const [timing, setTiming] = useState<TimingType>(template?.timing ?? "budgeted");
  const [weekdays, setWeekdays] = useState<number[]>(template?.weekdays ?? [1, 2, 3, 4, 5]);
  const [budgetStr, setBudgetStr] = useState(template?.budget !== undefined ? fmtDurUnits(template.budget) : "");
  const [startStr, setStartStr] = useState(template?.anchorStartTod !== undefined ? fmtTod(template.anchorStartTod, hour12) : "");
  const [endStr, setEndStr] = useState(template?.anchorEndTod !== undefined ? fmtTod(template.anchorEndTod, hour12) : "");
  const [err, setErr] = useState<string | null>(null);

  const todOf = (s: string): number | undefined => {
    const t = parseTimeOfDay(s);
    return t ? t.hour * 60 + t.min : undefined;
  };
  const budgetOf = (s: string): number | undefined => parseCasualDuration(s);

  const needStart = timing === "fixed" || timing === "semi-head";
  const needEnd = timing === "fixed" || timing === "semi-tail";
  const needBudget = timing === "semi-head" || timing === "semi-tail" || timing === "budgeted";

  const toggleDay = (d: number): void =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  const save = (): void => {
    if (!title.trim()) return setErr("Give it a title.");
    if (!activity.trim() || !head) return setErr("Pick a sub-head.");
    if (weekdays.length === 0) return setErr("Pick at least one weekday.");
    const start = needStart ? todOf(startStr) : undefined;
    const end = needEnd ? todOf(endStr) : undefined;
    if (needStart && start === undefined) return setErr("Enter a valid start time.");
    if (needEnd && end === undefined) return setErr("Enter a valid end time.");
    let budget = needBudget ? budgetOf(budgetStr) : undefined;
    if (timing === "fixed" && start !== undefined && end !== undefined) budget = Math.max(1, end - start);
    if (needBudget && (budget === undefined || budget <= 0)) return setErr("Enter a valid budget.");

    const t: WeekTemplate = {
      id: template?.id ?? `tpl-${Date.now().toString(36)}`,
      rank: template?.rank ?? "m",
      title: title.trim(),
      headId: head,
      activityId: activity.trim(),
      timing,
      tier: template?.tier ?? "normal",
      ommf: template?.ommf ?? false,
      slideable: timing !== "fixed",
      breakable: timing === "budgeted",
      weekdays: weekdays.slice().sort(),
      ...(budget !== undefined ? { budget } : {}),
      ...(start !== undefined ? { anchorStartTod: start } : {}),
      ...(end !== undefined ? { anchorEndTod: end } : {}),
    };
    onSave(t);
  };

  const timeField = (label: string, value: string, set: (v: string) => void, commit: (v: string) => void): JSX.Element => (
    <div className="field">
      <label>{label}</label>
      <input value={value} className="num" aria-label={label}
        onChange={(e) => set(e.target.value)}
        onBlur={() => commit(value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(value); } }} />
    </div>
  );

  return (
    <div className="drawer-overlay">
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="tpl-title">
        <div className="drawer-header">
          <h2 id="tpl-title">{isNew ? "Add template" : "Edit template"}</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label>Title <span className="req-dot" aria-label="required">•</span></label>
            <div className="clearable-field">
              <input value={title} aria-label="Template title" onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Standup, Gym" autoFocus />
            </div>
          </div>
          <div className="field">
            <label>Sub-head <span className="req-dot" aria-label="required">•</span></label>
            <SubheadField activity={activity} onActivity={setActivity} onHead={setHead} title={title} />
          </div>
          <div className="field">
            <label>Timing</label>
            <div className="type-chips" role="radiogroup" aria-label="Timing">
              {TIMINGS.map((ty) => (
                <button key={ty} type="button" className={`type-chip${ty === timing ? " active" : ""}`} data-status={ty} onClick={() => setTiming(ty)}>
                  {TIMING_LABEL[ty]}
                </button>
              ))}
            </div>
          </div>
          {needStart && timeField("Start (time of day)", startStr, setStartStr, (v) => { const t = todOf(v); if (t !== undefined) setStartStr(fmtTod(t, hour12)); })}
          {needEnd && timeField("End (time of day)", endStr, setEndStr, (v) => { const t = todOf(v); if (t !== undefined) setEndStr(fmtTod(t, hour12)); })}
          {needBudget && (
            <div className="field">
              <label>Budget</label>
              <input value={budgetStr} className="num" aria-label="Budget"
                onChange={(e) => setBudgetStr(e.target.value)}
                onBlur={() => { const b = budgetOf(budgetStr); if (b !== undefined) setBudgetStr(fmtDurUnits(b)); }}
                placeholder="e.g. 1h 30m" />
            </div>
          )}
          <div className="field">
            <label>Repeats on <span className="req-dot" aria-label="required">•</span></label>
            <div className="type-chips" role="group" aria-label="Weekdays">
              {WD.map((w, d) => (
                <button key={d} type="button" className={`type-chip${weekdays.includes(d) ? " active" : ""}`} data-status="budgeted" onClick={() => toggleDay(d)}>
                  {w}
                </button>
              ))}
            </div>
            <div className="wk-shortcuts">
              <button type="button" className="link-btn" onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}>Daily</button>
              <button type="button" className="link-btn" onClick={() => setWeekdays([1, 2, 3, 4, 5])}>Weekdays</button>
              <button type="button" className="link-btn" onClick={() => setWeekdays([0, 6])}>Weekend</button>
            </div>
          </div>
          {err && <div className="form-warning" role="status">{err}</div>}
        </div>
        <div className="drawer-footer">
          <button className="primary" onClick={save}>{isNew ? "Add" : "Save"}</button>
          <button className="cancel-accent" onClick={onClose}>Cancel</button>
          <span style={{ flex: 1 }} />
          {!isNew && <button className="cancel-accent delete-btn" onClick={() => onDelete(template!.id)} data-tip="Delete template">Delete</button>}
        </div>
      </div>
    </div>
  );
}
