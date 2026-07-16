/**
 * The ONE `.time-stepper` shell (§7.0.6 composition law, §7.0.5 UI symmetry).
 *
 * Every time/date/duration input in the app is this shell: a smart-input text
 * box, an optional 📅 calendar affordance, and the ±5 ▴▾ chevrons — which are
 * part of the field, never loose beside it (§7.0.5, guarded by
 * `stepper-chrome-guard.test.ts`).
 *
 * It was hand-rolled in FIVE places before this (TaskDrawer, TaskSpecFields,
 * BudgetPanel, HistoryEntryEditor, OffPeriodControl) and had already drifted:
 * the history editor and the off-period dialog carried the 📅 but had silently
 * lost the chevrons. Composing this shell makes that class of drift impossible —
 * a surface can no longer render "most of" a stepper.
 *
 * Depth is deliberate (§7.0.6): this shell is the coherent duplicated unit. The
 * chip/label/checkbox inside a field are NOT split further — that would multiply
 * render work for no reuse.
 *
 * The shell owns CHROME + commit wiring only; each caller owns its own parse /
 * snap / reformat semantics (time-of-day vs past time vs duration) and passes
 * the draft text in. It renders no wrapper of its own beyond the flex row.
 */
import type { JSX } from "react";

export interface StepperCalendar {
  /** Open the (direction-aware) DatePicker for this field. */
  onOpen: () => void;
  ariaLabel: string;
  tip: string;
}

export function StepperField({
  text,
  onText,
  onCommit,
  onStep,
  ariaLabel,
  placeholder,
  disabled,
  inputClassName,
  calendar,
}: {
  /** The draft text as typed. The caller owns it (its own state/formatting). */
  text: string;
  onText: (v: string) => void;
  /** Blur/Enter — parse → snap → reformat, per the caller's semantics. */
  onCommit: () => void;
  /** ±1 chevron nudge (the caller applies its own step size + floor). */
  onStep: (dir: 1 | -1) => void;
  ariaLabel: string;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  /** Extra classes for the input; `num` is always applied. */
  inputClassName?: string | undefined;
  /** Omit for a field with no date (durations, recurring time-of-day anchors). */
  calendar?: StepperCalendar | undefined;
}): JSX.Element {
  return (
    <div className="time-stepper">
      <input
        className={inputClassName ? `num ${inputClassName}` : "num"}
        value={text}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onText(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onCommit(); } }}
      />
      {calendar && (
        <button
          type="button"
          tabIndex={-1}
          className="cal-btn"
          aria-label={calendar.ariaLabel}
          data-tip={calendar.tip}
          disabled={disabled}
          onClick={calendar.onOpen}
        >📅</button>
      )}
      {/* Tab-skipped: the chevrons are a mouse affordance; the input is the field. */}
      <div className="time-stepper-btns">
        <button type="button" tabIndex={-1} aria-label={`Increase ${ariaLabel}`} disabled={disabled} onClick={() => onStep(1)}>▴</button>
        <button type="button" tabIndex={-1} aria-label={`Decrease ${ariaLabel}`} disabled={disabled} onClick={() => onStep(-1)}>▾</button>
      </div>
    </div>
  );
}
