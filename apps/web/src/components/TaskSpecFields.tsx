/**
 * Shared task-spec option fields (§7.0.5 UI symmetry — full New-Task option
 * parity on EVERY task create/edit surface, ruled 2026-07-16). These give the
 * week-plan template editor and the dated (Calendar) editor the same powers the
 * New Task drawer has, from ONE implementation:
 *
 *  - `TodField`   — a smart TIME-OF-DAY input (casual parse → snap → reformat on
 *                   blur) with the ±5-min stepper. No calendar: a recurring "9am"
 *                   anchor has no date (§7.0.5 exemption).
 *  - `PresetPills`— the Sleep / Nap / Food preset row (§2.9), pre-filling a
 *                   locked bundle (title / sub-head / head / sleepKind).
 *  - `TaskFlagsRow` — OMMF / slideable / breakable, guarded by the §2.5 validity
 *                   matrix (fixed → never slideable; budgeted → always slideable;
 *                   breakable only for a budgeted, non-ommf, non-preset task).
 *
 * The smart parsers (`parseTimeOfDay`) live ONLY inside shared field components
 * like this one (enforced by `smart-input-guard.test.ts`) so no surface can
 * hand-roll a raw time input that silently drops snap/steppers.
 */
import { useState } from "react";
import type { SleepKind, TimingType } from "@maxtellar/core";
import { parseTimeOfDay } from "../casualTime";
import { fmtTod, toDate } from "../time";
import { PRESETS, presetById } from "../presets";
import type { PresetId } from "../settings";
import { SubheadField } from "./SubheadField";
import { DurInput } from "./BudgetPanel";
import { DatePicker } from "./DatePicker";
import { StepperField } from "./StepperField";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Compact local date label for a local-midnight epoch-minute. */
function fmtDateLabel(dayMin: number): string {
  const d = toDate(dayMin);
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
}

/** Shared calendar DATE field (§7.0.5): a 📅 button showing the picked date (or
 * "Any"), opening the direction-aware DatePicker; clearable to leave the edge
 * open. Used for template validity ranges (§4.4). */
export function DateField({ now, value, onChange, ariaLabel, direction = "future" }: {
  now: number;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  ariaLabel: string;
  direction?: "future" | "past";
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="date-field">
      <button type="button" className="date-pick-btn num" aria-label={ariaLabel} onClick={() => setOpen(true)}>
        {value !== undefined ? fmtDateLabel(value) : "Any"} <span aria-hidden>📅</span>
      </button>
      {value !== undefined && (
        <button type="button" className="clear-btn" tabIndex={-1} aria-label={`Clear ${ariaLabel}`} onClick={() => onChange(undefined)}>&times;</button>
      )}
      {open && (
        <DatePicker now={now} direction={direction} onPick={(d) => { onChange(d); setOpen(false); }} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/** Smart time-of-day field (0..1439) + ±5-min stepper. `value`/`onChange` in
 * minutes-into-day; empty is `undefined`. */
export function TodField({ value, onChange, hour12, ariaLabel, disabled }: {
  value: number | undefined;
  onChange: (tod: number | undefined) => void;
  hour12: boolean;
  ariaLabel: string;
  disabled?: boolean;
}): JSX.Element {
  const str = value !== undefined ? fmtTod(value, hour12) : "";
  // Draft text is local (type freely); the model commits on blur/Enter. Re-sync
  // whenever the committed value reformats underneath us.
  const [draft, setDraft] = useState(str);
  const [prev, setPrev] = useState(str);
  if (str !== prev) { setPrev(str); setDraft(str); }
  const commit = (): void => {
    const t = parseTimeOfDay(draft);
    const next = t ? t.hour * 60 + t.min : undefined;
    onChange(next);
    setDraft(next !== undefined ? fmtTod(next, hour12) : "");
  };
  const nudge = (dir: 1 | -1): void => {
    if (disabled) return;
    const base = value ?? 9 * 60;
    onChange((((base + dir * 5) % 1440) + 1440) % 1440);
  };
  // No date on a recurring time-of-day anchor → no calendar (§7.0.5 exemption).
  return (
    <StepperField
      text={draft}
      onText={setDraft}
      onCommit={commit}
      onStep={nudge}
      ariaLabel={ariaLabel}
      disabled={disabled}
      placeholder="e.g. 9am, 14:30"
    />
  );
}

/** §2.9 preset pill row. `active` = the selected preset id (null = none, which
 * IS "ordinary" — there is no ordinary pill). Toggling re-taps the active pill. */
export function PresetPills({ active, onToggle, autoId }: {
  active: PresetId | null;
  onToggle: (id: PresetId) => void;
  /** The preset that was auto-selected from the title (§2.9) — tagged "auto" so
   * the user can see it wasn't their pick. Null when the choice was the user's
   * (source ≠ value: an accepted suggestion is the user's, never app-owned). */
  autoId?: PresetId | null;
}): JSX.Element {
  return (
    <div className="hint-row">
      <div className="type-chips" role="radiogroup" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`type-chip${p.id === active ? " active" : ""}`}
            data-status="semi-tail"
            onClick={() => onToggle(p.id)}
          >
            {p.label}
            {p.id === active && p.id === autoId && (
              <span className="ml-tag ml-tag-auto" data-tip="Auto-selected from your title — tap the pill to undo">auto</span>
            )}
          </button>
        ))}
      </div>
      <span className="hint-glyph" tabIndex={0} aria-label="Presets help" data-tip="Sleep / Nap / Food pre-fill a locked bundle; typing a matching title selects one automatically (§2.9)">ⓘ</span>
    </div>
  );
}

export interface TaskFlags {
  ommf: boolean;
  slideable: boolean;
  breakable: boolean;
}

/** §2.5 validity-matrix-guarded flags row. Effective values are derived from the
 * timing type + preset (the same rules the drawer and the reducer enforce), so
 * the checkboxes can never persist an invalid combination. */
export function TaskFlagsRow({ timing, flags, presetActive, onChange }: {
  timing: TimingType;
  flags: TaskFlags;
  presetActive?: boolean;
  onChange: (next: TaskFlags) => void;
}): JSX.Element {
  const slideable = timing === "fixed" ? false : timing === "budgeted" ? true : flags.slideable;
  const breakable = presetActive ? false : timing === "budgeted" && !flags.ommf ? flags.breakable : false;
  const set = (patch: Partial<TaskFlags>): void => onChange({ ommf: flags.ommf, slideable, breakable, ...patch });
  return (
    <div className="hint-row">
      <div className="flag-row">
        <label className="flag" data-tip="Once missed, missed forever — the task perishes if its moment passes">
          <input type="checkbox" checked={flags.ommf}
            onChange={(e) => onChange({ ommf: e.target.checked, slideable, breakable: e.target.checked ? false : breakable })} />
          OMMF
        </label>
        <label className="flag" data-tip={timing === "fixed" ? "Fixed tasks never slide" : timing === "budgeted" ? "Budgeted tasks always slide" : "The scheduler may move this task later"}>
          <input type="checkbox" checked={slideable}
            disabled={timing === "fixed" || timing === "budgeted"}
            onChange={(e) => set({ slideable: e.target.checked })} />
          slideable
        </label>
        <label className="flag" data-tip={presetActive ? "Presets are never split by the scheduler" : flags.ommf ? "OMMF tasks can never be split" : timing !== "budgeted" ? "Only budgeted tasks can be split" : "The scheduler may split this task into segments"}>
          <input type="checkbox" checked={breakable}
            disabled={presetActive || timing !== "budgeted" || flags.ommf}
            onChange={(e) => set({ breakable: e.target.checked })} />
          breakable
        </label>
      </div>
      <span className="hint-glyph" tabIndex={0} aria-label="Flags help" data-tip="Flags derive from the timing type; editable within the validity rules">ⓘ</span>
    </div>
  );
}

/** Resolve the effective (validity-clamped) flags for persisting a spec. */
export function effectiveFlags(timing: TimingType, flags: TaskFlags, presetActive: boolean): TaskFlags {
  return {
    ommf: flags.ommf,
    slideable: timing === "fixed" ? false : timing === "budgeted" ? true : flags.slideable,
    breakable: presetActive ? false : timing === "budgeted" && !flags.ommf ? flags.breakable : false,
  };
}

/* ----- shared task-spec editor state + view (template + dated editors) ----- */

/**
 * The ONE timing-type list (§7.0.6). Its ORDER is part of its identity — the
 * same set in another order on another surface is a break, which is exactly how
 * the template drawer drifted from New Task (this list used to be declared here
 * reversed, and again in TaskDrawer as `ALL_TIMINGS`). The New Task drawer is
 * canonical (§7.0.6.3), so this is its order. Import it — never re-declare it.
 */
export const TIMINGS: TimingType[] = ["unscheduled", "budgeted", "semi-head", "semi-tail", "fixed"];

export type FieldRole = "required" | "optional" | "not used";

/**
 * The ONE per-type role table for the time fields (§7.0.6). Drives the dynamic
 * labels AND validation, so a surface can't disagree with the scheduler about
 * what a type needs.
 *
 * This existed TWICE and had already drifted *semantically* (found 2026-07-17):
 * TaskDrawer's `FIELD_ROLES` called a semi-head's budget "not used", while
 * `useTaskSpec` REQUIRED one for the same type. Both were wrong — §3.9 defines a
 * "budget-less open task (unscheduled, or a semi-head/semi-tail **with no
 * budget**)", so a semi-head/semi-tail budget is **optional**: allowed, never
 * demanded. Fixed derives its budget from start+end (any two give the third).
 */
export const FIELD_ROLES: Record<TimingType, { start: FieldRole; end: FieldRole; budget: FieldRole }> = {
  unscheduled: { start: "not used", end: "not used", budget: "not used" },
  budgeted: { start: "not used", end: "not used", budget: "required" },
  "semi-head": { start: "required", end: "not used", budget: "optional" },
  "semi-tail": { start: "not used", end: "required", budget: "optional" },
  fixed: { start: "required", end: "required", budget: "required" },
};

/**
 * Role-labelled wrapper for one time/budget field (§7.0.6) — the ONE definition
 * of the dynamic label, required-dot and tip that every surface shows. All three
 * fields are ALWAYS rendered (dimmed when "not used" via `.role-not-used`), so
 * the row of fields never jumps as the type changes — New Task's behaviour,
 * which the template editor had drifted from by rendering them conditionally.
 */
export function RoleField({ name, timing, field, hint, children }: {
  name: string;
  timing: TimingType;
  field: "start" | "end" | "budget";
  /** Surface-specific casual-input example (a template anchor has no date). */
  hint?: string;
  children: JSX.Element;
}): JSX.Element {
  const role = FIELD_ROLES[timing][field];
  return (
    <div className={`field role-${role.replace(" ", "-")}`}>
      <label data-tip={`For the ${timing} type this field is ${role}.${hint ? ` ${hint}` : ""}`}>
        {name}
        {role === "required" && <span className="req-dot" aria-label="required">•</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * The ONE common task-options section (§7.0.6, ruled 2026-07-17): everything
 * from the timing types down to the flags, in the CANONICAL order —
 * timing types → presets → title → sub-head → start → end → budget → flags.
 *
 * Every task create/edit surface composes this, so the sequence cannot drift
 * again (the Add-template drawer had a different order AND was missing Start/End
 * entirely). A surface's EXCLUSIVE fields go AFTER this section — never
 * interleaved into it.
 *
 * The section owns the parts that are genuinely identical everywhere (the chip
 * row, the pills, the flags) and takes SLOTS for the parts whose semantics
 * legitimately differ per surface: New Task's start/end are casual date-times
 * ("tom 7am"), while a recurring template's are time-of-day anchors with no date
 * at all (§7.0.5 exemption). Slots keep that difference honest instead of
 * pretending one component fits both.
 */
export function TaskOptionsSection({
  timing, onTiming, preset, onTogglePreset, presetAutoId,
  title, subhead, start, end, budget, flags, onFlags,
}: {
  timing: TimingType;
  onTiming: (t: TimingType) => void;
  preset: PresetId | null;
  onTogglePreset: (id: PresetId) => void;
  presetAutoId?: PresetId | null;
  title: JSX.Element;
  subhead: JSX.Element;
  start: JSX.Element;
  end: JSX.Element;
  budget: JSX.Element;
  flags: TaskFlags;
  onFlags: (next: TaskFlags) => void;
}): JSX.Element {
  return (
    <>
      <TimingTypeChips value={timing} onChange={onTiming} />
      <div className="field">
        <label>Presets</label>
        <PresetPills active={preset} onToggle={onTogglePreset} autoId={presetAutoId ?? null} />
      </div>
      {title}
      {subhead}
      {start}
      {end}
      {budget}
      <div className="field">
        <label>Flags</label>
        <TaskFlagsRow timing={timing} flags={flags} presetActive={preset !== null} onChange={onFlags} />
      </div>
    </>
  );
}

/**
 * The ONE timing-type chip row (§7.0.6), including its "Timing types" heading —
 * ruled 2026-07-16: the heading is shown on EVERY surface that offers the types,
 * so a surface can't render the row bare (New Task used to). Composed by the New
 * Task drawer and every other task spec editor; never re-implemented.
 */
export function TimingTypeChips({ value, onChange }: {
  value: TimingType;
  onChange: (t: TimingType) => void;
}): JSX.Element {
  return (
    <div className="field">
      <label>Timing types</label>
      <div className="hint-row">
        <div className="type-chips" role="radiogroup" aria-label="Timing type">
          {TIMINGS.map((t) => (
            <button
              key={t}
              type="button"
              className={`type-chip${t === value ? " active" : ""}`}
              data-status={t}
              onClick={() => onChange(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="hint-glyph" tabIndex={0} aria-label="Timing type help" data-tip="Tap a type to pre-fill its fields, or just fill the time fields and the type derives itself">ⓘ</span>
      </div>
    </div>
  );
}

/** The common task-spec fields shared by every spec editor (§7.0.5 parity). */
export interface TaskSpecInit {
  title?: string;
  activityId?: string;
  headId?: string;
  timing?: TimingType;
  budget?: number;
  anchorStartTod?: number;
  anchorEndTod?: number;
  ommf?: boolean;
  slideable?: boolean;
  breakable?: boolean;
  sleepKind?: SleepKind;
}

export interface ResolvedSpec {
  title: string;
  headId: string;
  activityId: string;
  timing: TimingType;
  ommf: boolean;
  slideable: boolean;
  breakable: boolean;
  budget?: number;
  anchorStartTod?: number;
  anchorEndTod?: number;
  sleepKind?: SleepKind;
}

/** All the common New-Task options as ONE hook — timing, presets, flags, and
 * the smart time/budget fields — so every task-spec editor gets full parity by
 * construction (§7.0.5). Callers add only their own extras (weekdays / date /
 * recurrence) and a footer. */
export function useTaskSpec(initial: TaskSpecInit) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [activity, setActivity] = useState(initial.activityId ?? "");
  const [head, setHead] = useState<string | undefined>(initial.headId);
  const [timing, setTiming] = useState<TimingType>(initial.timing ?? "budgeted");
  const [startTod, setStartTod] = useState<number | undefined>(initial.anchorStartTod);
  const [endTod, setEndTod] = useState<number | undefined>(initial.anchorEndTod);
  const [budget, setBudget] = useState<number | undefined>(initial.budget);
  const [flags, setFlags] = useState<TaskFlags>({
    ommf: initial.ommf ?? false,
    slideable: initial.slideable ?? true,
    breakable: initial.breakable ?? false,
  });
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [sleepKind, setSleepKind] = useState<SleepKind | undefined>(initial.sleepKind);

  // Derived from the ONE role table (§7.0.6) — never a second opinion on what a
  // type needs. "need*" = REQUIRED; an "optional" field is still offered and
  // captured if filled (a semi-head may have a budget, §3.9), just not demanded.
  const roles = FIELD_ROLES[timing];
  const needStart = roles.start === "required";
  const needEnd = roles.end === "required";
  const needBudget = roles.budget === "required";

  const togglePreset = (id: PresetId): void => {
    if (preset === id) { setPreset(null); setSleepKind(undefined); return; }
    const p = presetById(id);
    setPreset(id);
    setTitle(p.title);
    setActivity(p.subhead);
    setHead(p.head);
    setSleepKind(p.sleepKind);
    setFlags((f) => ({ ...f, breakable: false }));
  };

  const resolve = (): { spec: ResolvedSpec } | { error: string } => {
    if (!title.trim()) return { error: "Give it a title." };
    if (!activity.trim() || !head) return { error: "Pick a sub-head." };
    // "not used" → dropped; "optional" → kept when filled; "required" → demanded.
    const start = roles.start !== "not used" ? startTod : undefined;
    const end = roles.end !== "not used" ? endTod : undefined;
    if (needStart && start === undefined) return { error: "Enter a valid start time." };
    if (needEnd && end === undefined) return { error: "Enter a valid end time." };
    let b = roles.budget !== "not used" ? budget : undefined;
    if (timing === "fixed" && start !== undefined && end !== undefined) {
      b = ((end - start) % 1440 + 1440) % 1440 || 1440; // overnight-safe span
    }
    if (needBudget && (b === undefined || b <= 0)) return { error: "Enter a valid budget." };
    const eff = effectiveFlags(timing, flags, preset !== null);
    return {
      spec: {
        title: title.trim(),
        headId: head,
        activityId: activity.trim(),
        timing,
        ommf: eff.ommf,
        slideable: eff.slideable,
        breakable: eff.breakable,
        ...(b !== undefined ? { budget: b } : {}),
        ...(start !== undefined ? { anchorStartTod: start } : {}),
        ...(end !== undefined ? { anchorEndTod: end } : {}),
        ...(sleepKind ? { sleepKind } : {}),
      },
    };
  };

  return {
    title, setTitle, activity, setActivity, head, setHead, timing, setTiming,
    startTod, setStartTod, endTod, setEndTod, budget, setBudget,
    flags, setFlags, preset, togglePreset, sleepKind,
    needStart, needEnd, needBudget, resolve,
  };
}

export type TaskSpecState = ReturnType<typeof useTaskSpec>;

/** Renders the shared New-Task options block from a `useTaskSpec` state — full
 * parity on every surface, one implementation.
 *
 * The sequence below is CANONICAL (§7.0.6.3, ruled 2026-07-16): timing types →
 * presets → title → sub-head → start/end/budget → flags. It is the New Task
 * drawer's order, which every task surface conforms to. A surface's EXCLUSIVE
 * fields go AFTER this block — never interleaved into it. This view had drifted
 * (title first, timing fourth) until the user caught it. */
export function TaskSpecFieldsView({ sp, hour12, titlePlaceholder }: {
  sp: TaskSpecState;
  hour12: boolean;
  titlePlaceholder?: string;
}): JSX.Element {
  // A recurring anchor is a time of day with no date (§7.0.5 exemption) — hence
  // TodField, not the drawer's casual date-time. Everything else is the shared
  // section, so the order and chrome cannot drift from New Task.
  const anchorHint = 'Type casually ("9am", "14:30") — it formats on blur.';
  return (
    <TaskOptionsSection
      timing={sp.timing}
      onTiming={sp.setTiming}
      preset={sp.preset}
      onTogglePreset={sp.togglePreset}
      flags={sp.flags}
      onFlags={sp.setFlags}
      title={
        <div className="field">
          <label>Title <span className="req-dot" aria-label="required">•</span></label>
          <div className="clearable-field">
            <input value={sp.title} aria-label="Title" onChange={(e) => sp.setTitle(e.target.value)} placeholder={titlePlaceholder ?? "e.g. Standup, Gym"} autoFocus />
          </div>
        </div>
      }
      subhead={
        <div className="field">
          <label>Sub-head <span className="req-dot" aria-label="required">•</span></label>
          <SubheadField activity={sp.activity} onActivity={sp.setActivity} onHead={sp.setHead} title={sp.title} />
        </div>
      }
      start={
        <RoleField name="Start (time of day)" timing={sp.timing} field="start" hint={anchorHint}>
          <TodField value={sp.startTod} onChange={sp.setStartTod} hour12={hour12} ariaLabel="Start time of day" />
        </RoleField>
      }
      end={
        <RoleField name="End (time of day)" timing={sp.timing} field="end" hint={anchorHint}>
          <TodField value={sp.endTod} onChange={sp.setEndTod} hour12={hour12} ariaLabel="End time of day" />
        </RoleField>
      }
      budget={
        <RoleField name="Budget" timing={sp.timing} field="budget">
          <DurInput value={sp.budget} ariaLabel="Budget" min={1} onCommit={(m) => sp.setBudget(m ?? undefined)} allowEmpty />
        </RoleField>
      }
    />
  );
}
