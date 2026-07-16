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
import type { EndDayOffset, SleepKind, TimingType } from "@maxtellar/core";
import { parseTimeOfDay, parseAnchorEnd } from "../casualTime";
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

/**
 * §4.4 end-day offset: 0 = same day, 1 = next day. **Capped at 1 — planning is
 * for no more than 24 hours** (ruled 2026-07-17; supersedes the same-day +6
 * range, which was wrong: a plan never reaches past tomorrow's clock).
 */
export const MAX_END_DAY_OFFSET = 1;
/** §4.4 a planned task spans at most 24 hours. */
export const MAX_SPAN_MIN = 1440;
export const clampDayOffset = (d: number): EndDayOffset =>
  (Math.max(0, Math.min(MAX_END_DAY_OFFSET, Math.round(d))) as EndDayOffset);

/** "same day" / "next day" / "+2 days"… — one label set, used wherever the
 * offset is shown (§7.0.6). */
export function dayOffsetLabel(d: number): string {
  return d === 1 ? "Next Day" : "Same Day";
}

/**
 * §4.4/§7.0.2 — the offset the entered times IMPLY. An end at or before the
 * start with the offset still on "same day" can only mean the next day; that
 * used to be assumed silently, and is now snapped AND shown (the "auto" tag), so
 * the user sees the correction and can override it. Any explicit offset wins.
 */
export function impliedEndDayOffset(
  offset: EndDayOffset,
  startTod: number | undefined,
  endTod: number | undefined,
): EndDayOffset {
  return offset === 0 && startTod !== undefined && endTod !== undefined && endTod <= startTod
    ? 1
    : offset;
}

/**
 * §4.4 span implied by a start, an end and the end's day offset. `undefined`
 * when the span isn't a valid plan: never zero/negative, and **never more than
 * 24 hours** — planning doesn't reach further than that. So "next day" only
 * resolves when the end sits at/before the start (11pm → 7am = 8h); a "next day"
 * end AFTER the start would be a 24h+ span, which is not a plan.
 */
export function spanOfAnchors(
  startTod: number | undefined,
  endTod: number | undefined,
  offset: number,
): number | undefined {
  if (startTod === undefined || endTod === undefined) return undefined;
  const raw = offset * 1440 + endTod - startTod;
  return raw > 0 && raw <= MAX_SPAN_MIN ? raw : undefined;
}

/** §4.4 the END anchor as text: "Next Day, 10:00 AM", or just "10:00 AM" when it
 * lands the same day. Round-trips through `parseAnchorEnd`, so what the field
 * shows is always something the field accepts (a smart-input requirement). */
export function fmtAnchorEnd(
  tod: number | undefined,
  dayOffset: EndDayOffset,
  hour12: boolean,
): string {
  // Picking "Next Day" before typing a time leaves the qualifier WAITING for it
  // ("Next Day, ") rather than inventing a time the user never chose — the app
  // never fills a value the user didn't pick.
  if (tod === undefined) return dayOffset === 1 ? "Next Day, " : "";
  return dayOffset === 1 ? `Next Day, ${fmtTod(tod, hour12)}` : fmtTod(tod, hour12);
}

/**
 * §4.4 END anchor field — the time AND the day it lands on, in one smart input.
 *
 * A template has no date (§7.0.5), so instead of a calendar it offers the only
 * choice that exists: same day or next day (planning stops at 24h). Two ways in,
 * both equal — type it (`"next day, 11am"`, `"tomorrow 7:30"`, `"+1d 6am"`, and
 * every variation `parseAnchorEnd` knows), or pick it from the 🌙 button. Either
 * way the field reformats to the explicit `"Next Day, 11:00 AM"` on blur, so the
 * day is never implicit.
 */
export function AnchorEndField({ tod, dayOffset, onChange, hour12 }: {
  tod: number | undefined;
  dayOffset: EndDayOffset;
  onChange: (next: { tod: number | undefined; dayOffset: EndDayOffset }) => void;
  hour12: boolean;
}): JSX.Element {
  const str = fmtAnchorEnd(tod, dayOffset, hour12);
  const [draft, setDraft] = useState(str);
  const [prev, setPrev] = useState(str);
  const [pick, setPick] = useState(false);
  if (str !== prev) { setPrev(str); setDraft(str); }

  const commit = (): void => {
    if (!draft.trim()) { onChange({ tod: undefined, dayOffset: 0 }); setDraft(""); return; }
    const r = parseAnchorEnd(draft);
    if (!r) {
      // A lone qualifier ("Next Day,") isn't nonsense — it's a chosen day still
      // waiting for its time. Keep it; only real garbage snaps back.
      const bare = parseAnchorEnd(`${draft} 12pm`);
      if (bare) { onChange({ tod: undefined, dayOffset: bare.dayOffset }); setDraft(fmtAnchorEnd(undefined, bare.dayOffset, hour12)); return; }
      setDraft(str);
      return;
    }
    onChange({ tod: r.tod, dayOffset: r.dayOffset });
    setDraft(fmtAnchorEnd(r.tod, r.dayOffset, hour12));
  };
  const nudge = (dir: 1 | -1): void => {
    const base = tod ?? 9 * 60;
    const next = base + dir * 5;
    // Nudging past midnight moves the END onto the next day (and back again) —
    // the day is part of this field's value, so the stepper carries it too.
    const wrapped = ((next % 1440) + 1440) % 1440;
    const carried: EndDayOffset = next >= 1440 ? 1 : next < 0 ? 0 : dayOffset;
    onChange({ tod: wrapped, dayOffset: carried });
  };
  // Picking a day sets ONLY the day. With no time yet the field becomes
  // "Next Day, " and waits — it never invents a time on the user's behalf.
  const choose = (d: EndDayOffset): void => {
    setPick(false);
    onChange({ tod, dayOffset: d });
  };

  return (
    <div className="anchor-end">
      <StepperField
        text={draft}
        onText={setDraft}
        onCommit={commit}
        onStep={nudge}
        ariaLabel="End time of day"
        placeholder='e.g. 7am, or "next day, 7am"'
        calendar={{
          onOpen: () => setPick((p) => !p),
          ariaLabel: "Choose the end day",
          tip: 'Which day the end lands on. You can also just type it — "next day, 7am".',
        }}
      />
      {pick && (
        <div className="day-menu" role="menu" aria-label="End day">
          {([0, 1] as EndDayOffset[]).map((d) => (
            <button
              key={d}
              type="button"
              role="menuitemradio"
              aria-checked={d === dayOffset}
              className={`day-menu-item${d === dayOffset ? " active" : ""}`}
              onClick={() => choose(d)}
            >
              {dayOffsetLabel(d)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** §6 type-morph prefill: tapping a timing type pre-fills its fields. ONE value,
 * shared with the New Task drawer — 30 minutes. */
export const DEFAULT_BUDGET = 30;
/** A template has no `now` to anchor to (it repeats), so its default anchor is a
 * plain 9am — the drawer's `now` twin in time-of-day space. */
export const DEFAULT_ANCHOR_TOD = 9 * 60;

/** Split an absolute minutes-from-fired-day value back into tod + day offset. */
function splitDay(total: number): { tod: number; dayOffset: EndDayOffset } {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { tod: wrapped, dayOffset: total >= 1440 ? 1 : 0 };
}

/**
 * §6 type-morph prefill — the fields a timing type starts with. The New Task
 * drawer's `shapeTo`, in time-of-day space: budget 30m, anchors at the default
 * 9am (a template has no `now`). Pure, so it seeds BOTH a fresh editor and a
 * later type change — a new template opens with a usable draft, not blanks.
 */
export function morphDefaults(t: TimingType): {
  startTod: number | undefined; endTod: number | undefined;
  endDayOffset: EndDayOffset; budget: number | undefined;
} {
  if (t === "budgeted") return { startTod: undefined, endTod: undefined, endDayOffset: 0, budget: DEFAULT_BUDGET };
  if (t === "semi-head") return { startTod: DEFAULT_ANCHOR_TOD, endTod: undefined, endDayOffset: 0, budget: undefined };
  if (t === "semi-tail") return { startTod: undefined, endTod: DEFAULT_ANCHOR_TOD + DEFAULT_BUDGET, endDayOffset: 0, budget: undefined };
  if (t === "fixed") {
    const d = splitDay(DEFAULT_ANCHOR_TOD + DEFAULT_BUDGET);
    return { startTod: DEFAULT_ANCHOR_TOD, endTod: d.tod, endDayOffset: d.dayOffset, budget: DEFAULT_BUDGET };
  }
  return { startTod: undefined, endTod: undefined, endDayOffset: 0, budget: undefined };
}

/**
 * §3.6 the 3→1 law, in TIME-OF-DAY space — the template's twin of the New Task
 * drawer's day-aware trio. **Any two of start / end / budget derive the third.**
 * The field the user just changed is authoritative; a second present field
 * derives the third.
 *
 * This is the drawer's law, not a new one (§7.0.6: the same rule may not have two
 * implementations). It differs only in coordinates: the drawer works in absolute
 * epoch minutes anchored to `now`, a template in minutes-into-the-day anchored to
 * the day it fires — so the END carries a day offset instead of a date, and the
 * whole span is capped at 24h (planning reaches no further).
 */
export function deriveAnchorTrio(
  changed: "start" | "end" | "budget",
  v: { startTod?: number | undefined; endTod?: number | undefined; endDayOffset: EndDayOffset; budget?: number | undefined },
): { startTod: number | undefined; endTod: number | undefined; endDayOffset: EndDayOffset; budget: number | undefined } {
  let { startTod, endTod, budget } = v;
  let endDayOffset = v.endDayOffset;
  const endAbs = (): number | undefined =>
    endTod === undefined ? undefined : endDayOffset * 1440 + endTod;

  if (changed === "start" && startTod !== undefined) {
    if (budget !== undefined) {
      const d = splitDay(startTod + budget);
      endTod = d.tod; endDayOffset = d.dayOffset;
    } else if (endTod !== undefined) {
      budget = spanOfAnchors(startTod, endTod, endDayOffset);
    }
  } else if (changed === "end" && endTod !== undefined) {
    if (startTod !== undefined) {
      budget = spanOfAnchors(startTod, endTod, endDayOffset);
    } else if (budget !== undefined) {
      startTod = splitDay(endAbs()! - budget).tod;
    }
  } else if (changed === "budget" && budget !== undefined) {
    if (startTod !== undefined) {
      const d = splitDay(startTod + budget);
      endTod = d.tod; endDayOffset = d.dayOffset;
    } else if (endTod !== undefined) {
      startTod = splitDay(endAbs()! - budget).tod;
    }
  }
  return { startTod, endTod, endDayOffset, budget };
}

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
  /** §4.4 overnight span — 0 = same day, 1 = next day (the 24h ceiling). */
  anchorEndDayOffset?: EndDayOffset;
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
  /** §4.4 overnight span — omitted when 0 (same day). */
  anchorEndDayOffset?: EndDayOffset;
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
  // §6 a NEW editor opens pre-filled for its type (budgeted → 30m), exactly like
  // New Task — never a row of blanks. An EXISTING spec's own values always win.
  // Only a NEW editor gets the prefill; an existing spec is shown as it is, and
  // its own values always win (an empty field on a saved spec means "empty").
  const seed = initial.timing === undefined
    ? morphDefaults("budgeted")
    : { startTod: undefined, endTod: undefined, endDayOffset: 0 as EndDayOffset, budget: undefined };
  const [startTod, setStartTod] = useState<number | undefined>(initial.anchorStartTod ?? seed.startTod);
  const [endTod, setEndTod] = useState<number | undefined>(initial.anchorEndTod ?? seed.endTod);
  // §4.4 multi-day span: which day the END anchor lands on (0 = same day).
  const [endDayOffset, setEndDayOffsetRaw] = useState<EndDayOffset>(initial.anchorEndDayOffset ?? seed.endDayOffset);
  const [budget, setBudget] = useState<number | undefined>(initial.budget ?? seed.budget);
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

  // §7.0.2 snap-at-entry: correct an out-of-range offset AT the boundary.
  const setEndDayOffset = (d: number): void => setEndDayOffsetRaw(clampDayOffset(d));

  /**
   * §3.6 3→1 derivation — the drawer's law, same behaviour here (§7.0.5 parity).
   * Editing any one of start/end/budget derives the third from whichever other
   * field is already set, instead of leaving the user to do the arithmetic.
   */
  const applyTrio = (changed: "start" | "end" | "budget", patch: {
    startTod?: number | undefined; endTod?: number | undefined;
    endDayOffset?: EndDayOffset; budget?: number | undefined;
  }): void => {
    const next = deriveAnchorTrio(changed, {
      startTod: "startTod" in patch ? patch.startTod : startTod,
      endTod: "endTod" in patch ? patch.endTod : endTod,
      endDayOffset: patch.endDayOffset ?? endDayOffset,
      budget: "budget" in patch ? patch.budget : budget,
    });
    setStartTod(next.startTod);
    setEndTod(next.endTod);
    setEndDayOffsetRaw(next.endDayOffset);
    setBudget(next.budget);
  };
  const changeStart = (tod: number | undefined): void => applyTrio("start", { startTod: tod });
  const changeEnd = (e: { tod: number | undefined; dayOffset: EndDayOffset }): void =>
    applyTrio("end", { endTod: e.tod, endDayOffset: e.dayOffset });
  const changeBudget = (b: number | undefined): void => applyTrio("budget", { budget: b });

  /**
   * §6 type-morph prefill — tapping a type pre-fills its fields, exactly as the
   * New Task drawer does (budget 30m; anchors at the default 9am instead of the
   * drawer's `now`, since a template has no `now`). Without this the template
   * editor handed back empty fields where New Task handed back a usable draft.
   */
  const morphTo = (t: TimingType): void => {
    setTiming(t);
    const d = morphDefaults(t);
    setStartTod(d.startTod);
    setEndTod(d.endTod);
    setEndDayOffsetRaw(d.endDayOffset);
    setBudget(d.budget);
  };
  /** The offset these times IMPLY — snapped and shown, never assumed silently. */
  const impliedOffset = (): EndDayOffset => impliedEndDayOffset(endDayOffset, startTod, endTod);

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
    // §4.4: the end may land on a later day — the span follows the OFFSET, not an
    // implicit overnight guess. `impliedEndDayOffset` snaps a same-day end that
    // sits at/before the start to "next day" (announced by the editor).
    const off = impliedOffset();
    let b = roles.budget !== "not used" ? budget : undefined;
    if (timing === "fixed" && start !== undefined && end !== undefined) {
      const span = spanOfAnchors(start, end, off);
      if (span === undefined) return { error: "A planned task spans at most 24 hours — check the start, the end and its day." };
      b = span;
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
        // Only meaningful with an end; 0 is the default, so don't persist noise.
        ...(end !== undefined && off > 0 ? { anchorEndDayOffset: off } : {}),
        ...(sleepKind ? { sleepKind } : {}),
      },
    };
  };

  return {
    title, setTitle, activity, setActivity, head, setHead, timing,
    // §6 type-morph: setting the type pre-fills its fields, like the drawer.
    setTiming: morphTo,
    startTod, endTod, budget,
    // §3.6 3→1: these derive the third field, they don't just assign.
    setStartTod: changeStart, setEndTod: changeEnd, setBudget: changeBudget,
    endDayOffset, setEndDayOffset, impliedOffset,
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
        <RoleField
          name="End"
          timing={sp.timing}
          field="end"
          hint='Type casually — "7am", or "next day, 7am" when it runs past midnight.'
        >
          <AnchorEndField
            tod={sp.endTod}
            dayOffset={sp.endDayOffset}
            hour12={hour12}
            onChange={sp.setEndTod}
          />
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
