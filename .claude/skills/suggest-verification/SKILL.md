---
description: Fire after EVERY completed code update to maxtellar (any edit to apps/ or packages/ source — features, fixes, styling, refactors). Before ending the turn, give the user a MANUAL verification checklist — concrete steps they click through themselves in the running app, tailored to what changed. Not for spec/docs-only or .claude/-only changes.
---

# Suggest Verification — every update ends with a manual checklist

After finishing any code change, do NOT end the turn with just "done". End it with a
**Manual verification** block: numbered steps the USER performs by hand in the running
app — where to click, what to look at, and exactly what they should see. This is the
human QA pass; it exists even when automated checks (typecheck/tests/browser-cli) all
passed, because the user's own eyes on the real app are the final word.

## Rules for the checklist

- **Manual means human**: each step is an action in the browser UI (click, type, drag,
  toggle, look), never a shell command. If the dev server may not be running, step 0 is
  `npm run dev` in `apps/web` (the `run-timekeeper` skill) and opening `localhost:5173`.
- **Concrete, not generic**: name the exact control ("the ⏩ +5m button on the running
  card", "Settings → Dev sandbox"), and the exact expected observation ("the capsule
  reads STARTED • PAUSED", "the Paused field ticks up each minute") — never "check it
  works".
- **Tailored**: only steps that exercise what changed this turn. 3–7 steps; the shortest
  path through the changed surface, plus one step for the nastiest edge case touched.
- **State the setup cost honestly**: if a step needs prior state (a paused task, dev
  sandbox on, both themes), the checklist builds it in order — the user should be able to
  follow it top-to-bottom without improvising.
- Wall-clock waits are real for the user: prefer the Dev sandbox fast-forward
  (Settings → Dev sandbox, then the ⏩ buttons / dev clock) over "wait 5 minutes".

## Changed-surface → what the manual steps should exercise

| What changed | Manual steps should cover |
|---|---|
| `packages/core` (reducer/settle/placement/rank) | drive the changed event from the UI and watch both projections agree (pipeline card AND timeline block) |
| Pipeline / cards | add → start → pause → resume → complete; at each state read the capsule, hue bar, and every field value for correctness |
| Timeline (seam/edges/ticks) | seed one anchored + one floating task; read edge times (upright vs ~italic), scroll away and back-to-now, watch a reflow |
| Task drawer | add one task per timing chip; try a shorthand title token; force one validation error and see the inline banner |
| Screens/nav (History/Analytics/Config/routing) | visit each screen from the menu; topbar stays visible, active icon underlined; Esc walks back one level |
| Settings | toggle the setting; the gated UI appears/behaves; toggle off; it disappears |
| Theme/tokens (`theme.css`) | view the changed element in light AND dark (topbar toggle), at rest and on hover |
| ML (`ml/`) | type a known-ish title, pause ~2s, watch the sub-head autofill; accept a suggestion; confirm sub-head→head only tags, never autofills |

## Output shape (end of every update turn)

> **Manual verification steps:**
> 0. (if needed) start the app: `run-timekeeper`, open http://localhost:5173
> 1. `<action in the UI>` — you should see `<exact expected result>`
> 2. …
>
> plus one line noting what was already verified automatically (typecheck/tests/browser),
> so the user knows what their pass is adding.

Automated checks (typecheck, `test-timekeeper`, `browser-cli` flows) still run as usual —
this skill doesn't replace them; it guarantees the user always gets their own hands-on
checklist afterwards.
