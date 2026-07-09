# PART I — PHILOSOPHY & SOUL

### 1.1 What this is
A personal, highly opinionated time-management instrument. Not a to-do list — a **truthful
model of where your time actually goes**, built on sleep-anchored day cycles, weekly planning,
and a strict no-overlap timeline that bends in real time as life deviates from the plan.

### 1.2 Core metaphor
Organizing a messy, uncertain world. **The plan never goes according to plan** — so below
`now` the plan is provisional, soft, and constantly reflowing; above `now` the record is
certain and known. Time is a flowing river; `now` is the knife-edge where uncertain plan
crystallizes into certain history. The app dramatizes that crossing.
- **The past is editable but can never "push" `now`.** History is not frozen — the user may
  correct it (reality-check edits) — but no edit to the past may ever move `now` or place a
  task's end beyond `now`. `now` is a one-way wall the past cannot cross.

### 1.3 Non-negotiable principles
- **Strict no-overlap** — the one inviolable law (precisely, an *occupancy* law, §5.1).
- **Hyper-realism** — 100% completion is rare; leftovers are normal, not failure.
- **Nothing auto-starts; nothing is assumed** — the app records what the human *declares*
  (one principled exception: it may auto-log its *own* observed usage, §E2).
- **The app never says "no"** — it relocates, proposes, snaps-to-legal, and asks; it never
  refuses a human action.
- **The week is the most central time period** — nothing carries beyond it.
- **No regard for calendar days** internally — the unit is the sleep-to-sleep cycle. Calendar
  dates exist only for reports and collaboration.
- **Strictness IS the product** — the model never bends to be liked; the UI reduces friction,
  the laws do not.
- **Multitasking is bad, but still allowed** — the single-lane model discourages concurrency
  (and MVP forbids it structurally), yet the philosophy *names* multitasking as a negative
  rather than pretending it doesn't happen. The future multilane model exists to *measure* it
  honestly, not to bless it.
- **Maximal editability (gsheets DNA).** The author's 8-year Google-Sheets practice worked
  because *everything* was editable. This app preserves that freedom: **make as much editable
  as possible** — fields, flags, past history, types. The known risk (a spreadsheet lets you
  corrupt it) is contained NOT by locking things down but by a **validation-and-snap layer**:
  edits are accepted freely, then snapped to the nearest legal value (E3) or blocked only when
  truly contradictory (§2.5). Freedom first; guardrails as physics, not as permission walls.

### 1.4 Design soul (drives every UI decision)
- **Audience:** the author first, a public product later — architect with future users in mind.
- **Success — the real "why":** the author is self-employed, juggling projects across
  **immediate / short / medium / long-term** horizons. The core problem is **time-budgeting
  each project** during weekly planning, with the freedom to **drift** from the budget in
  practice while **logging everything for analysis**. This app is intended as the author's
  **lifelong master orchestration tool** — for work *and* life — seamlessly absorbing even a
  future job's tasks. It replaces (and supersedes) an 8-year-old Google Sheets system (see
  §6.x Analytics — that sheet is the ground-truth reference for the analytics model).
- **Emotional posture: neutral mirror** — calm, non-judgmental truth; never praises or scolds.
- **Home = the present** (the now-seam): open → what's running, what's next.
- **Hero metric: Time Accounted vs Unaccounted.**
- **Density: spacious & focused** — one thing at a time; depth via navigation, not cramming.

### 1.5 Visual language
- **Inspiration:** Claude's own theme — warm ivory/cream, charcoal text, a single terracotta
  accent reserved for *living* elements (now-seam, running task, primary action).
- **Bar:** very premium, subtle, clean, professional, sharp, work-focused (Linear × Things 3 ×
  Claude's warmth). Hairline borders over shadows; strict type scale; **tabular-lining
  numerals** for all times/durations; minimal corner radius; quiet, composed empty states.
- **Seam duality (strong):** below `now` = lighter, softer, dashed/provisional, gently
  reflowing; above `now` = solid, settled, frozen. The now-seam is the signature moment.
- **Motion: pervasive fluidity, meaningful not decorative.** Reflow is *gently witnessed* —
  cards ease to new positions so the user sees the plan bending under reality. Invest most in
  three signature moments: reflow easing, the now-seam crossing, task start/complete.

---
