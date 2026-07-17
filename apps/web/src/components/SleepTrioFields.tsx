/**
 * The Sleep trio (§11.4 revised 2026-07-21) — start / end / budget, editable
 * from Settings, BudgetPanel's pinned row, and (via the ordinary
 * TemplateEditor, since Sleep is a real WeekTemplate now) the Calendar block
 * itself. ONE component, reused everywhere it appears (§7.0.5 symmetry) —
 * exactly the same `TimingTypeChips` + `FIELD_ROLES`/`RoleField` gating every
 * other task-spec surface already uses, so Sleep gets fixed/budgeted/etc.
 * behavior for free instead of a bespoke duration-only widget.
 *
 * `budgeted` (no anchors) is the common case in practice — sleep is almost
 * always logged after the fact, never started live (§11.4's design note: you
 * can't "start" a task after you've fallen asleep, and a sleepless bedtime
 * means the actual sleep time is unknowable in advance). When NOT `fixed`,
 * the start/end fields dim (the shared `.role-not-used` treatment) and a
 * `~budget` approximate reading shows instead — the same "~" convention
 * Timeline.tsx uses for a floating (non-anchored) edge, applied here to text
 * rather than a drawn block.
 */
import { useState } from "react";
import type { EndDayOffset, TimingType } from "@maxtellar/core";
import { DEFAULT_MIN_FRAGMENT } from "@maxtellar/core";
import {
  TimingTypeChips, RoleField, TodField, AnchorEndField, FIELD_ROLES,
  reconcileTrio, snapEndTimeForDay, morphDefaults, deriveTiming, fmtAnchorEnd,
} from "./TaskSpecFields";
import { DurInput } from "./BudgetPanel";
import { fmtDurUnits, fmtTod } from "../time";

export interface SleepTrioValue {
  timing: TimingType;
  budget: number | undefined;
  anchorStartTod: number | undefined;
  anchorEndTod: number | undefined;
  anchorEndDayOffset: EndDayOffset | undefined;
}

export function SleepTrioFields({ value, hour12, disabled, minFragment = DEFAULT_MIN_FRAGMENT, collapsible, open: openProp, onOpenChange, summary, onChange }: {
  value: SleepTrioValue;
  hour12: boolean;
  disabled?: boolean;
  /** §3.7 floor for the §3.6 3→1 derivation — passed so the trio's auto-fill
   * snaps to the SAME floor the drawer/template editor use (§7.0.5 parity). */
  minFragment?: number;
  /** When set, the fields tuck behind a caret (Sleep is the practical default
   * and rarely re-edited — the row shouldn't dominate the panel). */
  collapsible?: boolean;
  /** Controlled open state — when provided, the PARENT owns collapse (so the
   * whole outer row, not just the caret, can be the toggle). Uncontrolled
   * (internal state) when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Compact one-line reading shown next to the caret when collapsed. */
  summary?: JSX.Element;
  onChange: (next: SleepTrioValue) => void;
}): JSX.Element {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean): void => { onOpenChange ? onOpenChange(o) : setOpenState(o); };
  const roles = FIELD_ROLES[value.timing];
  const anchored = roles.start !== "not used" || roles.end !== "not used";

  /**
   * §3.6 3→1 — reuse the ONE shared reconcile step (§7.0.6: the same rule may
   * not have two implementations). Editing any one of start/end/budget derives
   * the third; the whole reconciled trio commits at once, so start+end fills
   * budget here exactly as it does in New Task and the template editor.
   *
   * The timing TYPE is then DERIVED from which fields are filled (§6: "the type
   * is derived live from field presence", §3.6) — the drawer's own rule, via the
   * shared `deriveTiming`. So entering a start+end makes Sleep `fixed`, clearing
   * an anchor demotes it, all without the user touching the chips — the chips
   * follow the fields, exactly as in New Task.
   */
  const apply = (changed: "start" | "end" | "budget", patch: Partial<SleepTrioValue>): void => {
    const next = { ...value, ...patch };
    const r = reconcileTrio(changed, {
      startTod: next.anchorStartTod,
      endTod: next.anchorEndTod,
      endDayOffset: next.anchorEndDayOffset ?? 0,
      budget: next.budget,
    }, minFragment);
    const timing = deriveTiming(r.startTod, r.endTod, r.budget);
    onChange({ timing, anchorStartTod: r.startTod, anchorEndTod: r.endTod, anchorEndDayOffset: r.endDayOffset, budget: r.budget });
  };

  // §6 type-morph prefill — same as the drawer/template editor: tapping a type
  // pre-fills its fields, so switching to `fixed` lands a usable 9am–9:30am
  // draft instead of blanks the fit then has to reject.
  const morph = (timing: TimingType): void => {
    const d = morphDefaults(timing);
    onChange({ timing, budget: d.budget, anchorStartTod: d.startTod, anchorEndTod: d.endTod, anchorEndDayOffset: d.endDayOffset });
  };

  if (collapsible && !open) {
    // ONE row: a labelled Budget value + a compact clock snapshot whose content
    // depends on the timing type (fixed → the window; semi-head → "from …";
    // semi-tail → "by …"; budgeted/unscheduled → nothing, the "~" on the budget
    // already says "no fixed clock time"). Tapping the caret opens the editor.
    const clock =
      value.timing === "fixed" && value.anchorStartTod !== undefined && value.anchorEndTod !== undefined
        ? `${fmtTod(value.anchorStartTod, hour12)} → ${fmtAnchorEnd(value.anchorEndTod, value.anchorEndDayOffset ?? 0, hour12)}`
        : value.timing === "semi-head" && value.anchorStartTod !== undefined
        ? `from ${fmtTod(value.anchorStartTod, hour12)}`
        : value.timing === "semi-tail" && value.anchorEndTod !== undefined
        ? `by ${fmtAnchorEnd(value.anchorEndTod, value.anchorEndDayOffset ?? 0, hour12)}`
        : null;
    const summaryEl = summary ?? (
      <span className="sleep-trio-summary">
        <span className="sleep-trio-budget">
          <span className="sleep-trio-lbl">Budget</span>
          <span className="num">{value.budget !== undefined ? `${anchored ? "" : "~"}${fmtDurUnits(value.budget)}` : "—"}</span>
        </span>
        {clock && <span className="sleep-trio-clock num" data-tip={`Sleep is ${value.timing}`}>{clock}</span>}
      </span>
    );
    // Parent-controlled (BudgetPanel): the OUTER row owns the caret + toggle, so
    // render just the summary. Uncontrolled (Settings): the trio owns its own
    // caret + role="button" toggle wrapper.
    if (onOpenChange) return <div className="sleep-trio sleep-trio-collapsed">{summaryEl}</div>;
    return (
      <div
        className="sleep-trio sleep-trio-collapsed sleep-trio-toggle"
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label="Expand Sleep"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
      >
        <span className="bp-caret" aria-hidden>▸</span>
        {summaryEl}
      </div>
    );
  }

  return (
    <div className="sleep-trio">
      {/* Uncontrolled (Settings) renders its own collapse caret; parent-controlled
       * (BudgetPanel) collapses from the row header instead. */}
      {collapsible && !onOpenChange && (
        <button type="button" className="bp-caret" aria-label="Collapse Sleep" aria-expanded onClick={() => setOpen(false)}>▾</button>
      )}
      {/* Fields are ALWAYS enterable (drawer parity §6): a "not used" role only
       * DIMS the field (RoleField's `.role-not-used`), it never blocks typing —
       * because typing is exactly how the type is promoted. Entering a Start on
       * a budgeted Sleep derives it to semi-head/fixed via `deriveTiming`, same
       * as the New Task drawer. Only the caller's `disabled` (transactional /
       * lock) actually inerts them. */}
      <TimingTypeChips value={value.timing} onChange={morph} />
      <RoleField name="Start" timing={value.timing} field="start" hint='Type casually ("10pm").'>
        <TodField
          value={value.anchorStartTod}
          hour12={hour12}
          disabled={disabled ?? false}
          ariaLabel="Sleep start"
          onChange={(tod) => apply("start", { anchorStartTod: tod })}
        />
      </RoleField>
      <RoleField name="End" timing={value.timing} field="end" hint='Type casually — "6am", or "next day, 6am".'>
        <AnchorEndField
          tod={value.anchorEndTod}
          dayOffset={value.anchorEndDayOffset ?? 0}
          hour12={hour12}
          onChange={({ tod, dayOffset }) => {
            if (disabled) return;
            // §7.0.2: the picked DAY wins; the time snaps to the nearest valid
            // value on it before the trio derives anything (drawer parity).
            apply("end", { anchorEndTod: snapEndTimeForDay(value.anchorStartTod, tod, dayOffset, minFragment), anchorEndDayOffset: dayOffset });
          }}
        />
      </RoleField>
      <RoleField name="Budget" timing={value.timing} field="budget">
        <DurInput
          ariaLabel="Sleep budget"
          value={value.budget}
          disabled={disabled ?? false}
          onCommit={(m) => { if (m !== null) apply("budget", { budget: m }); }}
        />
      </RoleField>
      {!anchored && value.budget !== undefined && (
        <p className="field-desc sleep-trio-approx" data-tip="No fixed start/end — this is an approximate reading, not a placed time (sleep is almost always logged after the fact, §11.4).">
          ~{fmtDurUnits(value.budget)} — no fixed clock time
        </p>
      )}
    </div>
  );
}
