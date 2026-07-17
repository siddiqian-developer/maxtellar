/**
 * Display codec for head PATH ids (§11.1) — shared by every picker/label.
 * A head always displays as its bare name (user decision 2026-07-18: no
 * "(Category)" qualifier, even when two heads share a name — identity is
 * still the path underneath; only the LABEL dropped the disambiguator).
 * `headIdForLabel` inverts the codec, so free-text fields can keep working
 * on strings while STORING path ids.
 */

import { headName } from "@maxtellar/core";

/** Display label for `id`: always its bare name. */
export function headLabel(id: string, _ids?: readonly string[]): string {
  return headName(id);
}

/** All labels for `ids`, in order (parallel to `ids`). */
export function headLabels(ids: readonly string[]): string[] {
  return ids.map((id) => headName(id));
}

/** Resolve a typed/picked label back to a path id in `ids`, or undefined if
 * it matches none (i.e. the text names a brand-new head). First match wins
 * when the label is ambiguous (shared by more than one head). */
export function headIdForLabel(label: string, ids: readonly string[]): string | undefined {
  const l = label.trim();
  if (!l) return undefined;
  return ids.find((id) => headName(id) === l);
}
