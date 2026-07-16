/**
 * A month-grid date picker (§1.6/§7.0.5). Direction-aware so every absolute
 * date/time field can offer a calendar (the symmetry law):
 *  - "future" (default, planning): earliest selectable day is `now` + 2 (today
 *    and tomorrow are typed, never picked here); no upper bound.
 *  - "past" (history / back-log): latest selectable day is today; earliest is
 *    the `earliest` floor (the editable window). Future days are disabled.
 * Returns the local-midnight epoch-minute of the chosen day. Nested overlay
 * above the drawer — Esc closes just this (back-navigation stack).
 *
 * The month grid itself is react-day-picker (adopted 2026-07-16 per the §7.0.4
 * buy-first rule — see specs/07-engineering.md). This file stays the app's own
 * component: it owns the overlay chrome, the direction law, the epoch-minute
 * boundary (RDP speaks `Date`; the app speaks epoch minutes — converted here and
 * nowhere else), and the disabled-day tooltips. Swapping the grid out again would
 * touch only this file — the four call sites bind to these props, not to RDP.
 */

import { DayPicker } from "react-day-picker";
import type { DayButtonProps } from "react-day-picker";
import "react-day-picker/style.css";
import { dayStartMin } from "../casualTime";

interface Props {
  now: number; // epoch minutes
  onPick: (dayMin: number) => void;
  onClose: () => void;
  /** Which side of `now` is selectable. Default "future" (planning). */
  direction?: "future" | "past";
  /** "past" only: earliest selectable local-midnight (the editable-window floor). */
  earliest?: number;
}

const toDate = (dayMin: number): Date => new Date(dayMin * 60000);
/** Local midnight of `d` as an epoch-minute — the app's date key (§4.6). */
const toDayMin = (d: Date): number =>
  Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 60000);

export function DatePicker({ now, onPick, onClose, direction = "future", earliest }: Props): JSX.Element {
  // Esc is routed by the parent drawer (back-navigation stack, innermost first);
  // this overlay only handles the scrim click for closing.
  const today = dayStartMin(now);
  const past = direction === "past";
  // future: day after tomorrow onward. past: from the floor up to today.
  const minSel = past ? (earliest ?? 0) : today + 2 * 1440;
  const maxSel = past ? today : Infinity;

  const disabled = past
    ? [{ before: toDate(minSel) }, { after: toDate(maxSel) }]
    : [{ before: toDate(minSel) }];

  const tip = past
    ? "Later than today can't be in history"
    : "Today & tomorrow: type them in the field instead";

  // Carries the app's disabled-day tooltip (`data-tip`) onto RDP's day buttons —
  // the one reason this needs a custom component rather than plain props.
  const DayButton = ({ day, modifiers, ...btn }: DayButtonProps): JSX.Element => (
    <button {...btn} data-tip={modifiers.disabled ? tip : undefined} />
  );

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="datepicker" role="dialog" aria-modal="true" aria-label="Pick a date">
        <DayPicker
          mode="single"
          defaultMonth={toDate(past ? maxSel : minSel)}
          disabled={disabled}
          components={{ DayButton }}
          onSelect={(d) => { if (d) onPick(toDayMin(d)); }}
          showOutsideDays={false}
        />
      </div>
    </div>
  );
}
