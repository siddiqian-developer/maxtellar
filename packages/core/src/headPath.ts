/**
 * Head-path identity (§11.1, locked 2026-07-17): a head's identity is its PATH
 * `(category, head)`, not its bare name — the same head name may live under two
 * Categories with different meaning (e.g. "Social Media" under Not Work vs
 * Wasted Time).
 *
 * The path is ENCODED AS ONE STRING so `headId` stays `string` everywhere
 * (reducer, events, persistence untouched): `category + SEP + name`, with a
 * separator that can never appear in a typed name (an ASCII control char,
 * stripped at input). Display always uses the bare name via `headName`.
 */

/** Path separator — U+001F (unit separator). Not typeable; stripped from names. */
export const HEAD_PATH_SEP = "";

/** Encode a (category, head-name) path into the canonical headId string. */
export function headPath(category: string, name: string): string {
  return category + HEAD_PATH_SEP + name;
}

/** True if this headId is a path (vs a legacy bare name). */
export function isHeadPath(id: string): boolean {
  return id.includes(HEAD_PATH_SEP);
}

/** Decode a headId into its (category, name) pair. A bare name (no separator)
 * decodes as { category: undefined, name: id } so display code never breaks. */
export function parseHeadPath(id: string): { category: string | undefined; name: string } {
  const i = id.indexOf(HEAD_PATH_SEP);
  if (i < 0) return { category: undefined, name: id };
  return { category: id.slice(0, i), name: id.slice(i + 1) };
}

/** The display name of a head (path-aware; bare names pass through). */
export function headName(id: string): string {
  return parseHeadPath(id).name;
}

/** The category of a path headId, or undefined for a bare name. */
export function headCategory(id: string): string | undefined {
  return parseHeadPath(id).category;
}

/** Strip characters that would corrupt a path from user-typed names. */
export function sanitizeHeadName(raw: string): string {
  return raw.replaceAll(HEAD_PATH_SEP, "").trim();
}
