/**
 * A minimal month-grid date picker (§1.6/§7.0.5). Direction-aware so every
 * absolute date/time field can offer a calendar (the symmetry law):
 *  - "future" (default, planning): earliest selectable day is `now` + 2 (today
 *    and tomorrow are typed, never picked here); no upper bound.
 *  - "past" (history / back-log): latest selectable day is today; earliest is
 *    the `earliest` floor (the editable window). Future days are disabled.
 * Returns the local-midnight epoch-minute of the chosen day. Nested overlay
 * above the drawer — Esc closes just this (back-navigation stack).
 */

import { useState } from "react";
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

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const dayMinFor = (y: number, m: number, d: number): number =>
  Math.floor(new Date(y, m, d).getTime() / 60000);

export function DatePicker({ now, onPick, onClose, direction = "future", earliest }: Props): JSX.Element {
  // Esc is routed by the parent drawer (back-navigation stack, innermost first);
  // this overlay only handles the scrim click for closing.
  const nowDate = new Date(now * 60000);
  const today = dayStartMin(now);
  const past = direction === "past";
  // future: day after tomorrow onward. past: from the floor up to today.
  const minSel = past ? (earliest ?? 0) : today + 2 * 1440;
  const maxSel = past ? today : Infinity;
  const [view, setView] = useState({ year: nowDate.getFullYear(), month: nowDate.getMonth() });

  const firstOfMonth = new Date(view.year, view.month, 1);
  const leadBlanks = firstOfMonth.getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(leadBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shift = (delta: number): void => {
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="datepicker" role="dialog" aria-modal="true" aria-label="Pick a date">
        <div className="datepicker-header">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
          <span>{MONTHS[view.month]} {view.year}</span>
          <button type="button" aria-label="Next month" onClick={() => shift(1)}>›</button>
        </div>
        <div className="datepicker-grid">
          {WEEKDAYS.map((w) => (
            <span key={w} className="datepicker-dow">{w}</span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`b${i}`} />;
            const dm = dayMinFor(view.year, view.month, d);
            const disabled = dm < minSel || dm > maxSel;
            return (
              <button
                key={d}
                type="button"
                className="datepicker-day"
                disabled={disabled}
                data-tip={disabled ? (past ? "Later than today can't be in history" : "Today & tomorrow: type them in the field instead") : undefined}
                onClick={() => onPick(dm)}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
