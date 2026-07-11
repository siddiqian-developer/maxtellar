---
description: Whenever building a NEW UI component for maxtellar (not editing an existing one — that requires the user's explicit ask), first check the v3-rebuild reference (agent-smith's `v3-rebuild` git branch) for an equivalent pattern to triage before writing from scratch.
---

# Consult v3-rebuild

**v3-rebuild is the standard reference** for maxtellar's UI: a **git branch** (not a
folder) named `v3-rebuild` in the user's prior app at
`/mnt/d/AI Agents Intensive Vibe Coding Capstone Project/agent-smith`. On that branch the
current UI lives at `ui/` (`app.js`, `index.html`, `style.css` — a from-scratch rebuild,
much smaller than the old prototype) while the old JS UI is filed under `legacy/ui/` on
that same branch. **Do not confuse this with the checked-out branch's `ui/`** — other
branches (e.g. `latest-ui-with-taskboard`, which may be what's checked out) have a
different, older `ui/` layout (`components/`, `modules/`) that is NOT v3-rebuild.

## Reading the branch safely

The repo may have uncommitted changes on whatever branch is checked out — never `git
checkout v3-rebuild` in place. Read files without switching branches:

```
git -C ".../agent-smith" show v3-rebuild:ui/index.html
git -C ".../agent-smith" show v3-rebuild:ui/app.js
git -C ".../agent-smith" show v3-rebuild:ui/style.css
git -C ".../agent-smith" ls-tree -r v3-rebuild --name-only   # full file list
```

## When this fires

- **New UI component** (doesn't exist yet in maxtellar): consult v3-rebuild first, before
  writing code. Always, unless the user says otherwise for that instance.
- **Editing an existing maxtellar component**: do NOT consult v3-rebuild unless the user
  explicitly asks. Default is to work from maxtellar's own spec/code/history only.

## Procedure for a new component

1. `git ls-tree -r v3-rebuild --name-only` and `git show v3-rebuild:<path>` to find the
   closest equivalent in `ui/` (and, if server-driven, the matching `app/` route/util —
   don't assume the feature is only CSS; e.g. the global clock's real payload was
   timezone-aware `Intl` formatting driven by a user timezone/format preference, not just
   a styled `<div>`).
2. Triage every pattern found using the **reference-triage rule** (memory
   [[reference-triage-rule]]): additive → fold into `specs/`; implementation detail → note
   in a `docs/*.md` reference or inline; contradicts maxtellar's spec/laws (e.g. anything
   assuming a backend — maxtellar is local-first, no backend in MVP, §7.2) → reject
   silently, no need to ask.
3. Build the component in maxtellar's own stack/style (§7.2, `docs/design-tokens.md`),
   informed by what survived triage — never copy files or provenance-laden comments (see
   the purge-external-references rule: no app names, paths, branch names, or "prior app"
   phrasing in any maxtellar file).
4. Record what you kept and why per §7.0 (code is disposable) — the decision goes in
   `specs/` or `docs/`, not just in the component's code.

## Scope reminder

This is a *default first step for new components*, not a blank check to import
v3-rebuild's architecture, backend, or agent/scheduler logic — those are explicitly out
(see [[agent-smith-prior-app]]).
