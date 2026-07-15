# PART V — QUOTAS, POMODORO, ALARMS

### 5.1 Head budgets (per-day zero-sum) — G17, REVISED by §11 (2026-07-16)
> The original §5.1 framed quotas as **weekly totals** with at-least/at-most types and automatic
> availability-weighted redistribution. **§11 (time budgeting) replaces that model.** What changed:
- **Per-day, not per-week.** A head's budget is part of a weekday's **24h zero-sum day-shape**
  (§11.2); there is no weekly-total entry. Weekly hours are an *analytics roll-up* (budget × planned
  days), never an input.
- **No at-least / at-most / neutral types.** A budget is an exact envelope claim in a hard-balanced
  24h day. Overrun/underrun vs budget is **tracked and reported** (runtime accounting §2.6,
  analytics §11 Stage 5) — the old "track, warn, never block" spirit survives at runtime; planning
  is gated to exactly 24h.
- **Automatic weighted redistribution is REMOVED.** Days are independent instances (§11.7); hours
  never reflow across days by formula. Its replacement is **task spill**: concrete tasks that fall
  out of a day's 24h window push to the next day.
- **Survives unchanged:** the hard week boundary — nothing carries beyond the week; unfulfilled
  budget dies at week's end, reported as shortfall. Pruning trims monster accumulations and **the
  deficit stays visible on every trimmed item**.

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
