# Add/Edit Drawer — design reference (from agent-smith)

Source: `/mnt/d/AI Agents Intensive Vibe Coding Capstone Project/agent-smith/ui/`
(the author's prior GCal-agent app; its scheduler failed, but the drawer UI is a
liked reference — see spec Part VIII). Take **interaction patterns**, restyle to
maxtellar's visual language (spec §1.5). Do NOT import scheduler logic.

Repo layout note: `legacy/app` holds an older backend and `tests/v3` marks the
v3 rebuild — but the UI is the same across versions (per the author), so `ui/`
at the repo root is the only place to read for drawer patterns.

## Key files there

- `ui/index.html` (~line 569) — drawer markup (`#edit-drawer-root`)
- `ui/components/timefields.js` — pure derivation engine (DOM-free)
- `ui/components/timeedit.js` — shared edit "shell": parsing, sentinels, validation
- `ui/index.css` (~1062–1240) — drawer/pill/stepper styles

Every pattern below is triaged into the three reference types:
**Type 1** adds to maxtellar's spec (now recorded there) · **Type 2** is
implementation detail of an already-specced behavior · **Type 3** contradicts
the spec and is **rejected** — listed only so nobody re-imports it.

## Type 1 — additive, folded into the spec (Part VI, task entry)

1. **Tappable derived type chips**: the timing type is computed from field
   presence but tapping a type shapes the form to it (agent-smith's status-pill
   radiogroup, translated to maxtellar's five timing types §2.3).
2. **Time-stepper chevrons** on each HH:MM input (5-min steps, `tabindex="-1"`
   so keyboard flow skips them).
3. **Drawer chrome**: right-side slide-in card (max-width 440px, scrim overlay,
   `slideLeft 0.25s cubic-bezier(0.16,1,0.3,1)`), sticky header with title +
   close, Cancel/primary footer, `role="dialog" aria-modal`. Restyled to the
   ivory/terracotta hairline language (§1.5).

## Type 2 — implementation detail of existing spec rules

1. **Field derivation** (`deriveTimeFieldEdit`): entering a second of
   budget/start/end derives the third; on all-three edits, stability order
   start > budget > end. This *matches* spec §3.6's table exactly (edit Start →
   End changes; edit Budget → End changes; edit End → Budget changes) — a
   working reference implementation, to be rewritten in `packages/core`.
2. **Validation as data** (`validateTimeEdit`): pure function returns
   `{errors, warnings}` (zero duration, budget < spent, clearing a load-bearing
   budget on a touched task); caller decides presentation. Implements E3-style
   guards.
3. **Minute-tolerant preserve** (`encodeOrPreserve`): if the visible HH:MM
   equals the stored timestamp's HH:MM, send the stored value unchanged —
   re-encoding truncates seconds and reads as a phantom edit. Protects our
   anchored starts (G3).
4. **""-vs-null sentinels** for partial updates: `null` = unchanged, `""` =
   explicit clear, value = set.
5. **Shell/engine split**: pure DOM-free math module shared by drawer and
   inline edits; mirrors our core/web split (§7).

## Type 3 — contradicts the spec, REJECTED (do not re-import)

- **"Use AI" button** in the form — spec: no AI/LLM anywhere, 100% local (Part VI).
- **5-minute budget grid snapping** — spec is minute-resolution; only physics
  snapping (E3) coerces user input. User edit is sacred (§3.6).
- **09:00–18:00 work-hours warning** — maxtellar has no regard for calendar
  days or fixed work hours; days are sleep-to-sleep (§1.3, §4.1).
- **Task-type dropdown (Deep Work/Admin/Quick Reply/Meeting)** — maxtellar uses
  heads/activities (§2.1).
- **Four-state scheduling taxonomy as canonical** — maxtellar has five timing
  types (§2.3); only the derived-pill *affordance* was taken (Type 1).
- **"Reality Collision" lock screen** — the app never says "no" and never locks
  the user out; overlaps are impossible by construction (§3.1) and proposals
  relocate (§1.3).
- **Its scheduler/replan logic and multi-agent chat** — entire reason the prior
  app failed; scheduler is spec-first here.
