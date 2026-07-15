/**
 * Time boundary — the ONLY place wall-clock meets domain minutes.
 * Domain time = integer minutes since Unix epoch (UTC); display is local.
 * Formats per SPEC Part VI.
 */

import type { Min, Dur } from "@maxtellar/core";

export const nowMin = (): Min => Math.floor(Date.now() / 60000);

export const toDate = (m: Min): Date => new Date(m * 60000);

const pad = (n: number): string => String(n).padStart(2, "0");

/** Clock string for a Date, honoring the app-wide 12h/24h setting (SPEC VI,
 * "Time formats"). STRICT format: 24h → `HH:MM`; 12h → `HH:MM AM/PM` with a
 * zero-padded hour (`03:00 PM`, `09:05 AM`). */
export function fmtClock(d: Date, hour12: boolean): string {
  if (!hour12) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const h24 = d.getHours();
  const h12 = h24 % 12 || 12;
  return `${pad(h12)}:${pad(d.getMinutes())} ${h24 >= 12 ? "PM" : "AM"}`;
}

/** Absolute time: bare HH:mm (or 12h+am/pm); date labels only for non-current
 *  calendar dates ("yesterday"/"tomorrow"/exact) — never a label for today. */
export function fmtAbs(m: Min, opts: { now?: Min; hour12?: boolean } = {}): string {
  const d = toDate(m);
  const hhmm = fmtClock(d, opts.hour12 ?? false);
  const now = toDate(opts.now ?? nowMin());
  const dayOf = (x: Date): number =>
    Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);
  const delta = dayOf(d) - dayOf(now);
  if (delta === 0) return hhmm; // never "Today"
  if (delta === -1) return `yesterday ${hhmm}`;
  if (delta === 1) return `tomorrow ${hhmm}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Day-aware time label for the drawer's Start/End fields (§06): today shows
 *  just the clock ("03:00PM"); tomorrow shows "Tomorrow, 03:00PM"; anything
 *  from the day after onward shows a dated label. `showWeekday` (default on,
 *  the `showWeekday` setting) prefixes the weekday: "Sun, Jul 19, 03:00PM" vs
 *  "Jul 19, 03:00PM". The casual parser ignores the weekday token either way,
 *  so both round-trip (§7.0.2). */
export function fmtDayTime(m: Min, now: Min, hour12: boolean, showWeekday = true): string {
  const d = toDate(m);
  const clock = fmtClock(d, hour12);
  const dayOf = (x: Date): number =>
    Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);
  const delta = dayOf(d) - dayOf(toDate(now));
  if (delta === 0) return clock;
  if (delta === 1) return `Tomorrow, ${clock}`;
  if (delta === -1) return `Yesterday, ${clock}`;
  const date = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${clock}`;
  return showWeekday ? `${WEEKDAYS[d.getDay()]}, ${date}` : date;
}

/** Duration in unit form "Nd Nh Nm" (§06): drops zero units, always shows at
 *  least minutes. 1590 → "1d 2h 30m" · 1500 → "1d 1h" · 90 → "1h 30m" · 30 →
 *  "30m" · 0 → "0m". */
export function fmtDurUnits(minutes: Dur): string {
  let rest = Math.max(0, Math.round(minutes));
  const d = Math.floor(rest / (24 * 60));
  rest -= d * 24 * 60;
  const h = Math.floor(rest / 60);
  const m = rest - h * 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length ? parts.join(" ") : "0m";
}

/** Duration: MM:WW:DD:HH:MM — months/weeks/days only when non-zero (SPEC VI).
 *  90 → "01:30" · 8d2h → "01:01:02:00" (1w 1d 2h 0m). */
export function fmtDur(minutes: Dur): string {
  const MIN_H = 60;
  const MIN_D = 24 * MIN_H;
  const MIN_W = 7 * MIN_D;
  const MIN_MO = 30 * MIN_D; // calendar-free nominal month

  let rest = Math.max(0, Math.round(minutes));
  const mo = Math.floor(rest / MIN_MO);
  rest -= mo * MIN_MO;
  const w = Math.floor(rest / MIN_W);
  rest -= w * MIN_W;
  const d = Math.floor(rest / MIN_D);
  rest -= d * MIN_D;
  const h = Math.floor(rest / MIN_H);
  const m = rest - h * MIN_H;

  const parts: number[] = [];
  if (mo > 0) parts.push(mo, w, d);
  else if (w > 0) parts.push(w, d);
  else if (d > 0) parts.push(d);
  parts.push(h, m);
  return parts.map(pad).join(":");
}
