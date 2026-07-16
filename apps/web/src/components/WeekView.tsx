/**
 * Week / Calendar grid (§4.4 / §4.6). One date-aware grid, two modes via a
 * segmented toggle:
 *  - WEEK PLAN — the recurring, coming-week structure. Blocks edit their
 *    WeekTemplate. Mid-week structural planning is LOCKED (a commitment); open
 *    before the first week, on an OFF day, or via the urgent bypass.
 *  - CALENDAR — a navigable dated view (‹ prev / next › weeks). Add one-off
 *    activities to a specific date, or skip/move a recurring template on that
 *    date only (the §4.6 dated override layer). Always editable.
 *
 * The grid shows the full 24h with hourly graduations, a real date over each
 * column, weekend/OFF shading, hover detail, and no horizontal scroll (7 columns
 * share the width). `weekPreview` runs the SAME core injection+settle per real
 * date, so what you see is what SOD will inject. Dated collisions raise a notice.
 * Every time/duration field inherits smart-input (§7.0.2). Esc → back.
 */
import { useMemo, useState } from "react";
import type { DatedTask, Event, State, TemplateOverride, WeekTemplate } from "@maxtellar/core";
import { canPlanWeek } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { WeekGridRBC } from "./WeekGridRBC";
import { countStartWeekday } from "../workingDays";
import { useSettings } from "../settings";
import { fmtClock, toDate } from "../time";
import { diffOverride, weekPreview, type WeekColumn } from "../weekPreview";
import { BudgetPanel, DurInput } from "./BudgetPanel";
import { useTaskSpec, TaskSpecFieldsView, DateField, TodField } from "./TaskSpecFields";
import { weekBudgetValidity } from "@maxtellar/core";

const HOUR_PX = 30; // vertical scale: 30px per hour → 720px for the full day

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  onBack: () => void;
  initialMode?: "week" | "calendar";
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MIN = 60000;

/** local-midnight epoch-minute of a Date. */
function midnightOf(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / MIN);
}
/** the Sunday (local midnight) on/before `now`. */
function sundayOf(now: number): number {
  const d = toDate(now);
  return midnightOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
}
/** 7 columns Sun…Sat starting at `weekStart` (a Sunday midnight). */
function columnsFrom(weekStart: number): WeekColumn[] {
  const s = toDate(weekStart);
  const cols: WeekColumn[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
    cols.push({ date: midnightOf(d), weekday: d.getDay() });
  }
  return cols;
}

export function WeekView({ state, dispatch, onBack, initialMode = "week" }: Props): JSX.Element {
  const { timeFormat, weekendDays } = useSettings();
  const hour12 = timeFormat === "12h";
  const [mode, setMode] = useState<"week" | "budget" | "calendar">(initialMode);
  const [editing, setEditing] = useState<WeekTemplate | "new" | null>(null);
  const [datedEdit, setDatedEdit] = useState<{ date: number; task: DatedTask | null } | null>(null);
  const [tplMenu, setTplMenu] = useState<{ date: number; templateId: string; title: string } | null>(null);
  const [urgent, setUrgent] = useState(false);
  // Calendar week offset in weeks from this week (0 = this week).
  const [weekOff, setWeekOff] = useState(1); // default to the COMING week
  const anyOverlay = editing || datedEdit || tplMenu;
  // Esc: overlays close first; in budget mode the panel owns Esc (expanded
  // row collapses, else back) so this hook stands down there.
  useEscClose(anyOverlay ? () => { setEditing(null); setDatedEdit(null); setTplMenu(null); } : mode === "budget" ? () => {} : onBack);

  const todayWeekday = toDate(state.now).getDay();
  const started = state.week.startedAt !== null;
  // §4.4: mid-week structural re-planning is forbidden — SET_WEEK_PLAN is gated in
  // the reducer regardless of which screen dispatched it. `structuralLock` is that
  // same truth for the UI; `locked` additionally exempts Calendar mode's DATED
  // powers (add/skip — SET_DATED is never gated).
  const structuralLock = !canPlanWeek(state, todayWeekday, urgent);
  const locked = mode !== "calendar" && structuralLock;
  const budgetValidity = weekBudgetValidity(state.week);

  // Week Plan is pinned to the COMING week; Calendar navigates from this week.
  const thisSunday = sundayOf(state.now);
  const weekStart = mode === "week" ? thisSunday + 7 * 1440 : thisSunday + weekOff * 7 * 1440;
  const columns = useMemo(() => columnsFrom(weekStart), [weekStart]);
  const preview = useMemo(
    () => weekPreview(state.week.templates, state.dated, columns, state.week.offDays, state.minFragment, state.openExtentCap, state.semiTailFloor, true),
    [state.week.templates, state.dated, columns, state.week.offDays, state.minFragment, state.openExtentCap, state.semiTailFloor],
  );

  const rangeLabel = (): string => {
    const a = toDate(columns[0]!.date);
    const b = toDate(columns[6]!.date);
    const left = `${MONTHS[a.getMonth()]} ${a.getDate()}`;
    const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${MONTHS[b.getMonth()]} ${b.getDate()}`;
    return `${left}–${right}`;
  };

  // ---- template mutations (week mode) ----
  const commit = (templates: WeekTemplate[]): void => {
    dispatch({ type: "SET_WEEK_PLAN", templates, weekday: todayWeekday, urgent });
  };
  const upsert = (t: WeekTemplate): void => {
    const exists = state.week.templates.some((x) => x.id === t.id);
    commit(exists ? state.week.templates.map((x) => (x.id === t.id ? t : x)) : [...state.week.templates, t]);
    setEditing(null);
  };
  const removeTpl = (id: string): void => {
    commit(state.week.templates.filter((x) => x.id !== id));
    setEditing(null);
  };
  /**
   * §4.4/§4.4b: the **First Weekday** declared at `START_WEEK` is the DERIVED first
   * working day — the first non-off day after the weekend run — never "the weekday
   * the user pressed the button on". Weekly planning runs ON an OFF day by design
   * (§4.4), so `todayWeekday` is systematically an OFF day; declaring that shifted
   * the weekly-quota week window (`weekdayPos`, §5.1) by the weekend's length.
   * Declaring the derivation keeps the one definition (§4.4b wins) in one place.
   * `undefined` (every day off) leaves the previous value untouched in the reducer.
   */
  const firstWorkingDay = (offDays: number[]): number | undefined =>
    countStartWeekday(weekendDays, offDays) ?? undefined;

  const toggleOffDay = (d: number): void => {
    if (weekendDays.includes(d)) return; // §4.4a: weekend days are locked ON
    const offDays = state.week.offDays.includes(d)
      ? state.week.offDays.filter((x) => x !== d)
      : [...state.week.offDays, d].sort();
    // weekend ⊆ offDays, and ≥1 OFF day.
    const withWeekend = [...new Set([...offDays, ...weekendDays])].sort();
    if (withWeekend.length === 0) return;
    // SET_OFF_DAYS, never START_WEEK: this edits the OFF set, it does not roll the
    // week over. START_WEEK would also reset `startedAt` (the week window weekly
    // quotas + Analytics measure from) and wipe the §5.1 ledger — from one chip click.
    // The OFF set just changed, so the weekend RUN — and with it the first working
    // day (§4.4b) — may have moved. Re-declare it, or `firstWeekday` goes stale.
    const fw = firstWorkingDay(withWeekend);
    dispatch({ type: "SET_OFF_DAYS", offDays: withWeekend, ...(fw !== undefined ? { firstWeekday: fw } : {}) });
  };

  // ---- dated mutations (calendar mode) ----
  const entryFor = (date: number) => state.dated.find((e) => e.date === date) ?? { date, adds: [] as DatedTask[], skips: [] as string[], overrides: [] };
  const putDated = (date: number, adds: (Omit<DatedTask, "id" | "rank"> & { id?: string; rank?: string })[], skips: string[], overrides: { templateId: string; anchorStartTod?: number; anchorEndTod?: number; budget?: number }[]): void => {
    dispatch({ type: "SET_DATED", date, adds, skips, overrides });
  };
  const saveDated = (date: number, task: Omit<DatedTask, "id" | "rank"> & { id?: string; rank?: string }): void => {
    const e = entryFor(date);
    const adds = task.id ? e.adds.map((a) => (a.id === task.id ? { ...task } : a)) : [...e.adds, task];
    putDated(date, adds as never, e.skips, e.overrides);
    setDatedEdit(null);
  };
  const deleteDated = (date: number, id: string): void => {
    const e = entryFor(date);
    putDated(date, e.adds.filter((a) => a.id !== id) as never, e.skips, e.overrides);
    setDatedEdit(null);
  };
  const toggleSkip = (date: number, templateId: string): void => {
    const e = entryFor(date);
    const skips = e.skips.includes(templateId) ? e.skips.filter((s) => s !== templateId) : [...e.skips, templateId];
    putDated(date, e.adds as never, skips, e.overrides);
    setTplMenu(null);
  };
  /** §4.6 third power: set/replace/clear THIS date's override for one template. */
  const saveOverride = (date: number, templateId: string, ov: TemplateOverride | null): void => {
    const e = entryFor(date);
    const rest = e.overrides.filter((o) => o.templateId !== templateId);
    putDated(date, e.adds as never, e.skips, ov ? [...rest, ov] : rest);
    setTplMenu(null);
  };

  const onBlockClick = (date: number, block: { templateId: string; title: string; dated: boolean }): void => {
    if (mode === "week") {
      if (block.dated) return; // dated one-offs are edited in Calendar
      if (locked) return;
      const t = state.week.templates.find((x) => x.id === block.templateId);
      if (t) setEditing(t);
      return;
    }
    // calendar
    if (block.dated) {
      const t = entryFor(date).adds.find((a) => a.id === block.templateId);
      if (t) setDatedEdit({ date, task: t });
    } else {
      setTplMenu({ date, templateId: block.templateId, title: block.title });
    }
  };

  const span = preview.winEnd - preview.winStart;
  const innerH = (span / 60) * HOUR_PX;

  return (
    <div className="config-screen">
      <div className="config-header">
        <button className="theme-toggle" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>{mode === "calendar" ? "Calendar" : "Weekly Planning"}</h2>
        <div className="wk-mode-toggle" role="tablist" aria-label="View">
          <button role="tab" aria-selected={mode === "week"} className={`wk-mode${mode === "week" ? " active" : ""}`} onClick={() => setMode("week")}>Week Plan</button>
          <button role="tab" aria-selected={mode === "budget"} className={`wk-mode${mode === "budget" ? " active" : ""}`} onClick={() => setMode("budget")}>Budgets</button>
          <button role="tab" aria-selected={mode === "calendar"} className={`wk-mode${mode === "calendar" ? " active" : ""}`} onClick={() => setMode("calendar")}>Calendar</button>
        </div>
        <span style={{ flex: 1 }} />
        {mode !== "calendar" && (
          <button className="sod-btn ready" disabled={!budgetValidity.ok}
            onClick={() => {
              const fw = firstWorkingDay(state.week.offDays);
              dispatch({ type: "START_WEEK", ...(fw !== undefined ? { firstWeekday: fw } : {}) });
            }}
            data-tip={budgetValidity.ok
              ? `Roll over to a new week — ${WD[firstWorkingDay(state.week.offDays) ?? todayWeekday]} is the first working day`
              : "Gated: every planned day must budget to exactly 24h (§11.2)"}>
            {started ? "Start New Week" : "Start Week"}
          </button>
        )}
      </div>

      <div className="config-body">
        {mode === "week" && (
          <div className="config-section">
            <p className="field-desc">
              {started
                ? `Week started; First Weekday ${state.week.firstWeekday !== null ? WD[state.week.firstWeekday] : "—"}. Structural changes are locked until an OFF day. This is the coming week (${rangeLabel()}).`
                : `No week started yet — plan freely, then Start Week. Coming week: ${rangeLabel()}.`}
            </p>
            <div className="config-subsection">
              <h4>OFF days <span className="field-desc">(weekend is always off; add more to lengthen it)</span></h4>
              <div className="type-chips" role="group" aria-label="OFF days">
                {WD.map((w, d) => {
                  const isWeekend = weekendDays.includes(d);
                  const isOff = state.week.offDays.includes(d) || isWeekend;
                  return (
                    <button key={d} type="button"
                      className={`type-chip${isOff ? " active" : ""}${isWeekend ? " locked" : ""}`}
                      data-status="semi-tail"
                      onClick={() => toggleOffDay(d)}
                      data-tip={isWeekend ? "Weekend — always off (change in Settings)" : isOff ? "OFF day — click to make it a working day" : "Working day — click to make it OFF"}>
                      {w}{isWeekend ? " ·" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {mode === "calendar" && (
          <div className="config-section">
            <div className="wk-cal-nav">
              <button className="link-btn" onClick={() => setWeekOff((w) => w - 1)} aria-label="Previous week">‹</button>
              <strong className="num">{rangeLabel()}</strong>
              <button className="link-btn" onClick={() => setWeekOff((w) => w + 1)} aria-label="Next week">›</button>
              {weekOff !== 0 && <button className="link-btn wk-today" onClick={() => setWeekOff(0)}>This week</button>}
            </div>
            <p className="field-desc">Attach one-off activities to a date, or click a recurring block to skip/move it on that day only. Dated activities in the coming week also show in Week Plan.</p>
          </div>
        )}

        {locked && (
          <div className="form-warning" role="status">
            <div>Mid-week structural planning is locked (the week is a commitment).</div>
            <label className="off-urgent">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent override
            </label>
          </div>
        )}

        {mode === "budget" && (
          <BudgetPanel state={state} dispatch={dispatch} locked={locked} urgent={urgent} todayWeekday={todayWeekday} onBack={onBack} />
        )}

        {mode !== "budget" && preview.conflicts.length > 0 && (
          <div className="form-warning" role="status">
            {preview.conflicts.map((c, i) => <div key={i}>⚠ {c}</div>)}
          </div>
        )}

        {mode !== "budget" && <div className="config-section">
          <div className="wk-section-head">
            <h3>{mode === "week" ? "The week, placed" : "The week"}</h3>
            {mode === "week" && (
              <button className="hist-add-btn" disabled={locked} onClick={() => setEditing("new")} data-tip={locked ? "Locked until an OFF day" : "Add a recurring task template"}>
                + Add template
              </button>
            )}
          </div>

          <WeekGridRBC
            preview={preview}
            weekStart={weekStart}
            weekendDays={weekendDays}
            offDays={state.week.offDays}
            hour12={hour12}
            today={midnightOf(toDate(state.now))}
            mode={mode}
            height={innerH + 56}
            onBlockClick={onBlockClick}
            onAddDated={(date) => setDatedEdit({ date, task: null })}
          />
          {mode === "week" && state.week.templates.length === 0 && (
            <span className="config-empty">no templates yet — add recurring tasks; they appear placed across the week here</span>
          )}
        </div>}
      </div>

      {editing && (
        <TemplateEditor template={editing === "new" ? null : editing} hour12={hour12} now={state.now} onSave={upsert} onDelete={removeTpl} onClose={() => setEditing(null)} />
      )}
      {datedEdit && (
        <DatedTaskEditor date={datedEdit.date} task={datedEdit.task} hour12={hour12}
          onSave={(t) => saveDated(datedEdit.date, t)} onDelete={(id) => deleteDated(datedEdit.date, id)} onClose={() => setDatedEdit(null)} />
      )}
      {tplMenu && (
        <TemplateDayMenu menu={tplMenu} skipped={entryFor(tplMenu.date).skips.includes(tplMenu.templateId)}
          template={state.week.templates.find((x) => x.id === tplMenu.templateId)}
          override={entryFor(tplMenu.date).overrides.find((o) => o.templateId === tplMenu.templateId)}
          hour12={hour12}
          onSkip={() => toggleSkip(tplMenu.date, tplMenu.templateId)}
          onSaveOverride={(ov) => saveOverride(tplMenu.date, tplMenu.templateId, ov)}
          structuralLock={structuralLock}
          onMove={() => { const t = state.week.templates.find((x) => x.id === tplMenu.templateId); if (t) setEditing(t); setTplMenu(null); }}
          onClose={() => setTplMenu(null)} />
      )}
    </div>
  );
}

/** Skip / move / resize a recurring template on ONE date (§4.6 — all three dated
 * powers). The move/resize fields edit a `TemplateOverride` written via SET_DATED
 * (never gated, §4.4); only the fields the template itself anchors/budgets are
 * shown, and Save stores just the DIFF from the template (nothing differs →
 * the override is cleared). "Edit template…" remains the structural escape. */
function TemplateDayMenu({ menu, skipped, template, override, hour12, structuralLock, onSkip, onSaveOverride, onMove, onClose }: {
  menu: { date: number; templateId: string; title: string };
  skipped: boolean;
  template: WeekTemplate | undefined;
  override: TemplateOverride | undefined;
  hour12: boolean;
  /** §4.4 mid-week lock: editing the TEMPLATE is structural (all weeks), unlike the
   * per-date skip/override. Without this gate the editor opened, saved, and the
   * reducer silently discarded the change (canPlanWeek) — closed as if saved. */
  structuralLock: boolean;
  onSkip: () => void;
  onSaveOverride: (ov: TemplateOverride | null) => void;
  onMove: () => void;
  onClose: () => void;
}): JSX.Element {
  useEscClose(onClose);
  const d = toDate(menu.date);
  // Drafts start at the EFFECTIVE value (override ?? template); undefined = inherit.
  const [start, setStart] = useState<number | undefined>(override?.anchorStartTod ?? template?.anchorStartTod);
  const [end, setEnd] = useState<number | undefined>(override?.anchorEndTod ?? template?.anchorEndTod);
  const [budget, setBudget] = useState<number | undefined>(override?.budget ?? template?.budget);
  const hasStart = template?.anchorStartTod !== undefined;
  const hasEnd = template?.anchorEndTod !== undefined;
  const hasBudget = template?.budget !== undefined;
  const movable = hasStart || hasEnd || hasBudget;
  const draft = template
    ? diffOverride(template, {
        ...(start !== undefined ? { anchorStartTod: start } : {}),
        ...(end !== undefined ? { anchorEndTod: end } : {}),
        ...(budget !== undefined ? { budget } : {}),
      })
    : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(override ?? null);
  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer eod-modal" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <h2>{menu.title} · {WD[d.getDay()]} {MONTHS[d.getMonth()]} {d.getDate()}</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <p className="field-desc">This recurring task, on this date only. Other weeks are untouched.</p>
          {movable && !skipped && (
            <div className="field">
              <label>On this day {override && <span className="badge head-badge">moved</span>}</label>
              <div className="wk-ov-fields">
                {hasStart && (
                  <label>Starts <TodField value={start} onChange={setStart} hour12={hour12} ariaLabel="Start on this day" /></label>
                )}
                {hasEnd && (
                  <label>Ends <TodField value={end} onChange={setEnd} hour12={hour12} ariaLabel="End on this day" /></label>
                )}
                {hasBudget && (
                  <label>Budget <DurInput value={budget} onCommit={(m) => setBudget(m ?? undefined)} ariaLabel="Budget on this day" min={5} /></label>
                )}
              </div>
              {override && (
                <button type="button" className="link-btn" onClick={() => onSaveOverride(null)}>Reset to the template's time</button>
              )}
            </div>
          )}
        </div>
        <div className="drawer-footer">
          {movable && !skipped && (
            <button className="primary" disabled={!dirty} onClick={() => onSaveOverride(draft)}
              data-tip={dirty ? "Apply on this date only" : "Nothing differs from the template yet"}>Save this day</button>
          )}
          <button className={movable && !skipped ? "cancel-accent" : "primary"} onClick={onSkip}>{skipped ? "Un-skip this day" : "Skip this day"}</button>
          <button className="cancel-accent" disabled={structuralLock} onClick={onMove}
            data-tip={structuralLock ? "Locked until an OFF day — the template rules every week (§4.4). Skip is still available." : "Open the recurring template (changes every week)"}>Edit template…</button>
          <span style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

/** Add/edit a one-off dated activity (§4.6). Like the template editor minus
 * recurrence — it is pinned to `date`. Smart-input on anchor time/budget. */
function DatedTaskEditor({ date, task, hour12, onSave, onDelete, onClose }: {
  date: number;
  task: DatedTask | null;
  hour12: boolean;
  onSave: (t: Omit<DatedTask, "id" | "rank"> & { id?: string; rank?: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  useEscClose(onClose);
  const isNew = task === null;
  const d = toDate(date);
  const sp = useTaskSpec(task ?? {});
  const [err, setErr] = useState<string | null>(null);

  const save = (): void => {
    const r = sp.resolve();
    if ("error" in r) return setErr(r.error);
    onSave({
      ...(task?.id ? { id: task.id, rank: task.rank } : {}),
      tier: task?.tier ?? "normal",
      ...r.spec,
    });
  };

  return (
    <div className="drawer-overlay">
      <div className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <h2>{isNew ? "Add activity" : "Edit activity"} · {WD[d.getDay()]} {MONTHS[d.getMonth()]} {d.getDate()}</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <TaskSpecFieldsView sp={sp} hour12={hour12} titlePlaceholder="e.g. Dentist, Wedding" />
          {err && <div className="form-warning" role="status">{err}</div>}
        </div>
        <div className="drawer-footer">
          <button className="primary" onClick={save}>{isNew ? "Add" : "Save"}</button>
          <button className="cancel-accent" onClick={onClose}>Cancel</button>
          <span style={{ flex: 1 }} />
          {!isNew && <button className="cancel-accent delete-btn" onClick={() => onDelete(task!.id)} data-tip="Delete activity">Delete</button>}
        </div>
      </div>
    </div>
  );
}

/** Add/edit one recurring template — smart-input on time/duration. */
function TemplateEditor({ template, hour12, now, onSave, onDelete, onClose }: {
  template: WeekTemplate | null;
  hour12: boolean;
  now: number;
  onSave: (t: WeekTemplate) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}): JSX.Element {
  useEscClose(onClose);
  const isNew = template === null;
  const sp = useTaskSpec(template ?? {});
  const [weekdays, setWeekdays] = useState<number[]>(template?.weekdays ?? [1, 2, 3, 4, 5]);
  const [err, setErr] = useState<string | null>(null);
  const toggleDay = (d: number): void => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  // §4.4 one-time/ranged validity. UI mode: every week / once / date range.
  const initialMode: "always" | "once" | "ranged" =
    template?.validity?.kind === "once" ? "once" : template?.validity?.kind === "ranged" ? "ranged" : "always";
  const [validMode, setValidMode] = useState<"always" | "once" | "ranged">(initialMode);
  const [rangeFrom, setRangeFrom] = useState<number | undefined>(template?.validity?.kind === "ranged" ? template.validity.from : undefined);
  const [rangeTo, setRangeTo] = useState<number | undefined>(template?.validity?.kind === "ranged" ? template.validity.to : undefined);
  // Preserve an already-fired once template's firedOn so editing it doesn't un-retire it.
  const priorFiredOn = template?.validity?.kind === "once" ? template.validity.firedOn : undefined;

  const buildValidity = (): WeekTemplate["validity"] => {
    if (validMode === "once") return { kind: "once", ...(priorFiredOn !== undefined ? { firedOn: priorFiredOn } : {}) };
    if (validMode === "ranged") return { kind: "ranged", ...(rangeFrom !== undefined ? { from: rangeFrom } : {}), ...(rangeTo !== undefined ? { to: rangeTo } : {}) };
    return undefined;
  };

  const save = (): void => {
    if (weekdays.length === 0) return setErr("Pick at least one weekday.");
    if (validMode === "ranged" && rangeFrom !== undefined && rangeTo !== undefined && rangeTo < rangeFrom)
      return setErr("The range's end is before its start.");
    const r = sp.resolve();
    if ("error" in r) return setErr(r.error);
    const validity = buildValidity();
    onSave({
      id: template?.id ?? `tpl-${Date.now().toString(36)}`,
      rank: template?.rank ?? "m",
      tier: template?.tier ?? "normal",
      weekdays: weekdays.slice().sort(),
      ...(validity !== undefined ? { validity } : {}),
      ...r.spec,
    });
  };

  return (
    <div className="drawer-overlay">
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="tpl-title">
        <div className="drawer-header">
          <h2 id="tpl-title">{isNew ? "Add template" : "Edit template"}</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <TaskSpecFieldsView sp={sp} hour12={hour12} titlePlaceholder="e.g. Standup, Gym" />
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
          <div className="field">
            <label>Recurrence <span className="hint-glyph" tabIndex={0} data-tip="Every week = recurs on its weekdays forever. Once = fires on the next matching day, then retires. Date range = only fires within the chosen dates (§4.4).">ⓘ</span></label>
            <div className="type-chips" role="radiogroup" aria-label="Recurrence">
              {(["always", "once", "ranged"] as const).map((m) => (
                <button key={m} type="button" className={`type-chip${validMode === m ? " active" : ""}`} data-status="budgeted" onClick={() => setValidMode(m)}>
                  {m === "always" ? "Every week" : m === "once" ? "Once" : "Date range"}
                </button>
              ))}
            </div>
            {validMode === "once" && priorFiredOn !== undefined && (
              <p className="field-desc">Already fired — retired. Switch to another mode to re-activate it.</p>
            )}
            {validMode === "ranged" && (
              <div className="wk-range">
                <label>From <DateField now={now} value={rangeFrom} onChange={setRangeFrom} ariaLabel="Range start date" /></label>
                <label>To <DateField now={now} value={rangeTo} onChange={setRangeTo} ariaLabel="Range end date" /></label>
              </div>
            )}
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
