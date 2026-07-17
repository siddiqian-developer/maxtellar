/**
 * Small shared text-display helpers.
 *
 * §6 dropdown law (2026-07-18): every `<option>` in every dropdown renders in
 * Capital Case ("Budgeted", "Week Plan", "Semi-Head") — the underlying VALUE
 * stays untouched (lowercase ids keep round-tripping); only the label passes
 * through `capitalCase`.
 */

/** "semi-head" -> "Semi-Head", "weekPlan" -> "Week Plan", "budgeted" -> "Budgeted". */
export function capitalCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase -> spaced
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(s.includes("-") ? "-" : " ");
}
