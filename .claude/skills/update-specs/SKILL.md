---
description: Fire on EVERY user prompt that introduces any decision, preference, behavior, design change, or constraint for the maxtellar app — even mid-coding-request. Enforces the "code is disposable" rule; prompts must become spec/docs markdown so the app is fully regenerable from the md files alone.
---

# Update Specs — the "code is disposable" doctrine

**The law:** if all code were deleted, the markdown in this repo (`specs/` + `docs/`)
must suffice to regenerate *exactly this app*. Code is never the only home of a
decision. Every prompt that adds information must land that information in markdown
**in the same turn** as (or before) the code change.

## What must be captured, and where

| Kind of decision | Destination |
|---|---|
| Behavior, rule, law, scope change | the affected `specs/` part (via `00-index.md`) |
| Resolved open question | edit + remove from `specs/10-open-items.md` |
| UI/UX interaction or layout decision | `specs/06-views.md` |
| Visual design values (colors, type, radius, motion) | `docs/design-tokens.md` (exact values, not adjectives) |
| Implementation patterns worth keeping (algorithms, wire contracts) | a `docs/*.md` reference file |
| Tech-stack / architecture choice | `specs/07-engineering.md` |

NOT captured: transient debugging, environment quirks (WSL, ports), one-off requests
that leave no trace in the app's behavior.

## Procedure

1. Read `specs/00-index.md`; open only the affected part(s).
2. Land the change in markdown FIRST (or same turn), then code it.
3. Match spec style: rule tags (G#, E#, R# — grep for the highest free number),
   terse contractual prose, **bold** load-bearing terms.
4. Conflicts with a locked core law (Part I §1.3, no-overlap §3.1): flag to the user,
   don't silently overwrite. External *reference material* that conflicts: reject
   silently (the reference-triage rule).
5. Exact values beat adjectives: hex codes, px, ms, easing curves go in
   `docs/design-tokens.md` whenever the UI's look changes.
6. In your reply, state which md file(s) you updated.

## The regeneration test (run mentally every time)

Ask: "could a fresh session rebuild this exact feature from the md alone?"
If any part of the answer lives only in code or only in the conversation, the
capture is incomplete — fix it before finishing the turn.

## Layout

- `specs/00-index.md` — preamble + links; `01`…`10` — one part each
- `docs/design-tokens.md` — exact visual values (single source for theme.css)
- `docs/*.md` — implementation references
