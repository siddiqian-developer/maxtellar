/**
 * Subsequence ("literal letters, in order") matching for filtered dropdowns
 * (SPEC VI): typed characters must all appear in the candidate, in the same
 * order, not necessarily contiguous — e.g. "te" matches "The Exercise" via
 * the T and e of "The". Greedy leftmost match; case-insensitive.
 */

/** Returns the matched character indices in `text`, or null if `query`'s
 * letters don't all appear in order. Empty query matches everything at []. */
export function fuzzyMatch(query: string, text: string): number[] | null {
  if (!query) return [];
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const positions: number[] = [];
  let from = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = t.indexOf(q[i] as string, from);
    if (idx === -1) return null;
    positions.push(idx);
    from = idx + 1;
  }
  return positions;
}

/** Tighter clusters (smaller span between first/last match) rank better. */
export function fuzzyScore(positions: number[]): number {
  if (positions.length === 0) return 0;
  return (positions[positions.length - 1] as number) - (positions[0] as number);
}
