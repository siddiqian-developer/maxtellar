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
  (add-only). The seeded categories are not renamed or deleted (that keeps the §11.3
  budgeting roll-ups well-defined); a user-added category behaves like any seeded one. **Category
  order is user-controllable** (§11.1a) and is the order everything category-grouped renders in
  (registry screen, budgeting panels). **All 8 shipped categories are themselves built-in**
  (2026-07-18) — reorderable, never renamed/removed.
- **Shipped default categories, in order** (the data the app ships with; tree corrected 2026-07-18
  — the user's list is Category → Head, FLAT, no sub-heads below the head tier except the one
  pre-existing §2.9 exception noted below):
  1. **Recharging** — Sleep* · Nap
  2. **Core Work** — Self-Management* · Strategy and Planning · Research · Project Execution · Job ·
     Sales · Fundraising · Job Search · Marketing · Public Speaking · Investor Hunting · Networking ·
     Other Work #1 · Other Work #2
  3. **Maintenance** — Food* · Kitchen work · Cleaning · Plantcare · Clothes Work · Health
  4. **Regeneration** — Rest · Meditation* · Break · Exercise* · Socialization* · Entertainment
  5. **Upgrading** — Personal Philosophy · Learning* · English Speaking Learning/Practice
  6. **Not Work** — Social Media · Sports · Socialization
  7. **Wasted Time** — Social Media · Socialization · Entertainment
  8. **Lost Time** — (Lost Hours, the system head, lives here — see below)

  (* = built-in head, §2.10 — undeletable, fixed category, "Food-pattern" plannable: Recharge/
  Self-Management/Food were already built-in; **Meditation, Exercise, Socialization [the
  Regeneration one — Not Work's Socialization is an ordinary, separate head], and Learning joined
  2026-07-18** with the same Food-pattern treatment, §2.10a. **Nap carries NO `*`** — confirmed
  2026-07-18: Nap is an ORDINARY seeded head, deletable like Rest or Break, demoted from its
  brief built-in status when Recharge was split.) The tree is **fully flat** — the earlier
  Kitchen-work-under-Food §2.9 sub-head exception was dropped 2026-07-18 (user: "there are no
  subheads"); Kitchen work is ONLY a Maintenance head, and NO sub-heads ship in the seed,
  period. Names locked 2026-07-16 for the
  original four; expanded to seven 2026-07-17, to eight (Lost Time added, Lost Hours moved into
  it from Wasted Time) 2026-07-18. "Time Wasted" was renamed "Wasted Time" 2026-07-17. The full
  seed tree (all built-ins + this list) OVERRIDES any prior seed — re-seeded from scratch
  2026-07-18, not merged with earlier example heads.
- **Identity is the PATH, not the name.** The same head name may live under two Categories with
  different meaning — e.g. *Socialization* under Regeneration (regenerative, built-in) vs under
  Wasted Time (indulgent, ordinary). A head is `(category, head)`, not a global string. This
  confirms the tree is load-bearing, and the head registry (`heads.tsx`, §2.1) carries a Category
  parent.

### 11.1b Food-pattern built-in HEADS (§2.10a, added 2026-07-18)
Sleep/Self-Management/Food/Meditation/Exercise/Socialization[Regeneration]/Learning share one
treatment, distinct from the system built-ins (Wasted Time/Lost Hours/Off-Periods):
- **Undeletable, fixed category** — same as every built-in.
- **Plannable** — schedulable like any ordinary head (no config note), unlike the system built-ins.
- **Each is its OWN head**, not a sub-head of a parent. **"Recharge" no longer exists** (revised
  2026-07-18): **Sleep** and **Nap** are two distinct heads directly under Recharging —
  replacing the earlier model where both were sub-heads of one "Recharge" head distinguished by a
  `sleepKind` field. **Nap is NOT in this built-in set** (demoted 2026-07-18, matching the user's
  `*`-marks): it seeds under Recharging but is ordinary/deletable; it stays a shipped preset, and
  the History editor's Sleep/Nap kind quick-tag offers "Nap" only while the head exists in the
  registry. `sleepKind` is REMOVED from every task/history type; the head id itself now
  carries what it used to (`headId === SLEEP_ID` is what the §4.2 SOD precondition counts). No
  built-in ships with a seeded sub-head (2026-07-18) — sub-heads exist in the schema but are
  added later, by the user, never in the shipped seed (this includes Food, which no longer ships
  with a "Food"-named sub-head either).

### 11.1c The preset system (§2.9/§2.10b, rebuilt 2026-07-18)
Presets are a **user-editable LIST** (`settings.presetsConfig`), not a fixed set of ids — any
registry head can be added as a preset, any preset can be removed, and the list is reorderable
(display order = array order, everywhere presets render).

- **Shipped presets, in this order:** Exercise, Food, Learning, Nap, Meditation, Sleep.
  **Socialization is explicitly NOT a preset** (removed 2026-07-18) — it stays a plain built-in
  head, just with no preset/quick-add treatment.
- **Deleting a head prunes its presets** (2026-07-18): removing a head from the registry also
  removes every preset pointing at it — a preset never dangles on a nonexistent head. (This is
  how the shipped Nap preset dies if the user deletes the now-ordinary Nap head.)
- **Each preset row:** `{ headId, label, titleLocked, timing, budgetFlat, budgetSource,
  startFlat, endFlat, anchorSource }`. `timing` is the preset's own TimingType — tapping the pill
  sets the drawer/editor to that timing AND fills whichever field(s) §2.5's FIELD_ROLES matrix
  requires for it (budget for `budgeted`; start+end for `fixed`; start only for `semi-head`; end
  only for `semi-tail`; nothing for `unscheduled`).
- **Value SOURCE per preset** (configurable, not fixed):
  - `flat` — a fixed number the user set in Settings (minutes for budget; a time-of-day for
    start/end).
  - `weekPlan` — resolved LIVE at apply-time: budget from that head's TODAY line in
    `weekDayShape` (§11); start/end from a matching WeekTemplate's own anchors, if one fires
    today for this head.
  - `settings` — only meaningful for Sleep's budget (`week.sleepMinutes`, §11.4).
  - A sourced value that can't resolve (no matching template today, no budget line) falls back
    to the preset's own flat value — a preset never fails to apply.
- **Shipped defaults:** Exercise = budgeted, budget from week-plan. Food = unscheduled. Learning =
  fixed, start/end from week-plan (a matching template's anchors). Nap = unscheduled. Meditation =
  unscheduled. Sleep = budgeted, budget from Settings' `sleepMinutes`.
- **Config UI is split in two (revised 2026-07-18 — the drawer is too narrow for a table):**
  1. **Settings window** shows a COMPACT read-only summary list — one line per preset (head
     name + "Timing · value · source" summary) — **with reordering fully available right
     there** (drag ⋮⋮ AND ▴/▾ — the arrows use symmetrical glyphs, never one emoji-rendered),
     plus a "Manage presets →" button.
  2. A dedicated full-width **Presets SCREEN** (same chrome as Heads & Sub-heads; Esc = back to
     Settings, §back-navigation) holds the full editable TABLE — one row per preset: head (with
     drag grip), a **"Timing Type"** `<select>`, the **Value** cell that timing's §2.5
     FIELD_ROLES require (budgeted → a budget duration; fixed → start–end smart TodFields;
     semi-head/semi-tail → the one anchor; unscheduled → "—"), a **Source** `<select>`
     (Flat / Week Plan / Settings), reorder (drag + ▴▾), and ×. **All columns and headings are
     LEFT-aligned** (including the select's closed face). Flat-source anchor times are editable
     smart time inputs (§7.0.2 parity); sourced ones render disabled.
  - **Add = the ⊕ circle at the bottom-left** of the table (after the last row): clicking it
    appends a pending row with the head picker focused; picking a valid head commits the
    preset at once; leaving the row without one DISCARDS it with a snap-toast notification —
    a half-filled preset never lands in the list.
  - The ⊕ itself is the shared **`AddCircleButton`** component (an SVG plus stroked in
    `currentColor` inside a bordered circle — never a font "+" glyph, which centers
    unevenly; same rationale as the CSS-drawn ▴▾ arrows). Every future "add a row/item"
    circle reuses this component (§7.0 composition law).
- **Every OTHER surface keeps the pill row** (`PresetPills` in `TaskSpecFields.tsx`) — New Task
  drawer, the week-plan template editor, the dated-task editor, Gap-Fill's quick-fill row.
  Pickers stay pills; only CONFIGURATION uses the table.
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
  achieved matches by `headId === SLEEP_ID` (its own built-in head, §11.1b).
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
