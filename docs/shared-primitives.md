# Shared primitives — check here before hand-rolling

The **buy-first / reuse-first** register (specs §7.0.4 buy-over-build, §7.0.5 UI symmetry).
Before writing a new component or mechanism — and **before editing any hand-rolled one** —
check this list first: if a canonical shared piece already exists, import it; never spin up a
parallel copy. Adding a genuinely new shared primitive? Add a row here so the next person finds it.

| Primitive | Import from | What it is | Enforced by |
|---|---|---|---|
| `useEscClose` | `../useEscClose` | Esc == one level back (§ back-navigation law) — wire every nested overlay | — |
| `DurInput` | `./BudgetPanel` | Smart **duration** input (casual parse → snap → reformat on blur, §7.0.2) | smart-input parity law |
| `DatePicker` + smart date/time field | `./DatePicker` | Smart **date/time** input + direction-aware 📅 picker (§7.0.5) | §7.0.5 symmetry |
| `SubheadField` | `./SubheadField` | Sub-head input with title→sub-head ML suggestion (§7.0.1) | §7.0.5 symmetry |
| `SnapToast` / `useSnapToast` | `../SnapToast` | The one snap-notify toast (§7.0.2) — transient status line for a snap/meaning-change | `snap-toast-guard.test.ts` |
| `useHeads` | `../heads` | Head + sub-head registry (built-ins, defaults, user additions) | — |

**Reuse is enforced three ways** (from cheapest signal to hardest guarantee):

1. **By construction** — one canonical export means there's nothing to re-invent; reach for it.
2. **By this inventory** — the buy-first check has one place to look, so it's cheap to actually do.
3. **By detection** — where duplication is likely, a guard test fails the suite when a bespoke
   copy reappears (today: the snap-notify toast). Discipline is the weakest layer; the guard is
   the real guarantee.

For *external* dependencies (packages, not internal reuse), the same buy-first bias applies via
live registry/GitHub checks — see specs §7.0.4.
