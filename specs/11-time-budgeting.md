# PART XI — TIME BUDGETING & THE CATEGORY TIER (design, 2026-07-15)

> **Status: fully designed, not yet built.** Locked via two grill rounds (2026-07-15); the six
> §11.10 micro-items resolved by grilling 2026-07-16. **Weekly quotas (§5.1) COEXIST with this
> model** (user ruling 2026-07-16): each budgeted head is EITHER daily-budgeted (absolute / %) OR
> weekly-quota'd (hours + at-least / at-most / exact-match) — weekly quotas project **distributed
> per-day shares** into the 24h zero-sum day-shape, and shortfall redistribution is absorbed by
> the Core-%-residual. Mechanics in §5.1.

## 11.0 Philosophy — zero-based budgeting for time
A day is a fixed 24-hour envelope that cannot be expanded. As money is envelope-budgeted (every
dollar gets a job before it is spent; the budget must balance to income), **every hour gets a job
before the day begins, and the plan must balance to exactly 24h or it is a lie.** Conservation is
made physical: breaching 24h *snaps* the offending entry back. Core Work is the **elastic residual** —
everything non-negotiable is subtracted first, and deep work claims a *percentage of what remains*,
so the cost of overhead stays visible in the one number that matters. See [01-philosophy.md].

## 11.1 The Category tier (3-level hierarchy)
Introduce a level **above** heads: **Category → Head → Sub-head** (was Head → Sub-head).
- Categories are an **ordered list** the app ships with, **and the user may ADD their own**
  (add-only, 2026-07-17). The seeded categories are not renamed or deleted (that keeps the §11.3
  budgeting roll-ups well-defined); a user-added category behaves like any seeded one. **Category
  order is user-controllable** (§11.1a) and is the order everything category-grouped renders in
  (registry screen, budgeting panels).
- **Shipped default categories, in order** (the data the app ships with, 2026-07-17):
  1. **Recharging** — Recharge* → Sleep, Nap
  2. **Core Work** — Self-Management (Strategy and Planning, Research, Project Execution) · Job
     (Sales, Fundraising, Job Search, Marketing) · Public Speaking · Investor Hunting · Networking ·
     Other Work #1 · Other Work #2
  3. **Maintenance** — Food* (Kitchen work) · Health · Cleaning · Plantcare · Clothes Work
  4. **Regeneration** — Rest · Meditation · Break · Exercise · Socialization
  5. **Upgrading** — Personal Philosophy · Learning (English Speaking Learning/Practice)
  6. **Not Work** — Social Media · Sports · Socialization
  7. **Wasted Time** — Social Media · Socialization

  (* = built-in inevitable-necessity head, §2.10; Recharge & Food are undeletable.) Names locked
  2026-07-16 for the original four; the set was expanded to the seven above 2026-07-17. "Time
  Wasted" was renamed "Wasted Time" 2026-07-17.
- **Identity is the PATH, not the name.** The same activity name may live under two Categories with
  different meaning — e.g. *Socialization* under Regeneration (regenerative) vs under Wasted Time
  (indulgent). A sub-head is `(category, head, sub-head)`, not a global string. This confirms the
  tree is load-bearing, and the head registry (`heads.tsx`, §2.1) carries a Category parent.
- **Path identity is TASK-LEVEL (decided 2026-07-17):** a task's `headId` IS the path
  `(category, head)`, encoded as one string (`category ␟ name`, an untypeable separator), so two
  same-named heads under different Categories are genuinely distinct everywhere — reducer,
  budgets, roll-ups, ML. **Display is ALWAYS the bare name, with no category qualifier** (revised
  2026-07-18 — an earlier "Name (Category)" disambiguator for duplicate names was removed; two
  heads named "Social Media" in different Categories now render identically wherever picked or
  listed — identity stays the path underneath, only the on-screen label dropped the tag).
  **A built-in's name is reserved only WITHIN its own Category** (revised 2026-07-18 — not
  globally): a user head may not be named e.g. "Recharge" under Recharging (collides with the
  real built-in's path), but "Recharge" is free to use as a head name under any OTHER Category.
  Pre-path stored data is **wiped, not migrated** (user decision 2026-07-17): on first load under
  the new format the registry + ML stores clear and the app re-seeds from the shipped defaults
  above; settings/theme survive.

## 11.1a Category & head management (the Heads & Sub-heads screen)
The Heads & Sub-heads screen (§VI) takes the **whole screen** and is **grouped by Category**, in the
user-controlled category order:
- **Category ordering.** A reorder affordance sits at the category level (a grip on each category
  header, on the right/left of the screen) — drag categories (dnd-kit) to reorder; the order persists
  and drives every category-grouped view.
- **Within a category, built-ins list first, then user-added heads** (built-ins keep their
  undeletable dot; user heads keep the × delete).
- **Move a head to another category — two ways:**
  1. Next to a user head's delete (×), a **move** control opens a **dropdown of every category**;
     picking one re-homes the head to that category.
  2. **Drag-and-drop** a head onto another category (dnd-kit) does the same.
  Built-in heads keep their default category (their category is fixed, not moved).
- **Add a category.** An "Add category" affordance appends a new (empty) user category to the end of
  the order; heads can then be moved into it. Add-only — seeded categories aren't renamed/deleted.
- **Layout (2026-07-18):** "Add a head" and "Add a category" sit as two equal-width columns, split
  at the exact center, in the same row of the screen — each with its own heading, one-line
  explanation, then its input + button. "Add a head" is left, "Add a category" is right.

## 11.2 The 24h zero-sum day-shape (per-day, hard-balanced)
- Budgets are **per-day**, set on **HEADS** (§11.6 for sub-head depth), rolling up to Categories,
  and the shape repeats across the planned weekdays. **Each weekday may carry a different shape.**
- **Weekly-quota heads (§5.1) participate via their distributed per-day share**, which counts in
  the day's sum like any absolute line: `Σ(daily heads + weekly shares + Sleep) === 24h`.
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
- **% is literally "% of netCore"** (locked 2026-07-16). Absolute Core Work heads are **not**
  subtracted before the split; they claim hours from the same netCore envelope. The **hard-fit
  constraint** is:
  `Σ(absolute Core head hours) + Σ(pct)/100 × netCore === netCore` — exactly, snap-enforced
  (same discipline as the 24h wall: the last-edited entry snaps back to the value that restores
  the fit, notify + highlight). In the pure-% case this degenerates to **Σpct === 100**.
  With the constraint held, the day balances **by construction** as overhead changes.
  - Example (netCore = 10h, absolute core Job = 2h): the % heads may only sum to 80% —
    Deep Work 50% → 5h, Learning 30% → 3h; core total = 2+5+3 = 10h ✓.
- The **%-value is live-elastic**: hours reflow automatically as overhead (sleep, obligations,
  Self-Management) changes; **the % text always stays shown** (never replaced/hidden by the hours).
- A Core Work head *may* still be absolute; % is simply the option only Core Work gets.
- **A weekly-quota head's daily share behaves as an ABSOLUTE entry in this chain** — non-core
  shares subtract into R1; a Core Work weekly share claims from netCore like an absolute core
  head. Redistribution (§5.1) changes a future day's share → netCore reflows → % heads absorb it,
  so the day re-balances by construction.
- Self-Management is **never** a percentage (it is overhead, subtracted before the residual).

## 11.4 Sleep — the head of the day
- Sleep is a first-class head with an **absolute** budget, part of the 24h sum ("sleep is the head
  of the day"). Editable in **both** weekly planning and Settings, **synced** (one source of truth).
- **One global value, no per-weekday variance** (locked 2026-07-16): every planned day carries the
  same Sleep budget; editing it from either surface updates the single shared value.

## 11.5 Timing, pinned vs ranked, and the rank mechanism
- A weekly head's timing is **`fixed`** (clock-anchored) or **`budgeted`** (flexible fill) **only** —
  never semi-head/semi-tail/unscheduled.
- **Pinned** (not jostled): **Sleep** (day-head), any **fixed**-timing head (sits at its clock),
  **Self-Management** (protected overhead, subtracted first).
- **Ranked**: every remaining **budgeted** head carries a **user-set rank** that drives fill order at
  SOD, **independent of list position**. Reorder affordance (locked 2026-07-16): **both** a drag
  handle (⋮⋮) **and** up/down arrows on each ranked row; a single **collapse-all / expand-all**
  toggle lives in the outliner pane's header bar.

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
- **Mechanics (built 2026-07-16).** At `PRUNING_DONE` injection: (1) **§5.1 redistribution runs
  first** — the sealed day's weekly-quota shortfall/exact-overshoot appends to the week-instance
  `quotaAdjust` ledger, so today's injection draws against the redistributed shape; (2) due
  templates are **ordered by their head's budget rank** (`week.budgets` array order, §11.5),
  template rank within a head, unbudgeted heads last; (3) each task **draws down its head's
  resolved day budget** — a *budgeted*-timing task exceeding the remainder is **trimmed to it**
  (≥ minFragment, the trimmed-off tail spills) or **spilled whole**; **pinned timings
  (fixed/semi) draw down but are never trimmed** (§11.5 — not jostled); heads without a budget
  line are uncapped; (4) **spill = the next day's dated adds** (§4.6 layer — reuses the one
  instantiation path, never dropped); (5) every trim/spill/unredistributable remainder raises
  the universal snap-NOTIFY notice.

## 11.8 UI — beside the calendar in weekly planning (built 2026-07-16)
- **Two-pane**: a **collapsible outliner** (Category ▸ Head; budgets + % badge inline; drag-rank
  AND ▲▼ arrows; collapse-all in the pane header) on one side, a **live 24h stacked bar** (the
  conservation gauge — fills as you allocate, flashes the offending segment on breach) on the
  other. The existing **week calendar grid** (§4.4/§4.6) remains the placement-preview surface.
- **Placement (revised 2026-07-16)**: the toggle is **`[ Week Plan | Calendar ]`** — there is NO
  separate *Budgets* tab. **Week Plan is a two-column screen**: the **LEFT column hosts the budget
  panel** (outliner + gauge, stacked vertically), the **RIGHT column keeps the week-plan content
  as-is** (OFF days, conflicts, the placed-week grid). Heading stays "Weekly Planning". The
  **Start Week button is disabled** (with the gate reason) while §11.2 fails.
- A **weekday selector** (chips; OFF days disabled) picks which day-shape the bar + roll-ups
  show; unbalanced weekdays are marked on their chips. A head's expanded editor offers a
  **this-weekday-only override** (absolute `perDay` / weekly `shares`) honoring §11.2's
  "each weekday may carry a different shape".
- **Snap asymmetry (all three layers — 24h wall, Category target, core-% fit): OVER → snap the
  edited entry back to the fit-restoring value (toast names head + rule, flash on row + bar
  segment + Category row); UNDER → never snaps, live indicator only ("needs X more") with the
  Start-Week gate doing the blocking.**
- **Sleep row is Settings-grade**: editable even under the mid-week structural lock (§11.4 — it
  syncs with Settings, which is never locked); all other budget edits obey the §4.4 lock
  (OFF-day window / urgent bypass).
- The Heads & Sub-heads config screen assigns each head's **Category** (new heads default to
  Core Work); a budget entry snapshots the category at creation.

## 11.9 Data-model deltas (sketch, for the build chat)
- `Category` tier (id, name, order) above `WeekTemplate.headId`; head registry gains a category.
- `WeekTemplate`/head budget entry gains: `budgetKind: "absolute" | "percent" | "weekly"`
  (percent only if the head's Category is Core Work), `pct?` (0–100), for weekly:
  `quotaHours`, `quotaType: "atLeast" | "atMost" | "exact"`, `shares?` (per-weekday, default even
  split), `rank` (already exists), pinned derives from timing/identity. `Sleep` absolute synced
  to Settings.
- A weekly-plan validity selector: `Σ === 24h` (gate), per-Category explicit-target fits, live
  netCore + %→hours projection. All pure/event-sourced; the 24h + % math belongs in `packages/core`.

## 11.9a Analytics (built 2026-07-16)
The Analytics screen gains a **Budgets** section (only when head budgets exist):
- **Budget today** — today's resolved day-shape lines (% shown with their hours) vs achieved,
  with Remaining (over → warn styling, never blocked). OFF day → stated, no comparison. Sleep's
  achieved matches by `sleepKind` (its occupancy books under Recharge).
- **Weekly quotas** — per weekly head: type, quota, achieved since the week started (last 7 days
  when no week is running — degrade gracefully), and the standing per §5.1 type semantics:
  *at-least* "X to go / met ✓"; *at-most* "headroom / over by X" (warn, never block); *exact*
  both ways. Heads whose shares were redistributed at SOD are marked "· redistributed".
- Quota trim during Pruning (with its sticky visible deficit) — **built 2026-07-16 (Stage 6)**;
  §5.1's Pruning bullet carries the mechanics. Trims ride the §5.1 week-instance ledger as
  `kind: "trim"` entries, applied at `PRUNING_DONE` **after** redistribution and **before**
  injection; the Analytics quota standing marks trimmed heads "· trimmed, X deficit".

## 11.10 Micro-items — RESOLVED (grilled 2026-07-16)
1. **Category names**: *Supportive Work* → **Maintenance**; *Not Work* → **keeps its name**.
   (Core Work unchanged; *Time Wasted* → **Wasted Time** 2026-07-17.)
2. **Sleep**: **one global value**, settable from both Weekly Planning and Settings, synced;
   no per-weekday variance (§11.4).
3. **Multiple %-core heads**: percentages are **literally % of netCore**; the hard fit is
   `Σ(absolute core) + Σ(pct)/100 × netCore === netCore`. Pure-% case ⇒ Σpct === 100.
   Enforced by snap at the % layer (not left to the 24h gate) so the culprit entry is named.
4. **Absolute Core Work heads**: draw from the same netCore envelope (NOT subtracted before the
   %-split); see the constraint above and the worked example in §11.3.
5. **Reorder**: **both drag handle and up/down arrows**; **collapse-all** toggle in the outliner
   pane header (§11.5).
6. **Snap UX**: the **standard snap-notify law** (§7 smart-input) — snap at the boundary to the
   value restoring the fit, toast names head + rule ("Snapped Health to 2h — day must equal
   exactly 24h" / "… Maintenance must total 5h"), and the offending 24h-bar segment + head row +
   its Category row **flash-highlight** briefly. No modal, no new mechanism.
