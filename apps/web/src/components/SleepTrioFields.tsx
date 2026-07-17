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
import type { EndDayOffset, TimingType } from "@maxtellar/core";
import { TimingTypeChips, RoleField, TodField, AnchorEndField, FIELD_ROLES } from "./TaskSpecFields";
import { DurInput } from "./BudgetPanel";
import { fmtDurUnits } from "../time";

export interface SleepTrioValue {
  timing: TimingType;
  budget: number | undefined;
  anchorStartTod: number | undefined;
  anchorEndTod: number | undefined;
  anchorEndDayOffset: EndDayOffset | undefined;
}

export function SleepTrioFields({ value, hour12, disabled, onChange }: {
  value: SleepTrioValue;
  hour12: boolean;
  disabled?: boolean;
  onChange: (next: SleepTrioValue) => void;
}): JSX.Element {
  const roles = FIELD_ROLES[value.timing];
  const anchored = roles.start !== "not used" || roles.end !== "not used";
  return (
    <div className="sleep-trio">
      <TimingTypeChips value={value.timing} onChange={(timing) => onChange({ ...value, timing })} />
      <RoleField name="Start" timing={value.timing} field="start" hint='Type casually ("10pm").'>
        <TodField
          value={value.anchorStartTod}
          hour12={hour12}
          disabled={disabled || roles.start === "not used"}
          ariaLabel="Sleep start"
          onChange={(tod) => onChange({ ...value, anchorStartTod: tod })}
        />
      </RoleField>
      <RoleField name="End" timing={value.timing} field="end" hint='Type casually — "6am", or "next day, 6am".'>
        <AnchorEndField
          tod={value.anchorEndTod}
          dayOffset={value.anchorEndDayOffset ?? 0}
          hour12={hour12}
          onChange={({ tod, dayOffset }) => {
            if (roles.end === "not used" || disabled) return;
            onChange({ ...value, anchorEndTod: tod, anchorEndDayOffset: dayOffset });
          }}
        />
      </RoleField>
      <RoleField name="Budget" timing={value.timing} field="budget">
        <DurInput
          ariaLabel="Sleep budget"
          value={value.budget}
          disabled={disabled || roles.budget === "not used"}
          onCommit={(m) => { if (m !== null) onChange({ ...value, budget: m }); }}
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
