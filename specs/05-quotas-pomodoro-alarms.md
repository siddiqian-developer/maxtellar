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
  weekly head's **today share, post-redistribution** (an inflated share shows "+X carried in");
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

### 5.3 Alarms
- **Ship best-effort in MVP:** in-app sound + system notifications where the installed PWA
  allows; documented honestly (the mobile app later makes them reliable).
- Events: fixed-start approaching, leading-start arrived, overrun, at-most-quota warning,
  pomodoro transitions, SOD reminder.

---
