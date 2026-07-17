/**
 * Display codec for head PATH ids (§11.1) — shared by every picker/label.
 * A head displays as its bare name; when two heads share a name (legal —
 * identity is the path), the label carries the category: "Social Media
 * (Not Work)". `headIdForLabel` inverts the codec, so free-text fields can
 * keep working on strings while STORING path ids.
 */

import { headName, headCategory } from "@maxtellar/core";

/** Display label for `id` among `ids`: bare name, category-qualified iff the
 * name is shared by another head in the list. */
export function headLabel(id: string, ids: readonly string[]): string {
  const name = headName(id);
  const dup = ids.some((h) => h !== id && headName(h) === name);
  return dup ? `${name} (${headCategory(id) ?? "?"})` : name;
}

/** All labels for `ids`, in order (parallel to `ids`). */
export function headLabels(ids: readonly string[]): string[] {
  return ids.map((id) => headLabel(id, ids));
}

/** Resolve a typed/picked label back to a path id in `ids`, or undefined if
 * it matches none (i.e. the text names a brand-new head). Accepts both the
 * qualified "name (category)" form and a bare name (first match wins). */
export function headIdForLabel(label: string, ids: readonly string[]): string | undefined {
  const l = label.trim();
  if (!l) return undefined;
  const exact = ids.find((id) => headLabel(id, ids) === l);
  if (exact) return exact;
  return ids.find((id) => headName(id) === l);
}
