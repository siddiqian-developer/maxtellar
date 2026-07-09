---
description: Use whenever the user's prompt changes, adds, or overrides a design decision, rule, behavior, law, or scope for the maxtellar app — even if the prompt is primarily a coding request. Updates the modular spec in specs/ so it stays the single source of truth.
---

# Update Specs

The spec lives in `specs/` as one file per part, with `specs/00-index.md` as the
table of contents. It is the contract the build follows — when the user decides
something new in conversation, the decision must land in the spec or it is lost.

## When to fire

- The user states a new rule, changes an existing behavior, or reverses a prior decision.
- The user answers an open question (check `specs/10-open-items.md` — resolve and remove it there).
- The user expands or trims MVP scope (`specs/08-mvp-boundary.md`).
- A coding prompt implies a spec change ("actually make pause also stop the quota clock").

Do NOT fire for pure implementation choices (variable names, file layout, refactors)
that the spec doesn't govern.

## Procedure

1. Read `specs/00-index.md` to pick the affected part(s). Read only those files.
2. Edit the relevant section in place. Match existing style: rule tags (G#, E#, R#),
   terse contractual prose, `**bold**` for load-bearing terms.
3. New rules get the next free tag in their family (grep all of `specs/` for the
   highest existing G/E/R number first).
4. If the change contradicts a locked core law (Part I §1.3, no-overlap §3.1), don't
   silently overwrite — tell the user which law it conflicts with and confirm.
5. If a change resolves an item in `10-open-items.md`, delete it from there.
6. Bump nothing else: no version churn, no reformatting of untouched sections.
7. In your reply, state which spec file(s) and section(s) you updated.

## Layout

- `00-index.md` — preamble + links (update only when adding/removing a part)
- `01-philosophy.md` … `10-open-items.md` — one part each
- (the old root-level `SPEC.md` / `SPEC-timekeeper.md` were deleted 2026-07-09)
