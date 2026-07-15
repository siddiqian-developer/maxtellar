/**
 * A minimal month-grid date picker (§1.6). Used only for FAR dates: the earliest
 * selectable day is `now` + 2 (today and tomorrow are typed, never picked here).
 * Returns the local-midnight epoch-minute of the chosen day. Nested overlay
 * above the drawer — Esc closes just this (back-navigation stack).
 */

import { useState } from "react";
import { dayStartMin } from "../casualTime";

interface Props {
  now: number; // epoch minutes
  onPick: (dayMin: number) => void;
  onClose: () => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const dayMinFor = (y: number, m: number, d: number): number =>
  Math.floor(new Date(y, m, d).getTime() / 60000);

export function DatePicker({ now, onPick, onClose }: Props): JSX.Element {
  // Esc is routed by the parent drawer (back-navigation stack, innermost first);
  // this overlay only handles the scrim click for closing.
  const nowDate = new Date(now * 60000);
  const minDayMin = dayStartMin(now) + 2 * 1440; // day after tomorrow onward
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
            const disabled = dm < minDayMin;
            return (
              <button
                key={d}
                type="button"
                className="datepicker-day"
                disabled={disabled}
                data-tip={disabled ? "Today & tomorrow: type them in the field instead" : undefined}
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
