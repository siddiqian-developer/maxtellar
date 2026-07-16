/**
 * Title shorthand grammar (spec §06) — a plain, deterministic parser that pulls
 * inline tokens out of a task title so the drawer can pre-fill fields from a
 * single typed line. Purely SYNTACTIC: it recognizes and strips tokens, then
 * hands the raw time/duration substrings back for the caller to run through the
 * exact same casualTime/§3.6 pipeline a typed field uses. It never re-implements
 * time or duration parsing — recognition itself delegates to casualTime
 * (`parseTimeOfDay`, `parseCasualDuration`), so a token is only stripped when
 * those confirm it really is a time/duration (title text like "e-mail" is left
 * alone).
 *
 * Tokens (extraction order #, range, @, duration):
 *   #work            → sub-head/head (caller smart-resolves via `resolveHash`)
 *   @18:00  @6pm     → start anchor
 *   15:50-16:20      → start + end (a scheduled window)
 *   1h30  45m  2h    → budget (unit-bearing only; bare numbers stay in the title)
 *
 * Grammar-filled sub-head/head is marked user-sourced by the caller so ML never
 * overwrites it (§7.0.1).
 */

import { parseTimeOfDay, parseCasualDuration } from "./casualTime";
import { fuzzyMatch, fuzzyScore } from "./fuzzy";

export interface TitleTokens {
  /** Title with every recognized token stripped, whitespace collapsed. */
  title: string;
  /** Raw #token text (no '#') — first valid one wins; caller resolves it. */
  hash?: string;
  /** Raw time substring for the Start field (fed to casualTime downstream). */
  start?: string;
  /** Raw time substring for the End field. */
  end?: string;
  /** Raw duration substring for the Budget field (fed to parseCasualDuration). */
  budget?: string;
}

// A loose time-of-day shape for range detection: 1–4 digits, optional ":MM",
// optional am/pm. Both halves are re-validated by parseTimeOfDay before use.
const TIME = String.raw`\d{1,4}(?::\d{1,2})?\s*(?:[ap]\.?m?\.?)?`;

/** Strip `[from, from+len)` from `s`, leaving a single space in its place. */
function cut(s: string, from: number, len: number): string {
  return s.slice(0, from) + " " + s.slice(from + len);
}

export function parseTitleGrammar(input: string): TitleTokens {
  const out: TitleTokens = { title: input };
  let rest = input;

  // 1. #hash — first valid token fills the field; every #token is stripped.
  const hashRe = /(?:^|\s)#([A-Za-z0-9][\w-]*)/g;
  let hm: RegExpExecArray | null;
  while ((hm = hashRe.exec(rest)) !== null) {
    if (out.hash === undefined) out.hash = hm[1]!;
  }
  rest = rest.replace(/(?:^|\s)#[A-Za-z0-9][\w-]*/g, " ");

  // 2. range  T-T  → start + end (only when BOTH halves are real times).
  const rangeRe = new RegExp(String.raw`(?:^|\s)(${TIME})\s*-\s*(${TIME})(?=\s|$)`, "i");
  const rm = rangeRe.exec(rest);
  if (rm) {
    const a = parseTimeOfDay(rm[1]!.trim());
    const b = parseTimeOfDay(rm[2]!.trim());
    if (a && b) {
      out.start = rm[1]!.trim();
      out.end = rm[2]!.trim();
      // rm[0] may carry a leading space; keep the match's own start.
      const at = rest.indexOf(rm[0]);
      rest = cut(rest, at, rm[0].length);
    }
  }

  // 3. @anchor → start (a range already covers start; @ only fills a still-empty one).
  const atRe = /(?:^|\s)@(\S+)/;
  const am = atRe.exec(rest);
  if (am) {
    const t = parseTimeOfDay(am[1]!);
    if (t) {
      if (out.start === undefined) out.start = am[1]!;
      const at = rest.indexOf(am[0]);
      rest = cut(rest, at, am[0].length);
    }
  }

  // 4. duration (unit-bearing) → budget. Confirmed via parseCasualDuration so a
  //    bare number never gets eaten (only "1h30", "45m", "2h", "1d", …).
  const durRe =
    /(?:^|\s)(\d+(?:\.\d+)?\s*(?:d|days?|h|hr|hrs|hours?)(?:\s*\d+\s*(?:m|min|mins|minutes?)?)?|\d+\s*(?:m|min|mins|minutes?))(?=\s|$)/i;
  const dm = durRe.exec(rest);
  if (dm) {
    const dv = parseCasualDuration(dm[1]!.trim());
    if (dv !== undefined) {
      out.budget = dm[1]!.trim();
      const at = rest.indexOf(dm[0]);
      rest = cut(rest, at, dm[0].length);
    }
  }

  out.title = rest.replace(/\s+/g, " ").trim();
  return out;
}

export interface HashResolution {
  /** The sub-head (activity) to set in the drawer. */
  subhead: string;
  /** A head to seed for a NEW sub-head that matched an existing head name. */
  head?: string;
  /** True when the token resolved to an existing sub-head (head auto-derives). */
  matchedExisting: boolean;
}

/**
 * Smart-resolve a `#token` against the head/sub-head registry (spec §06 ruling,
 * grilled 2026-07-16): a confident existing sub-head wins (its head derives);
 * otherwise it's a NEW sub-head named as typed — and if the token also names an
 * existing head, that head is seeded so the new sub-head lands under it. Pure —
 * the caller injects the plannable activity/head lists. Null for an empty token.
 */
export function resolveHash(
  token: string,
  activities: readonly string[],
  heads: readonly string[],
): HashResolution | null {
  const tok = token.trim();
  if (!tok) return null;

  // 1. exact existing sub-head (case-insensitive) — the strongest signal.
  const exact = activities.find((a) => a.toLowerCase() === tok.toLowerCase());
  if (exact) return { subhead: exact, matchedExisting: true };

  // 2. best fuzzy subsequence hit among existing sub-heads (tighter = better).
  let best: { a: string; score: number } | null = null;
  for (const a of activities) {
    const pos = fuzzyMatch(tok, a);
    if (pos) {
      const score = fuzzyScore(pos);
      if (!best || score < best.score) best = { a, score };
    }
  }
  if (best) return { subhead: best.a, matchedExisting: true };

  // 3. new sub-head; seed its head if the token names an existing head.
  const headHit = heads.find((h) => h.toLowerCase() === tok.toLowerCase());
  return headHit
    ? { subhead: tok, head: headHit, matchedExisting: false }
    : { subhead: tok, matchedExisting: false };
}
