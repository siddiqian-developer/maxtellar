/**
 * Casual time / date / duration parsing (spec §06 + §7.0.2) — the deterministic
 * FIRST stage of the two-staged smart-input parser. Turns loose human input
 * ("3pm", "1500", "tom 7am", "1days 2.5hr") into exact domain values, day-aware.
 *
 * Domain time = integer minutes since the Unix epoch (local wall-clock for the
 * day/hour math, matching time.ts). Durations = integer minutes.
 *
 * Two-staged design: if the grammar cannot parse an input it returns
 * `value: undefined`; a later ML stage plugs into `fallbackParse` (null stub
 * today), biased toward ML when the grammar is unsure. Never load-bearing (§7).
 */

import type { Min, Dur } from "@maxtellar/core";

/* ------------------------------- helpers --------------------------------- */

const MIN_PER_DAY = 1440;

const toDate = (m: Min): Date => new Date(m * 60000);

/** Local-midnight epoch-minute for the day containing `m`. */
export function dayStartMin(m: Min): Min {
  const d = toDate(m);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 60000);
}

/** Whole-day offset of `m` from `now` (0 = same calendar day, 1 = tomorrow). */
export function dayOffsetOf(m: Min, now: Min): number {
  return Math.round((dayStartMin(m) - dayStartMin(now)) / MIN_PER_DAY);
}

/** Levenshtein distance (small strings only). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** Fuzzy-match a word to a relative-day token (misspellings tolerated). */
function matchDayWord(word: string): number | null {
  const w = word.toLowerCase();
  if (["today", "tdy", "tod"].includes(w)) return 0;
  if (["tomorrow", "tom", "tmrw", "tmr", "tmw", "tomo", "tomm"].includes(w)) return 1;
  if (["yesterday", "yest", "yday", "yes", "yst", "ytd"].includes(w)) return -1;
  // fuzzy for genuine misspellings ("tmorow", "tomorow", "yesterdy")
  if (w.length >= 4) {
    if (editDistance(w, "tomorrow") <= 2) return 1;
    if (editDistance(w, "today") <= 2) return 0;
    if (editDistance(w, "yesterday") <= 2) return -1;
  }
  return null;
}

/** Weekday NAME tokens (labels, not relative offsets). `fmtDayTime` prefixes a
 * far date with one ("Wed Jul 22, …"); the parser strips it so the display
 * round-trips. Distinct from matchDayWord's today/tom/yesterday offsets. */
const WEEKDAY_NAMES = new Set([
  "sun", "mon", "tue", "tues", "wed", "weds", "thu", "thur", "thurs", "fri", "sat",
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]);
function isWeekdayName(token: string): boolean {
  return WEEKDAY_NAMES.has(token.toLowerCase().replace(/\.$/, ""));
}

/* ---------------------------- time-of-day -------------------------------- */

interface TimeOfDay {
  hour: number; // 0..23
  min: number; // 0..59
}

/**
 * Parse a bare time-of-day token (no day part). Handles:
 *  "3pm" "03pm" "3:00pm" "03:PM" "3:0" "15:00" "1500" "150" "15:0" "9" "9am".
 * hour > 12 always reads as 24h (am/pm ignored). Bare hour < 12 defaults AM;
 * bare 12 → noon. Returns undefined if it isn't a time at all.
 */
export function parseTimeOfDay(input: string): TimeOfDay | undefined {
  let s = input.trim().toLowerCase().replace(/[\s,]+/g, "");
  if (!s) return undefined;

  // am/pm suffix (a, p, am, pm), optionally glued to the digits
  let mer: "am" | "pm" | null = null;
  const mm = /(a|p)\.?m?\.?$/.exec(s);
  if (mm) {
    mer = mm[1] === "p" ? "pm" : "am";
    s = s.slice(0, mm.index);
  }
  if (!s) return undefined;

  let hour: number;
  let min: number;

  if (s.includes(":")) {
    const [hStr, mStr = ""] = s.split(":");
    if (!/^\d{1,2}$/.test(hStr ?? "")) return undefined;
    if (mStr !== "" && !/^\d{1,2}$/.test(mStr)) return undefined;
    hour = Number(hStr);
    // A single-digit minute is the TENS place, matching the user's examples
    // ("3:0"→:00, "15:0"→:00, and by extension "3:5"→:50).
    min = mStr === "" ? 0 : mStr.length === 1 ? Number(mStr) * 10 : Number(mStr);
  } else {
    if (!/^\d{1,4}$/.test(s)) return undefined;
    if (s.length <= 2) {
      hour = Number(s);
      min = 0;
    } else if (s.length === 3) {
      hour = Number(s.slice(0, 1));
      min = Number(s.slice(1));
    } else {
      hour = Number(s.slice(0, 2));
      min = Number(s.slice(2));
    }
  }

  if (min > 59) return undefined;

  // meridiem application
  if (mer === "pm" && hour < 12) hour += 12;
  else if (mer === "am" && hour === 12) hour = 0;
  // bare 12 (no suffix) → noon (12); bare <12 stays AM; hour ≥13 is 24h already
  if (hour > 23) return undefined;

  return { hour, min };
}

/* ---------------------------- casual time -------------------------------- */

export interface CasualTime {
  /** Absolute epoch minute, or undefined if unparseable. */
  value: Min | undefined;
  /** Resolved whole-day offset from `now` (0 today, 1 tomorrow, …). */
  dayOffset: number;
  /** Did the input explicitly name a day (token or date)? */
  explicitDay: boolean;
}

/**
 * Parse a day-aware time. `now` anchors relative days. A leading/trailing day
 * word ("tom", "tmorow") or "Tomorrow,"/"today" prefix sets the day; an
 * explicit ISO-ish date ("jul 22", "2026-07-22", "22/7") sets it absolutely.
 * Without a day part, resolves to today's date (the caller decides whether a
 * past time should bump to tomorrow — §7.0.2 past-time rule). `pastBias` makes
 * a year-less explicit date resolve to its nearest PAST occurrence instead of
 * the nearest future one — the history/back-log direction (caller-owned).
 */
export function parseCasualTime(
  input: string,
  now: Min,
  opts: { pastBias?: boolean } = {},
): CasualTime {
  const trimmed = input.trim();
  if (!trimmed) return { value: undefined, dayOffset: 0, explicitDay: false };
  // Strip ignorable weekday-NAME tokens ("Sun", "Wednesday") — human labels that
  // fmtDayTime emits for far dates ("Wed Jul 22, 03:00 PM"), redundant with the
  // absolute date and NOT relative-day offsets. Keeps the reformatted display
  // round-trippable through this parser (a smart-input requirement, §7.0.2).
  const raw = trimmed.split(/[\s,]+/).filter(Boolean).filter((t) => !isWeekdayName(t)).join(" ");
  if (!raw) return { value: undefined, dayOffset: 0, explicitDay: false };

  let dayOffset = 0;
  let explicitDay = false;
  let rest = raw;

  // strip a relative-day word anywhere (comma-separated or spaced)
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  const dayTokenIdx = tokens.findIndex((t) => matchDayWord(t) !== null);
  if (dayTokenIdx !== -1) {
    dayOffset = matchDayWord(tokens[dayTokenIdx]!)!;
    explicitDay = true;
    rest = tokens.filter((_, i) => i !== dayTokenIdx).join(" ");
  } else {
    // explicit calendar date? "jul 22", "22 jul", "2026-07-22", "22/7", "7/22"
    const abs = parseAbsoluteDate(raw, now, opts.pastBias);
    if (abs) {
      dayOffset = dayOffsetOf(abs.dayMin, now);
      explicitDay = true;
      rest = abs.rest;
    }
  }

  const tod = parseTimeOfDay(rest);
  if (!tod) {
    // §7.0.2 two-staged parser: the deterministic grammar failed → hand the
    // WHOLE raw input to the ML fallback seam (biased toward ML when the grammar
    // is unsure). Null today (the model lands in the late ML stage), but the seam
    // is live so a failure is never silently "left as typed" without a try.
    const fb = fallbackParse(raw, now);
    if (fb) return fb;
    return { value: undefined, dayOffset, explicitDay };
  }

  const base = dayStartMin(now) + dayOffset * MIN_PER_DAY;
  return { value: base + tod.hour * 60 + tod.min, dayOffset, explicitDay };
}

export interface PastTime {
  /** Absolute epoch minute in the past (≤ now), or undefined if unparseable. */
  value: Min | undefined;
  /** Meaning-changing adjustments to announce (§7.0.2 snap-notify). */
  notes: string[];
}

/**
 * Resolve a casual time for a HISTORY / back-log field — the mirror of the
 * planning drawer's forward-snap. Smart-input DIRECTION is caller-owned
 * (§7.0.2): here a bare clock resolves into the PAST — today if `≤ now`, else
 * the day before — and never bumps forward. An explicit day the user typed is
 * respected but still clamped to `now` (history can't cross into the future).
 * Returns meaning-changes in `notes` for the universal snap-notify.
 */
export function resolvePastTime(input: string, now: Min): PastTime {
  const { value, explicitDay } = parseCasualTime(input, now, { pastBias: true });
  if (value === undefined) return { value: undefined, notes: [] };

  const notes: string[] = [];
  let v = value;
  // A bare clock parsed to today; if that lands in the future, the user means
  // the most recent past occurrence — the day before.
  if (!explicitDay && v > now) {
    v -= MIN_PER_DAY;
    notes.push("Resolved to yesterday (history is in the past)");
  }
  // Backstop: anything still beyond now (e.g. an explicit future day) clamps.
  if (v > now) {
    v = now;
    notes.push("Clamped to now — history can't cross into the future");
  }
  return { value: v, notes };
}

export interface FitResult {
  start: Min;
  end: Min;
  notes: string[];
  /** false only when no positive span fits here (caller keeps the editor open). */
  ok: boolean;
}

/**
 * Fit a `[start, end)` history interval into the legal past without overlapping
 * existing occupancy — "make all possible valid snaps" (feedback 2026-07-15).
 * In order: (1) raise `start` to the editable-window `floor` (default yesterday
 * 00:00); (2) push `start` out of any entry it lands inside; (3) clamp `end` to
 * the largest legal value = `min(now, start of the next entry)` so it never
 * crosses into the future NOR overlaps the item below it. Every meaning-change
 * is recorded in `notes`; `ok` is false only when no positive span remains.
 * `fmt` renders a stamp for the notes (injected to avoid a time.ts dependency).
 */
export function fitPastInterval(
  start: Min,
  end: Min,
  others: { start: Min; end: Min }[],
  now: Min,
  floor: Min,
  fmt: (m: Min) => string,
): FitResult {
  const notes: string[] = [];
  const occ = others.slice().sort((a, b) => a.start - b.start);

  // 1. editable-window floor (interim: yesterday's calendar-day start).
  if (start < floor) {
    start = floor;
    notes.push(`Start earlier than the editable window — moved to ${fmt(floor)}`);
  }
  if (start > now) start = now; // resolvePastTime already clamps; belt-and-braces.

  // 2. start can't land inside an existing entry.
  for (const o of occ) {
    if (o.start <= start && start < o.end) {
      start = o.end;
      notes.push(`Start overlapped an existing entry — moved to ${fmt(o.end)}`);
    }
  }

  // 3. end ceiling = min(now, start of the next entry after `start`).
  const next = occ.find((o) => o.start >= start);
  const ceiling = Math.min(now, next ? next.start : now);

  if (end > ceiling || end <= start) {
    if (ceiling <= start) {
      notes.push("No room here without overlapping an existing entry — adjust the times.");
      return { start, end: start, notes, ok: false };
    }
    notes.push(
      ceiling === now
        ? `End moved to now (${fmt(now)}) — history can't cross into the future`
        : `End snapped to ${fmt(ceiling)} to avoid overlapping the next entry`,
    );
    end = ceiling;
  }

  return { start, end, notes, ok: end > start };
}

/* ------------------------------ dates ------------------------------------ */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Parse an explicit calendar date out of `input`, returning its local-midnight
 * epoch-minute and the leftover string (the time part). Supports "jul 22",
 * "22 jul", "2026-07-22", "22/7", "7/22". For a year-less date the year
 * defaults to the nearest FUTURE occurrence (planning) unless `pastBias`, which
 * picks the nearest PAST occurrence (history/back-log). Returns null if no date
 * is present.
 */
export function parseAbsoluteDate(
  input: string,
  now: Min,
  pastBias = false,
): { dayMin: Min; rest: string } | null {
  const s = input.trim();
  const nowD = toDate(now);
  const todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()).getTime();

  // ISO 2026-07-22
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const dayMin = Math.floor(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() / 60000);
    return { dayMin, rest: s.replace(m[0], " ").trim() };
  }

  // "jul 22" or "22 jul" (month name)
  m = /\b([a-z]{3,9})\s+(\d{1,2})\b/i.exec(s);
  let monIdx = m ? MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) : -1;
  let dayNum = m ? Number(m[2]) : NaN;
  if (monIdx === -1) {
    m = /\b(\d{1,2})\s+([a-z]{3,9})\b/i.exec(s);
    if (m) {
      monIdx = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
      dayNum = Number(m[1]);
    }
  }
  if (m && monIdx !== -1 && dayNum >= 1 && dayNum <= 31) {
    let year = nowD.getFullYear();
    const candidate = new Date(year, monIdx, dayNum).getTime();
    if (!pastBias && candidate < todayStart) year += 1; // nearest future
    if (pastBias && candidate > todayStart) year -= 1; // nearest past
    const dayMin = Math.floor(new Date(year, monIdx, dayNum).getTime() / 60000);
    return { dayMin, rest: s.replace(m[0], " ").trim() };
  }

  // numeric "22/7" or "7/22" (day/month, disambiguated by >12)
  m = /\b(\d{1,2})[/.](\d{1,2})\b/.exec(s);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let day: number;
    let mon: number;
    if (a > 12) { day = a; mon = b; }
    else if (b > 12) { day = b; mon = a; }
    else { day = a; mon = b; } // ambiguous → day/month
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      let year = nowD.getFullYear();
      const candidate = new Date(year, mon - 1, day).getTime();
      if (!pastBias && candidate < todayStart) year += 1; // nearest future
      if (pastBias && candidate > todayStart) year -= 1; // nearest past
      const dayMin = Math.floor(new Date(year, mon - 1, day).getTime() / 60000);
      return { dayMin, rest: s.replace(m[0], " ").trim() };
    }
  }

  return null;
}

/* ---------------------------- durations ---------------------------------- */

/**
 * Parse a casual duration → integer minutes. Handles unit tokens
 * ("1days", "2.5hr", "90 min", "2h", "1h30") and bare "H:MM"/minutes.
 * Sums every unit present. Returns undefined if nothing numeric is found.
 */
export function parseCasualDuration(input: string): Dur | undefined {
  const s = input.trim().toLowerCase();
  if (!s) return undefined;

  // "H:MM" clock-style duration
  const clock = /^(\d{1,3}):(\d{1,2})$/.exec(s);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  // compact "1h30" / "1hr30" — hours then bare trailing minutes
  const compact = /^(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(\d{1,2})$/.exec(s);
  if (compact) return Number(compact[1]) * 60 + Number(compact[2]);

  let total = 0;
  let found = false;

  // unit tokens: <number><unit>, unit followed by a non-letter or end
  const unitRe = /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)(?![a-z])/g;
  let um: RegExpExecArray | null;
  while ((um = unitRe.exec(s)) !== null) {
    const n = Number(um[1]);
    const u = um[2]!;
    if (u.startsWith("d")) total += n * MIN_PER_DAY;
    else if (u.startsWith("h")) total += n * 60;
    else total += n;
    found = true;
  }

  if (!found) {
    // bare number → minutes
    if (/^\d+(?:\.\d+)?$/.test(s)) return Math.round(Number(s));
    return undefined;
  }
  return Math.round(total);
}

/* --------------------------- ML fallback seam ---------------------------- */

/**
 * Two-staged parser seam: when the deterministic grammar returns undefined,
 * the drawer may consult this. A later on-device/cloud ML stage plugs in here
 * (biased toward ML on confusion). Null today — the grammar stands alone.
 */
export function fallbackParse(_input: string, _now: Min): CasualTime | null {
  return null;
}

/* ---------------------------------------------------------------------------
 * §4.4 template END anchor — "next day, 11am"
 * ------------------------------------------------------------------------- */

/**
 * Fold every two-word spelling of "next day" ("next day", "next-day", "nxt day",
 * "next  days") into the single token `nextday`, so one token test then covers
 * every variation instead of a brittle alternation.
 */
const NEXT_DAY_PHRASE = /\bne?xt?\s*-?\s*da?ys?\b/gi;
/** The numeric spellings, which also split into two tokens: "+1 day", "1 day". */
const PLUS_ONE_DAY_PHRASE = /\+?\s*\b1\s*-?\s*da?ys?\b/gi;

/**
 * Is this token a way of saying "the day after the one this fires on"?
 *
 * Reuses `matchDayWord` — the SAME fuzzy day matcher the casual date parser uses
 * (§7.0.6: one definition, never a second list) — so every "tomorrow" variation
 * it already tolerates, including genuine misspellings ("tomorow", "tommorow",
 * "tmorow"), is understood here for free. On top of it: the `nextday` forms and
 * the numeric/overnight shorthands.
 */
function isNextDayToken(token: string): boolean {
  const w = token.toLowerCase().replace(/[.,;:!]+$/, "");
  if (!w) return false;
  if (matchDayWord(w) === 1) return true; // tomorrow & friends, fuzzy included
  if (["nextday", "nd", "overnight", "onight", "nite"].includes(w)) return true;
  if (/^\+?\s*1\s*d(?:ay)?s?$/.test(w)) return true; // +1d, 1d, +1day, 1days
  if (/^\+\s*1$/.test(w)) return true; // +1
  // fuzzy for typed-fast spellings of the folded token ("nextady", "nexday")
  if (w.length >= 5 && editDistance(w, "nextday") <= 2) return true;
  return false;
}

/** Is this token an explicit "same day"? ("today", "same day" → folded below.) */
function isSameDayToken(token: string): boolean {
  const w = token.toLowerCase().replace(/[.,;:!]+$/, "");
  return w === "sameday" || matchDayWord(w) === 0;
}

/**
 * §4.4/§7.0.2 smart input for a template's END anchor: a time of day plus an
 * optional day qualifier saying which day it lands on. A template has no date
 * (§7.0.5) — it repeats — so "tomorrow" here means "the next day", not a
 * calendar date, and planning stops at 24h so there is nothing past it.
 *
 * All of these parse to the next day: "next day, 11am", "nextday 11am",
 * "next-day 11am", "tomorrow 7:30", "tom 7am", "tmrw 6", "tomorow 6am" (typo),
 * "+1d 6am", "1 day 6am", "overnight 6am", "nd 6am" — in any position
 * ("11am next day" too). A bare "11am" is the same day.
 *
 * Lives here with the other casual parsers (`smart-input-guard.test.ts` keeps
 * parsers out of bespoke surfaces) so the anchor field can't hand-roll one.
 */
export function parseAnchorEnd(
  input: string,
): { dayOffset: 0 | 1; tod: number } | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  // Fold multi-word qualifiers to single tokens first, so position and spelling
  // stop mattering.
  const folded = raw
    .replace(NEXT_DAY_PHRASE, "nextday")
    .replace(PLUS_ONE_DAY_PHRASE, "nextday")
    .replace(/\bsame\s*-?\s*day\b/gi, "sameday");
  const tokens = folded.split(/[\s,;]+/).filter(Boolean);

  const nextIdx = tokens.findIndex(isNextDayToken);
  const sameIdx = nextIdx === -1 ? tokens.findIndex(isSameDayToken) : -1;
  const dayIdx = nextIdx !== -1 ? nextIdx : sameIdx;

  const rest = dayIdx === -1 ? folded : tokens.filter((_, i) => i !== dayIdx).join(" ");
  const t = parseTimeOfDay(rest);
  if (!t) return undefined;
  return { dayOffset: nextIdx !== -1 ? 1 : 0, tod: t.hour * 60 + t.min };
}
