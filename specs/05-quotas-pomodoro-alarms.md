# PART V — QUOTAS, POMODORO, ALARMS

### 5.1 Weekly quotas (budgeted recurring) — G17, reconciled with §11 (2026-07-16)
> Weekly quotas **COEXIST** with §11's per-day budgets — §11 did not replace them (user ruling
> 2026-07-16). The two are alternative **budgeting modes**; the mechanics below are locked.
- **Per-head mode, exclusive.** Each budgeted head is EITHER **daily** (absolute hours; or **%** of
  netCore if Core Work, §11.3) OR **weekly** (quota hours + type). One head never carries both.
- **Types:** **at-least** (floor; more is better) · **at-most** (ceiling; *track, warn, report —
  never block*) · **exact-match** (aim for exactly this; was "neutral").
- **Weekly quotas enter the 24h gate via distributed shares.** At planning, the quota is
  distributed across the head's planned weekdays — user-editable shares, **default even split**
  (this is the "original shape"). Each day's share is an ordinary absolute line in that day's
  **24h zero-sum** (§11.2): the gate stays universal, `Σ(daily heads + weekly shares + Sleep) === 24h`.
- **Shortfall redistributes over remaining days of the same week** — weighted by availability
  first (a day with a smaller existing share / larger netCore takes more), then original shape as
  tiebreak. **The Core-%-residual is the shock absorber:** a redistributed hour raises the quota
  head's absolute claim on that future day → netCore shrinks → %-Core heads reflow automatically →
  the day **still balances to 24h by construction**. No head is silently deleted.
- **Type asymmetry:** *at-least* — shortfall redistributes forward; overshoot leaves future shares
  unchanged. *at-most* — never redistributes; overrun warns, never blocks. *exact-match* —
  symmetric: shortfall redistributes forward AND overshoot reduces remaining days' shares.
- Monster accumulations trimmed by the user during Pruning; **after trim, the deficit stays
  visible on every such item**. *(Built 2026-07-16.)* Mechanics: the Pruning step lists each
  **at-least/exact** weekly head's **today share, post-redistribution** (an inflated share shows
  "+X carried in") — *at-most* heads never accumulate (they never redistribute), so a ceiling
  shows no trim row (lowering a ceiling is a planning edit, not a Pruning trim);
  the user edits the share they'll KEEP (Smart Input). **Reduce-only** — an entry above the share
  snaps back with the snap-notify naming head + rule; UNDER is the trim itself, never snapped.
  The cut lands on the week-instance ledger as a `kind: "trim"` adjustment (template untouched)
  and **never redistributes again** — the next SOD compares achieved against the already-trimmed
  share. The deficit stays reported (Pruning row pill + Analytics "· trimmed, X deficit" on the
  quota standing, whose "to go" still counts the full quota) until it dies at week's end.
- **Hard boundary: nothing carries beyond the week.** Unfulfilled quota dies at week's end
  (reported as shortfall; at-most overrun reported as overrun).

### 5.2 Pomodoro (per running task) — G-pomo
- **Modal-driven, zero automation (G11-pure).** Work interval ends → modal **[Take break] /
  [Keep working: +5 / +10 / +15 / +1 pomodoro]** → cycle repeats. Break end is symmetric: alarm
  + modal **[Resume work] / [Extend break +5/+10/+15]**.
- **Accounting:** breaks **eat budget** (a pomodoro task's budget = work + sanctioned breaks).
  Modal-decision minutes → **Self-Management**. Post-break idle (never resumed) → **per-task
  wasted** (end pushes later, unbounded — the honest mirror; app never auto-pauses).
- **Quotas count the whole pomodoro task** (60m task = 60m to the head, breaks included).
- Phases (work/break) are **internal ledger channels of the running task**, not spine segments.
- **Config:** global presets (25/5×4+15, 50/10, …) + per-task override at Start.
- **Mechanics (built 2026-07-16, Stage 7a).** A pomodoro run carries live state on the running
  task: `{ config, phase: "work"|"break"|"longBreak", phaseLen, phaseStartedAt, cycle }`. `phaseLen`
  starts at the config length and grows with each extend; `phaseStartedAt` anchors elapsed. **Zero
  automation** — the reducer never switches phases; the UI raises the alarm+modal when the derived
  `pomodoroView.due` (phase elapsed ≥ `phaseLen`) flips, and only an explicit tap transitions:
  - `POMODORO_BREAK` (work→break): `cycle+1`; every `cyclesBeforeLong`-th completed work interval
    the break becomes a **longBreak** (else a normal break); phase clock resets.
  - `POMODORO_RESUME` (break/longBreak→work): back to a work interval; clock resets.
  - `POMODORO_EXTEND {minutes}`: grows the **current** phase's `phaseLen` (Keep working +5/+10/+15;
    **+1 pomodoro** = extend work by `workMin`; Extend break +5/+10/+15). No phase change.
  - **Channel attribution per tick (the ledger, not spine):** minutes up to `phaseLen` accrue to the
    phase's primary channel — **work → `spent`, break/longBreak → `breaks`**; minutes **beyond**
    `phaseLen` (you're past the interval, the app never auto-pauses) accrue to the decision channel —
    **after work → `managed`** (Self-Management: deciding to break/continue), **after break →
    `wasted`** (post-break idle — the honest mirror). Non-pomodoro tasks route all minutes to `spent`
    as before (`breaks` stays 0).
  - **Breaks eat budget, universally:** `remaining = budget − (spent + breaks)` in `cursorOf` /
    `runningView` / the pause remainder (a pure generalization — 0 `breaks` for every non-pomodoro
    task, so behavior is unchanged there). `managed`/`wasted` sit OUTSIDE budget (they push the end
    later, unbounded). Overrun = `spent + breaks > budget`.
  - Pomodoro state is **per-run**: pausing ends the run; re-starting the remainder is a fresh Start
    (attach a config again to resume pomodoro). The whole task still counts to quotas (breaks
    included).

### 5.3 Alarms
- **Ship best-effort in MVP:** in-app sound + system notifications where the installed PWA
  allows; documented honestly (the mobile app later makes them reliable).
- Events: fixed-start approaching, leading-start arrived, overrun, at-most-quota warning,
  pomodoro transitions, SOD reminder.
- **Mechanics (built 2026-07-16, Stage 7b).** A **pure, derived watcher** — no core changes, no
  events. `alarmSignals(state)` returns the currently-active conditions, each with a **stable key**
  (so a one-shot fires once and a persist tracks until it clears): pomodoro-due, running overrun,
  anchored-start arrived (start ≤ now, still unstarted) / approaching (≤ 5 min ahead), at-most
  weekly-quota exceeded (warn, never block — §5.1), and SOD-ready. The `useAlarms` hook diffs
  signals each tick: a newly-appearing key sounds once + fires a system `Notification` (where
  granted) + shows an in-app **banner** (the always-available layer — carries the alarm even when
  sound/permission are unavailable). Urgent kinds (overrun / at-most / arrived) get the danger
  accent + a ringing bell.
- **Behavior — one global toggle (§ user ruling 2026-07-16):** `persist` (default) keeps a banner
  until its condition clears or the user dismisses it; `oneshot` self-clears after a short spell.
  One switch governs all alarms.
- **Sound — asset-free by default (§7.0.4 Scratch tier):** the **default is a synthesized WebAudio
  tone**; a **built-in library** of synth patterns (Chime / Double / Rising / Alert) needs no
  bundled binaries; and the user can **add their own audio files** (stored as data URLs, played via
  `<audio>`). All best-effort — a blocked AudioContext (no gesture yet) or denied Notification
  permission degrades to the visual banner. Enabling alarms requests Notification permission once.

---
