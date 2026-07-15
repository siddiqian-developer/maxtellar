# PART XI — TIME BUDGETING & THE CATEGORY TIER (design, 2026-07-15)

> **Status: designed, not yet built.** Locked via two grill rounds (2026-07-15). This part
> **REVISES §5.1** (which framed quotas as *weekly totals* with at-least/at-most + redistribution).
> The model below replaces that with a **per-day, zero-sum, hard-balanced day-shape**. The new chat
> must reconcile §5.1 against this before building. Naming of two Categories is still open (§11.10).

## 11.0 Philosophy — zero-based budgeting for time
A day is a fixed 24-hour envelope that cannot be expanded. As money is envelope-budgeted (every
dollar gets a job before it is spent; the budget must balance to income), **every hour gets a job
before the day begins, and the plan must balance to exactly 24h or it is a lie.** Conservation is
made physical: breaching 24h *snaps* the offending entry back. Core Work is the **elastic residual** —
everything non-negotiable is subtracted first, and deep work claims a *percentage of what remains*,
so the cost of overhead stays visible in the one number that matters. See [01-philosophy.md].

## 11.1 The Category tier (3-level hierarchy)
Introduce a level **above** heads: **Category → Head → Sub-head** (was Head → Sub-head).
- Categories seen so far: **Core Work**, **Supportive Work**, **Not Work**, **Time Wasted**
  (last two names tentative — §11.10).
- **Identity is the PATH, not the name.** The same activity name may live under two Categories with
  different meaning — e.g. *Socialization* under Supportive Work (regenerative) vs under Time Wasted
  (indulgent). A sub-head is `(category, head, sub-head)`, not a global string. This confirms the
  tree is load-bearing, and the head registry (`heads.tsx`, §2.1) grows a Category parent.
- Example tree the user gave (Category / Head / Sub-head), for fixtures:
  - **Core Work** → Self-Management (Strategy & Planning, Personal Philosophy) · Health · Job (Core
    Work, Fundraising, Job Search) · Self-Learning (English-Speaking Practice, Public Speaking,
    Investor Hunting, Networking) · Other Work #1 · Other Work #2
  - **Supportive Work** → Food (Kitchen work) · Cleaning · Plantcare · Clothes Work · Regenerative
    (Machine Maintenance, Nap, Rest, Meditation, Break, Exercise, Socialization)
  - **Not Work** → Social Media · Sports
  - **Time Wasted** → Social Media · Socialization

## 11.2 The 24h zero-sum day-shape (per-day, hard-balanced)
- Budgets are **per-day**, set on **HEADS** (§11.6 for sub-head depth), rolling up to Categories,
  and the shape repeats across the planned weekdays. **Each weekday may carry a different shape.**
- **Planning is GATED to exactly 24h.** You cannot finish / Start-Week until `Σ(all head budgets,
  incl. Sleep) === 24h`. Over → snap the entry that breached back to the value that restores 24h,
  **notify + highlight the head AND its Category**. Under → **also blocked**, with a live indicator
  (`needs 24h − Σ = X more`). **No buffer, no slack** (user ruling: block until exactly 24h).
- This is the planning-time analogue of the runtime zero-sum wall (accounted + lost = wall, §2.6).

## 11.3 Subtraction chain & the Core Work %-residual
Only **Core Work heads** may be entered as a **percentage**; every other head is absolute-hours.
```
R0        = 24h − Sleep
R1        = R0 − Σ(all ABSOLUTE non-core head budgets)     // obligations, upkeep, etc.
netCore   = R1 − Self-Management                            // Self-Management is absolute, no %
percentEntry(h) = h.pct / 100 × netCore                     // hours, for a Core Work head h
```
- The **%-value is live-elastic**: hours reflow automatically as overhead (sleep, obligations,
  Self-Management) changes; **the % text always stays shown** (never replaced/hidden by the hours).
- A Core Work head *may* still be absolute; % is simply the option only Core Work gets.
- Self-Management is **never** a percentage (it is overhead, subtracted before the residual).

## 11.4 Sleep — the head of the day
- Sleep is a first-class head with an **absolute** budget, part of the 24h sum ("sleep is the head
  of the day"). Editable in **both** weekly planning and Settings, **synced** (one source of truth).
- Default: same value each planned day unless varied per-weekday (§11.10 open).

## 11.5 Timing, pinned vs ranked, and the rank mechanism
- A weekly head's timing is **`fixed`** (clock-anchored) or **`budgeted`** (flexible fill) **only** —
  never semi-head/semi-tail/unscheduled.
- **Pinned** (not jostled): **Sleep** (day-head), any **fixed**-timing head (sits at its clock),
  **Self-Management** (protected overhead, subtracted first).
- **Ranked**: every remaining **budgeted** head carries a **user-set rank** that drives fill order at
  SOD, **independent of list position**. A reorder affordance is required (drag or up/down) plus a
  **collapse-all**.

## 11.6 Category targets — roll-up by default, hard-fit on explicit entry
- By default a Category's budget is **just the sum (roll-up) of its heads** — displayed, not
  constrained.
- The moment the user **types an explicit target** on a Category, it becomes a **hard fit**: its
  heads must sum **exactly** to that target (same snap discipline as the 24h wall, scoped to the
  Category). Absent an explicit target, no per-Category constraint — **only the grand 24h total is a
  hard gate.**
- Budgets at HEAD level only for now; sub-head depth is §11.10.

## 11.7 Weekly template → daily SOD → overflow spill
- The weekly plan is a **reusable template**. Each **SOD spins up an independent day** from the
  matching weekday's shape; sub-heads/tasks are chosen at SOD and **draw down their head's budget in
  rank order** (§4.4 injection already ranks below leftovers — extend to honour head budgets/rank).
- **Daily override** is allowed within the day, but **cannot cross the 24h wall** (reality limit),
  and at SOD you do **not** have a fresh 24h — Sleep and already-consumed tasks have taken their
  share. Tasks that fall out of the 24h window are **pushed to the next day** (spill), not dropped.
- Daily edits **never** mutate the weekly template or other days (each day is its own instance).

## 11.8 UI — beside the calendar in weekly planning
- **Two-pane** (recommended): a **collapsible outliner** (Category ▸ Head ▸ Sub-head; budgets + %
  badge inline; drag-rank; collapse-all) on one side, a **live 24h stacked bar** (the conservation
  gauge — fills as you allocate, flashes the offending segment on breach) on the other. The existing
  **week calendar grid** (§4.4/§4.6) remains the placement-preview surface.
- Reuse the §4.6 calendar preview; the budgeting outliner is a sibling view within Weekly Planning.

## 11.9 Data-model deltas (sketch, for the build chat)
- `Category` tier (id, name, order) above `WeekTemplate.headId`; head registry gains a category.
- `WeekTemplate`/head budget entry gains: `budgetKind: "absolute" | "percent"` (percent only if
  the head's Category is Core Work), `pct?` (0–100), `rank` (already exists), pinned derives from
  timing/identity. `Sleep` absolute synced to Settings.
- A weekly-plan validity selector: `Σ === 24h` (gate), per-Category explicit-target fits, live
  netCore + %→hours projection. All pure/event-sourced; the 24h + % math belongs in `packages/core`.

## 11.10 Open micro-items (confirm in the build chat)
1. **Category names**: *Supportive Work* → Upkeep / Maintenance / Sustaining Work; *Not Work* →
   Leisure / Living / Recreation. (Core Work, Time Wasted keep their names.) — user to pick.
2. **Sleep per-weekday** variance vs one global value.
3. **Multiple %-core heads**: they split netCore by their percentages — do they have to sum to
   100% of netCore, or can they under/over-subscribe it (and does the 24h gate catch that)?
4. **Absolute Core Work heads** interaction with netCore (subtract before %-split, presumably).
5. **Reorder affordance** (drag vs up/down) and **collapse-all** placement.
6. **Snap UX** exact wording/animation on the 24h breach and Category-target breach.
