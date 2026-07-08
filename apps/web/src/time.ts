/**
 * Time boundary — the ONLY place wall-clock meets domain minutes.
 * Domain time = integer minutes since Unix epoch (UTC); display is local.
 * Formats per SPEC Part VI.
 */

import type { Min, Dur } from "@timekeeper/core";

export const nowMin = (): Min => Math.floor(Date.now() / 60000);

export const toDate = (m: Min): Date => new Date(m * 60000);

const pad = (n: number): string => String(n).padStart(2, "0");

/** Absolute time: bare HH:mm; date labels only for non-current calendar dates
 *  ("yesterday"/"tomorrow"/exact) — never a label for today (SPEC VI). */
export function fmtAbs(m: Min, opts: { now?: Min } = {}): string {
  const d = toDate(m);
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const now = toDate(opts.now ?? nowMin());
  const dayOf = (x: Date): number =>
    Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);
  const delta = dayOf(d) - dayOf(now);
  if (delta === 0) return hhmm; // never "Today"
  if (delta === -1) return `yesterday ${hhmm}`;
  if (delta === 1) return `tomorrow ${hhmm}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
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
