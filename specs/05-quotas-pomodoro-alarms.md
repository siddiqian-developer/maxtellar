# PART V — QUOTAS, POMODORO, ALARMS

### 5.1 Weekly quotas (budgeted recurring) — G17
- **Minimum weekly hours per head**, distributed across weekdays.
- Types: **at-least** (more is better) · **at-most** (ceiling; *track, warn, report — never
  block*) · **neutral**.
- Shortfall **redistributes over remaining days of the same week** — weighted by availability
  first (nominal 24h − planned occupancy), then original shape if availability is equal.
- Monster accumulations trimmed by the user during Pruning; **after trim, the deficit stays
  visible on every such item**.
- **Hard boundary: nothing carries beyond the week.** Unfulfilled quota dies at week's end
  (reported as shortfall).

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
