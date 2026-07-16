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
import { fmtTod } from "../time";
import { PRESETS, presetById } from "../presets";
import type { PresetId } from "../settings";
import { SubheadField } from "./SubheadField";
import { DurInput } from "./BudgetPanel";

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
  const commit = (raw: string): void => {
    const t = parseTimeOfDay(raw);
    onChange(t ? t.hour * 60 + t.min : undefined);
  };
  const nudge = (dir: 1 | -1): void => {
    if (disabled) return;
    const base = value ?? 9 * 60;
    onChange((((base + dir * 5) % 1440) + 1440) % 1440);
  };
  // Uncontrolled-on-type, snap-on-blur: mirror the drawer's commit discipline.
  return (
    <div className="time-stepper">
      <input
        className="num"
        defaultValue={str}
        key={str}
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder="e.g. 9am, 14:30"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit((e.target as HTMLInputElement).value); } }}
      />
      <div className="time-stepper-btns">
        <button type="button" tabIndex={-1} aria-label={`Increase ${ariaLabel}`} disabled={disabled} onClick={() => nudge(1)}>▴</button>
        <button type="button" tabIndex={-1} aria-label={`Decrease ${ariaLabel}`} disabled={disabled} onClick={() => nudge(-1)}>▾</button>
      </div>
    </div>
  );
}

/** §2.9 preset pill row. `active` = the selected preset id (null = none, which
 * IS "ordinary" — there is no ordinary pill). Toggling re-taps the active pill. */
export function PresetPills({ active, onToggle }: {
  active: PresetId | null;
  onToggle: (id: PresetId) => void;
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
          </button>
        ))}
      </div>
      <span className="hint-glyph" tabIndex={0} aria-label="Presets help" data-tip="Sleep / Nap / Food pre-fill a locked bundle (§2.9)">ⓘ</span>
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

const TIMINGS: TimingType[] = ["budgeted", "fixed", "semi-head", "semi-tail", "unscheduled"];
const TIMING_LABEL: Record<TimingType, string> = {
  budgeted: "Budgeted",
  fixed: "Fixed",
  "semi-head": "Start-anchored",
  "semi-tail": "End-anchored",
  unscheduled: "Unscheduled",
};

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

  const needStart = timing === "fixed" || timing === "semi-head";
  const needEnd = timing === "fixed" || timing === "semi-tail";
  const needBudget = timing === "budgeted" || timing === "semi-head" || timing === "semi-tail";

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
    const start = needStart ? startTod : undefined;
    const end = needEnd ? endTod : undefined;
    if (needStart && start === undefined) return { error: "Enter a valid start time." };
    if (needEnd && end === undefined) return { error: "Enter a valid end time." };
    let b = needBudget ? budget : undefined;
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

/** Renders the shared New-Task options block (title, presets, sub-head+ML,
 * timing chips, smart time/budget fields with steppers, validity-guarded flags)
 * from a `useTaskSpec` state. Full parity on every surface, one implementation. */
export function TaskSpecFieldsView({ sp, hour12, titlePlaceholder }: {
  sp: TaskSpecState;
  hour12: boolean;
  titlePlaceholder?: string;
}): JSX.Element {
  return (
    <>
      <div className="field">
        <label>Title <span className="req-dot" aria-label="required">•</span></label>
        <div className="clearable-field">
          <input value={sp.title} aria-label="Title" onChange={(e) => sp.setTitle(e.target.value)} placeholder={titlePlaceholder ?? "e.g. Standup, Gym"} autoFocus />
        </div>
      </div>
      <div className="field">
        <label>Presets</label>
        <PresetPills active={sp.preset} onToggle={sp.togglePreset} />
      </div>
      <div className="field">
        <label>Sub-head <span className="req-dot" aria-label="required">•</span></label>
        <SubheadField activity={sp.activity} onActivity={sp.setActivity} onHead={sp.setHead} title={sp.title} />
      </div>
      <div className="field">
        <label>Timing</label>
        <div className="type-chips" role="radiogroup" aria-label="Timing">
          {TIMINGS.map((ty) => (
            <button key={ty} type="button" className={`type-chip${ty === sp.timing ? " active" : ""}`} data-status={ty} onClick={() => sp.setTiming(ty)}>
              {TIMING_LABEL[ty]}
            </button>
          ))}
        </div>
      </div>
      {sp.needStart && (
        <div className="field">
          <label>Start (time of day)</label>
          <TodField value={sp.startTod} onChange={sp.setStartTod} hour12={hour12} ariaLabel="Start time of day" />
        </div>
      )}
      {sp.needEnd && (
        <div className="field">
          <label>End (time of day)</label>
          <TodField value={sp.endTod} onChange={sp.setEndTod} hour12={hour12} ariaLabel="End time of day" />
        </div>
      )}
      {sp.needBudget && (
        <div className="field">
          <label>Budget</label>
          <DurInput value={sp.budget} ariaLabel="Budget" min={1} onCommit={(m) => sp.setBudget(m ?? undefined)} allowEmpty />
        </div>
      )}
      <div className="field">
        <label>Flags</label>
        <TaskFlagsRow timing={sp.timing} flags={sp.flags} presetActive={sp.preset !== null} onChange={sp.setFlags} />
      </div>
    </>
  );
}
