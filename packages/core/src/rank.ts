/**
 * LexoRank-style fractional ranking (E4).
 * Ranks are lowercase a-z strings ordered lexicographically.
 * rankBetween(a, b) returns a string strictly between a and b.
 */

const MIN_CH = 97; // 'a'
const MAX_CH = 122; // 'z'
const MID = "m";

export function rankBetween(a: string | null, b: string | null): string {
  const lo = a ?? "";
  const hi = b ?? "";
  if (lo === "" && hi === "") return MID;

  let result = "";
  let i = 0;
  for (;;) {
    const cl = i < lo.length ? lo.charCodeAt(i) : MIN_CH - 1; // virtual 'before a'
    const ch = i < hi.length ? hi.charCodeAt(i) : MAX_CH + 1; // virtual 'after z'
    if (ch - cl > 1) {
      // room for a midpoint at this position
      const mid = Math.floor((cl + ch) / 2);
      return result + String.fromCharCode(mid);
    }
    // no room: copy the low char (or 'a') and continue deeper
    result += String.fromCharCode(cl < MIN_CH ? MIN_CH : cl);
    i++;
    if (i > 64) {
      // pathological depth — append midpoint and accept longer key
      return result + MID;
    }
  }
}

export function rankAfter(a: string | null): string {
  return rankBetween(a, null);
}

export function rankBefore(b: string | null): string {
  return rankBetween(null, b);
}

/** Generate n evenly spread initial ranks. */
export function initialRanks(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = rankAfter(prev);
    out.push(prev);
  }
  return out;
}
