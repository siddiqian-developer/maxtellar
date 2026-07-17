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
- **Shipped default categories, in order** (the data the app ships with; tree corrected 2026-07-18,
  Sleep/Nap revised 2026-07-19 — the user's list is Category → Head, FLAT, no sub-heads below the
  head tier except the two §2.9 exceptions noted below):
  1. **Recharging** — Sleep* [sub-heads: Sleep*, Nap]
  2. **Core Work** — Self-Management* · Strategy and Planning · Research · Project Execution · Job ·
     Sales · Fundraising · Job Search · Marketing · Public Speaking · Investor Hunting · Networking ·
     Other Work #1 · Other Work #2
  3. **Maintenance** — Food* · Kitchen work · Cleaning · Plantcare · Clothes Work · Health
  4. **Regeneration** — Rest · Meditation* · Break · Exercise* · Socialization* · Entertainment
  5. **Upgrading** — Personal Philosophy · Learning* · English Speaking Learning/Practice
  6. **Not Work** — Social Media · Sports · Socialization
  7. **Wasted Time** — Social Media · Socialization · Entertainment
  8. **Lost Time** — (Lost Hours, the system head, lives here — see below)

  (* = built-in head, §2.10 — undeletable, fixed category, "Food-pattern" plannable: Self-
  Management/Food were already built-in; **Meditation, Exercise, Socialization [the
  Regeneration one — Not Work's Socialization is an ordinary, separate head], and Learning joined
  2026-07-18** with the same Food-pattern treatment, §2.10a. **Sleep/Nap history**: Recharge →
  (2026-07-18) two distinct heads Sleep\*/Nap → (2026-07-19, REVERTED back toward the original
  shape) ONE head `Sleep`\*, with sub-heads `Sleep`\* (also built-in — the marked exception) and
  `Nap` (ordinary/deletable, seeded but removable like Rest or Break).) The tree is **fully
  flat** except those two Sleep sub-heads — the earlier Kitchen-work-under-Food §2.9 sub-head
  exception was dropped 2026-07-18 (user: "there are no subheads"); Kitchen work is ONLY a
  Maintenance head, and NO OTHER sub-heads ship in the seed, period. Names locked 2026-07-16 for
  the original four; expanded to seven 2026-07-17, to eight (Lost Time added, Lost Hours moved
  into it from Wasted Time) 2026-07-18. "Time Wasted" was renamed "Wasted Time" 2026-07-17. The
  full seed tree (all built-ins + this list) OVERRIDES any prior seed — re-seeded from scratch
  2026-07-18, not merged with earlier example heads. **Existing stores get a one-time seed
  TOP-UP, not a wipe** (fixed 2026-07-18 — before this, only fresh stores saw the full seed;
  extended 2026-07-19 to also merge in Sleep's two sub-heads and drop a stray `NAP_ID` head key
  from stores created under the 2026-07-18 shape): a `seedVersion` stamp, separate from the
  path-format stamp, triggers a single merge that adds every missing seed head to the stored
  registry (seed display order first, the user's own heads after; user heads, sub-heads, ML
  training, settings and category order all survive). After that merge the §2.1 no-resurrection
  rule holds — a deleted seed head/sub-head stays deleted across reloads until the stamp is next
  bumped (Sleep's `Sleep` sub-head is the one exception: it's re-guaranteed present on every
  load, like an undeletable head's key, since it's undeletable itself).
- **Identity is the PATH, not the name.** The same head name may live under two Categories with
  different meaning — e.g. *Socialization* under Regeneration (regenerative, built-in) vs under
  Wasted Time (indulgent, ordinary). A head is `(category, head)`, not a global string. This
  confirms the tree is load-bearing, and the head registry (`heads.tsx`, §2.1) carries a Category
  parent.

### 11.1b Food-pattern built-in HEADS (§2.10a, added 2026-07-18; Sleep/Nap revised 2026-07-19)
Sleep/Self-Management/Food/Meditation/Exercise/Socialization[Regeneration]/Learning share one
treatment, distinct from the system built-ins (Wasted Time/Lost Hours/Off-Periods):
- **Undeletable, fixed category** — same as every built-in.
- **Plannable** — schedulable like any ordinary head (no config note), unlike the system built-ins.
- **Each is its OWN head, not a sub-head of a parent** — EXCEPT Sleep/Nap, which went through
  three shapes:
  1. **Original**: both were sub-heads of one "Recharge" head, distinguished by a `sleepKind`
     field on the task/history entry.
  2. **2026-07-18**: `sleepKind` REMOVED; Sleep and Nap became two distinct built-in heads
     directly under Recharging, Nap immediately demoted to ordinary/deletable (matching the
     user's `*`-marks) — the headId itself carried what `sleepKind` used to.
  3. **2026-07-19 (current, REVERTED back toward the original)**: ONE built-in head, `Sleep` —
     the head of the day. Under it, two sub-heads: `Sleep` (ALSO built-in/undeletable — the one
     marked exception to "no built-in ships with a seeded sub-head", below) and `Nap`
     (ordinary/deletable, same treatment as its 2026-07-18 demotion — it stays a shipped preset,
     and the History editor's Sleep/Nap kind quick-tag offers "Nap" only while the sub-head
     exists in the registry under `SLEEP_ID`). **Still no `sleepKind`** — reintroducing a
     separate tag was considered and rejected; the (headId, activityId) pair already carries the
     distinction. Every "was this Sleep?" check (the §4.2 SOD precondition, the Analytics sleep-
     budget "achieved" total) now tests `headId === SLEEP_ID && activityId === SLEEP` — headId
     alone is insufficient since Nap shares it.
- No built-in ships with a seeded sub-head (2026-07-18) — sub-heads exist in the schema but are
  added later, by the user, never in the shipped seed (this includes Food, which no longer ships
  with a "Food"-named sub-head either) — **EXCEPT Sleep's own `Sleep` sub-head** (2026-07-19),
  the one deliberate exception: it must always exist since it's what the day-defining check now
  keys on, so it gets the same "always present, no resurrection needed" guarantee an undeletable
  HEAD's registry key gets. `Nap`, Sleep's other sub-head, is NOT this exception — it seeds but
  stays ordinary/deletable, no different from any other user-added sub-head once it exists.

### 11.1c The preset system (§2.9/§2.10b, rebuilt 2026-07-18)
Presets are a **user-editable LIST** (`settings.presetsConfig`), not a fixed set of ids — any
registry head can be added as a preset, any preset can be removed, and the list is reorderable
(display order = array order, everywhere presets render).

- **Shipped presets, in this order:** Exercise, Food, Learning, Nap, Meditation, Sleep.
  **Socialization is explicitly NOT a preset** (removed 2026-07-18) — it stays a plain built-in
  head, just with no preset/quick-add treatment.
- **Deleting a head prunes its presets** (2026-07-18): removing a head from the registry also
  removes every preset pointing at it — a preset never dangles on a nonexistent head. (Revised
  2026-07-19: the shipped Nap preset now dies when the user deletes the `Nap` SUB-head under
  Sleep, not a head — pruning keys off whether the preset's `(headId, activityId)` pair still
  resolves, not headId alone, now that Sleep and Nap share one head.)
- **Each preset row:** `{ id, headId, label, titleLocked, timing, budgetFlat, budgetSource,
  startFlat, endFlat, anchorSource }`. `id` is USUALLY the head's PATH id (one preset per head)
  — EXCEPT Sleep/Nap (revised 2026-07-19): both are presets on the SAME head now, so Nap's `id`
  is synthesized (`${SLEEP_ID}::Nap`) to stay distinct from Sleep's own (`SLEEP_ID`); `id` is
  opaque everywhere it's used (sort key, lookup) so this costs nothing elsewhere. `label` doubles
  as the sub-head `resolvePreset` resolves to — the config table's head-name column shows
  `label`, not `headName(headId)`, for exactly this reason (two rows can share a headId).
  `timing` is the preset's own TimingType — tapping the pill sets the drawer/editor to that
  timing AND fills whichever field(s) §2.5's FIELD_ROLES matrix requires for it (budget for
  `budgeted`; start+end for `fixed`; start only for `semi-head`; end only for `semi-tail`;
  nothing for `unscheduled`).
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

## 11.3 Subtraction chain & the two elastic pools (REVISED 2026-07-21 — supersedes the
2026-07-16 one-pool law; grilled with the user, worked example theirs)

**Two categories are elastic — Core Work AND Upgrading.** Every other category is pure
overhead. Percentages exist at THREE tiers — category pair, head, sub-head — all governed by
ONE conservation law (below).

```
net             = 24h − Sleep − Σ(all head budgets of every category EXCEPT
                                  Core Work and Upgrading)  − Self-Management
netCoreWork     = Core Work's share of net   // "Core Work minus Self-Management"
upgradingShare  = Upgrading's share of net
netCoreWork + upgradingShare === net         // conservation, tier 1
```

- **Self-Management is subtracted INTO the overhead** (as before): it is absolute, never a
  percentage, and **exempt from Core Work's category target** — a 60% Core Work target is 60%
  *of net*, which already excludes SM; SM's own hours ride on top inside Core Work's roll-up.
- **Tier 1 — the category pair (optional).** The user may set a **% target on Core Work or
  Upgrading**; the other **auto-derives** (the pair always sums to 100 — editing one snaps the
  other, never an error state). With the pair set, each category's envelope is FIXED:
  `netCoreWork = pctCW/100 × net`, `upgradingShare = (100 − pctCW)/100 × net`. **Worked example
  (user's own):** 24h − other categories = 11h; SM = 1h ⇒ net = 10h; Core Work target 60% ⇒
  Upgrading auto-derives 40%; netCoreWork = 60% × 10h = **6h**, Upgrading = **4h**.
  **With NO pair set**, the two categories jointly fill `net` with no split between them —
  the constraint is the combined fit (tier-2 rule applied over both categories at once). This
  degenerates EXACTLY to the old one-pool law when Upgrading has no entries, so existing
  plans keep meaning.
- **Tier 2 — heads.** Within Core Work and Upgrading (only), a head may be **percent** —
  `% of its parent envelope` (the category's fixed envelope when the pair is set; `net`
  jointly when not). Absolute and weekly-share heads in these two categories claim hours
  **from the same envelope** (not subtracted before the split). Hard fit per envelope:
  `Σ(absolute + weekly shares) + Σ(pct)/100 × envelope === envelope` — the old §11.3
  constraint, now applied per pool.
- **Tier 3 — sub-heads (NEW).** Under a budgeted head in these two categories, sub-heads may
  carry **% shares of the head's resolved budget** (absolute minutes also allowed). At SOD,
  injection draws a task down against **its sub-head's resolved share when one exists**, else
  against the head's undivided remainder as today.
- **THE conservation law (all tiers, one sentence):** *the sum of the children must equal the
  budget of the parent.* A parent **with an explicit target restricts its children** to summing
  exactly to it (same OVER→snap-the-edited-entry / UNDER→live-indicator discipline as the 24h
  wall, §11.2); removing the parent's target releases the children (roll-up only). Editing a
  child so the fit breaks snaps the CHILD back; the alternative — silently growing the parent —
  is never done (the parent's number is the user's stated intent).
- **Live-elastic everywhere:** every %-derived hour reflows as overhead changes (Sleep, other
  categories, SM); **the % text always stays shown** next to its derived hours.
- **Weekly-quota shares** keep behaving as absolute entries at whatever tier they sit
  (unchanged from the 2026-07-16 law); §5.1 redistribution reflows the envelopes and the %
  entries absorb it, so days re-balance by construction.
- Self-Management is **never** a percentage, at any tier.

## 11.4 Sleep — the head of the day (revised 2026-07-21: the trio + real injection)
- Sleep is a first-class head with an **absolute** budget, part of the 24h sum ("sleep is the head
  of the day"). Editable from **three** synced surfaces — Settings, BudgetPanel's pinned row, and
  the Calendar block's own editor (the ordinary `TemplateEditor`, since Sleep is a real template
  now) — **one source of truth**, kept in sync by the ONE dispatch, `SET_SLEEP_BUDGET`.
- **One global value, no per-weekday variance** (locked 2026-07-16): every planned day carries the
  same Sleep budget; editing it from any surface updates the single shared value.
- **Sleep is a REAL, always-present, undeletable `WeekTemplate`** (id `tpl-sleep`,
  `SLEEP_TEMPLATE_ID`) — no longer a synthetic budget-only line. It genuinely injects at SOD like
  any other daily template and consumes real scheduler capacity, matching the user's ruling: "Sleep
  is a task which has to be planned and placed in the spine during the weekly planning. This is
  non-negotiable." Both `SET_WEEK_PLAN` and `SET_BUDGETS` (which each REPLACE their whole array)
  re-inject Sleep's template/budget entry if the caller's own list omits it — the same
  "always-present, no resurrection needed for THIS one" guarantee an undeletable head's registry
  key gets (§11.1c). The Calendar's `TemplateEditor` hides Sleep's own Delete button.
- **The trio — start / end / budget — reuses the ordinary timing-type machinery**
  (`TimingTypeChips`/`FIELD_ROLES`/`RoleField`, §7.0.6), composed as one shared component
  (`SleepTrioFields.tsx`) so Settings and BudgetPanel render the identical fields, not two
  hand-rolled widgets (§7.0.5 symmetry). `budgeted` (no anchors) is the practical default and the
  common case: **you cannot "start" the Sleep task live** — by the time you've fallen asleep the
  task can't be started, and a genuine "Sleepless Bedtime" (an ordinary Wasted-Time head — lying
  in bed, unable to sleep, sometimes getting back up to work, sometimes eventually sleeping) means
  the actual sleep window is unknowable until you wake and can look back. In practice, Sleep is
  ALWAYS planned in the weekly template (non-negotiable, above) but ALMOST ALWAYS logged as a
  backlog/gap-fill entry after waking, not started live — the injected instance simply goes
  unstarted and prunes away like any other template's daily leftover when the user instead
  backlogs the real span (no special-casing needed anywhere in the SOD/pruning pipeline: the SOD
  sweep is purely history-driven — `ceremony.ts`'s `isHeadOfDay`/`sodPrecondition` scan
  `state.history`, never `state.plan` — so an injected-but-unstarted Sleep task can never itself
  satisfy or interfere with the sweep; only a REAL logged span counts). Switching the trio to
  `fixed` (both anchors set) is supported for the rarer case of an actually-scheduled sleep window,
  and places a real block on the Calendar grid like any other fixed template.
- **The trio derives exactly like the New Task drawer (§3.6/§6), one shared implementation** (fixed
  2026-07-21): (1) **any two of start/end/budget auto-derive the third** — entering a 10pm start and
  a 6am *next-day* end fills the budget to 8h — via the shared `reconcileTrio` helper (the drawer's
  own 3→1 law + the §7.0.2 sub-floor snap, factored out of `useTaskSpec` so the trio reuses it
  rather than re-deriving); and (2) **the timing TYPE is derived live from which fields are filled**
  (`deriveTiming`, the drawer's rule) — typing a start onto a budgeted Sleep promotes it to
  fixed/semi-head with no chip tap, and the fields are **always enterable** (a "not used" role only
  dims them, never blocks typing — because typing is how the type is promoted). Both helpers are the
  SAME functions the drawer and template editor use (§7.0.6: one rule, one implementation); the
  template editor's own type-derivation was latently broken the same way and is fixed by the same
  central change. This is what made a fixed **overnight Sleep render on the Calendar** at all — the
  split-block pipeline (`weekPreview` → RBC) was always correct; the trio just couldn't produce a
  valid fixed overnight window before.
- **Collapsible pinned Sleep row (BudgetPanel)**: Sleep opens **collapsed** (rarely re-edited) to one
  row — a labelled **Budget** value plus a type-aware clock snapshot (fixed → the `start → end`
  window; semi-head → `from …`; semi-tail → `by …`; budgeted/unscheduled → nothing, the `~` on the
  budget already says "no fixed clock time"). The **whole row toggles** open/closed (hand cursor,
  hover wash); expanded, only the header (◆ Sleep + caret) collapses, so the fields stay freely
  editable. Row content is vertically centered. Settings keeps its own inline caret (the trio owns
  its collapse there); BudgetPanel drives it as a controlled `open`/`onOpenChange` pair.
- **Approximate display (`~`) when unanchored**: when the trio's timing isn't `fixed`, BudgetPanel
  and Settings show `~<budget> — no fixed clock time` instead of blank/dashed start-end fields —
  the same "~" convention Timeline.tsx already uses for a floating (non-anchored) edge, applied to
  text rather than a drawn block. The Calendar grid needs no special "~" treatment of its own: it
  already draws every budgeted (non-fixed) template at wherever `weekPreview` resolves it, exactly
  like any other budget-only block.
- **Real budget-math consolidation** (retires the old synthetic line): `week.budgets` carries ONE
  real entry keyed `SLEEP_ID` (the head, `Recharging/Sleep` — not the OLD bare-name `SLEEP_HEAD`/
  `SLEEP_CATEGORY` pseudo-identifiers, which are removed). This is now the ONE source both the 24h
  envelope math (`weekDayShape`/`netCore`) AND the scheduler's injection capacity
  (`injectTodayDetailed`'s `headIdx`/`remaining` draw-down) read — previously these were two
  disconnected mechanisms: the synthetic line fed the 24h math but was invisible to injection
  capacity (a Sleep template would have injected completely uncapped). `sleepEntry()` is retired;
  `budgetEntries()` now just returns `week.budgets` (already including Sleep) unmodified.
- **The 24h gate genuinely applies from a fresh install** (ruling 2026-07-21, no exemption
  widened): `weekBudgetValidity`'s old "empty budgets ⇒ exempt" no longer fires by default, since
  `week.budgets` is never actually empty (Sleep's own entry is always there). A brand-new app with
  only Sleep budgeted (8h) is UNBALANCED and Start Week stays correctly gated until the rest of the
  day is budgeted too — matching §11.2's law by its letter, not a special-cased convenience.

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
- ~~Budgets at HEAD level only for now; sub-head depth is §11.10.~~ **Superseded 2026-07-21:**
  sub-head %-shares exist within Core Work and Upgrading heads (§11.3 tier 3, the conservation
  law); all other categories remain head-level only.

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

## 11.8 UI — beside the calendar in weekly planning (built 2026-07-16; revised 2026-07-17)
- **Outliner + gauge are siblings, gauge on top (revised 2026-07-17)**: the pane wrapper
  (`.bp-panes`) holds only the **collapsible outliner** (Category ▸ Head; budgets + % badge
  inline; drag-rank AND ▲▼ arrows; collapse-all in the pane header). The **live 24h stacked bar**
  (the conservation gauge — fills as you allocate, flashes the offending segment on breach) is a
  **sibling of `.bp-panes`, stacked ABOVE it** — not a grid-column child — so the gauge always
  reads first regardless of column width. The existing **week calendar grid** (§4.4/§4.6) remains
  the placement-preview surface, unaffected.
- **Placement (revised 2026-07-16)**: the toggle is **`[ Week Plan | Calendar ]`** — there is NO
  separate *Budgets* tab. **Week Plan is a two-column screen**: the **LEFT column hosts the budget
  panel** (gauge above outliner), the **RIGHT column keeps the week-plan content
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
- **Sleep row is Settings-grade**: the WHOLE trio (timing/start/end/budget) is editable even under
  the mid-week structural lock (§11.4 — it syncs with Settings, which is never locked; `SET_SLEEP_
  BUDGET` carries no lock check, unlike `SET_WEEK_PLAN`/`SET_BUDGETS`); all other budget edits obey
  the §4.4 lock (OFF-day window / urgent bypass).
- The Heads & Sub-heads config screen assigns each head's **Category** (new heads default to
  Core Work); a budget entry snapshots the category at creation.

## 11.8a Adding heads/sub-heads/templates from the outliner (2026-07-17; category `+` placement
revised 2026-07-20 — `HoverInsertRows`)
The budget outliner is now also the entry point for growing the registry and for creating
recurring templates:
- **A category's head list is `HoverInsertRows`** (§11.8a1, a shared component) instead of a
  static list with one persistent `+` in the category header. **Empty category** ("no X
  budgets"): hovering the WHOLE placeholder row reveals a centered `+` before the label —
  clicking it is the same "add a head to this category" action the old header `+` was, just
  relocated (the header itself no longer carries a `+`). **Non-empty category**: hovering a
  budgeted row's UPPER half reveals a `+` centered on that row's top boundary; hovering its LOWER
  half reveals one on the bottom boundary. Either click opens the **Add Template drawer**
  (WeekView's `TemplateEditor`) exactly as the old `+` did (category context carried through, per
  the bullet below) — the only difference is WHERE the resulting budget line lands: spliced in
  right above (upper +) or right below (lower +) the hovered head, instead of always appended at
  the category's end.
- **Category context carried through** (unchanged from 2026-07-17): the drawer's Sub-head field
  works exactly as always (free pick/type; ML title→sub-head suggestion) — BUT the "new sub-head's
  head" picker restricting to that category is a UX bias only, not an identity guarantee: typing a
  sub-head that already exists under a DIFFERENT head resolves to THAT head regardless of which
  category's `+` opened the drawer (`SubheadField`'s `derived` always wins). Saving the template
  does THREE things: registers the (head, sub-head) pair in the shared registry; appends the
  template to `state.week`; AND, if the RESOLVED head has no budget line yet, splices one for it
  into `week.budgets` at the position the triggering `+` implied. **Two bugs fixed 2026-07-21**:
  (1) the spliced entry's `categoryId` is now `categoryFor(resolvedHeadId)` — the head's REAL
  category — never the seed category the drawer merely opened from (the earlier cut hardcoded the
  seed's category regardless of what head the save actually produced, so a sub-head resolving to a
  different category silently landed under the wrong category's outliner); (2) the spliced entry's
  `minutes` is now the template's OWN resolved budget (a `budgeted`/semi-* timing's `budget`
  field, or a `fixed` timing's end−start span) instead of an unconditional 60m that discarded
  whatever the user actually entered — only a genuinely budget-less `unscheduled` timing still
  falls back to 60m. A head added via a category's own `+` is a budgeting action, so it must show
  up immediately, in the right category, with the right budget (fixed 2026-07-17 for the first two
  effects — the outliner-empty bug; position-awareness added 2026-07-20; the category/budget
  correctness bugs above fixed 2026-07-21). Since the budgeting column and the Calendar both render
  off the same `state.week`, all three effects are visible immediately in both places (§11.8c).
- **Under each Head row** (expanded or not, below its budget line): the existing sub-heads for
  that head are listed read-only, plus an `AddCircleButton` meaning **"add a sub-head to this
  head"**. It opens a lightweight inline field (no drawer) — type a sub-head name, Enter/blur
  commits via the registry's `addActivity(headId, name)` (idempotent, same call the drawer's
  Sub-head field uses when it registers a new pair). This does not create a template or task; it
  only grows the registry, exactly like typing a brand-new sub-head anywhere else does. This
  affordance is unaffected by the `HoverInsertRows` change above — it stays a persistent
  `AddCircleButton`, not hover-revealed (it's a per-row action, not a between-rows insertion).
- Every `+` in this section uses the shared `AddCircleButton` component (`AddCircleButton.tsx`)
  already used by the Presets screen — no new add-button styling.

### 11.8a1 `HoverInsertRows` — the shared hover-reveal insert primitive (2026-07-20)
`apps/web/src/components/HoverInsertRows.tsx` is a generic, reusable component for "add a row at
this exact spot" on any vertical list — built for the budget outliner's per-category head list,
explicitly meant to be reused elsewhere a row list wants the same affordance (task lists, etc.).
- **Contract**: `items`, `keyFor`, `renderRow(item, index)`, `emptyLabel`, `addLabel`,
  `onInsert(atIndex)` (an index into `items`, 0..length), `disabled?`. It is deliberately dumb — it
  never reorders or mutates anything itself; it only ever reports WHERE the caller should insert.
  What "insert" DOES (open a drawer, splice an array, dispatch an event) is entirely the caller's.
- **Empty state**: the whole placeholder row is one hover target; `+` appears before the label
  (left-aligned — there's no boundary above/below to center on with zero rows). `onInsert(0)`.
- **Non-empty — the "seam insert" pattern (named 2026-07-20)**: each row is wrapped so hovering
  its upper half reveals a `+` centered ON that row's top boundary (`onInsert(index)` — pushes
  this row and everything after down one), and hovering its lower half reveals one on the bottom
  boundary (`onInsert(index + 1)`). "Seam insert" names the visual contract precisely: the
  button's own CENTER coincides EXACTLY with the seam between two rows — not floating inside
  either one — so it reads as "insert right here, between these two," not as a control belonging
  to either row. (Fixed 2026-07-20: the first cut used flex `align-items: center` PLUS a
  compensating negative margin, which fought each other and landed the center ~2px off the seam;
  the fix aligns the button to the zone's own edge first — `flex-start`/`flex-end`, not `center`
  — so the negative margin is the only adjustment layered on top instead of colliding with a
  second one.) Cursor Y within the row decides which half is "hot" (JS-tracked, not pure-CSS
  `:hover` — a single element can't split by cursor position in CSS alone); the two candidate
  `+`s stay invisible/click-through until their half is actually hovered, so they never intercept
  clicks on the row's own controls. Any future list wanting this exact affordance should reuse
  `HoverInsertRows` rather than re-deriving the seam-centering math.
- **Not this component's job**: what happens after `onInsert` fires (BudgetPanel opens the Add
  Template drawer seeded with the category and the insert index, §11.8a) — that logic lives with
  the caller, keeping `HoverInsertRows` reusable for surfaces where "insert" means something else
  entirely (e.g. a plain reorderable task list where `onInsert` opens New Task pre-anchored at
  that rank).

## 11.8b Head → Category UX parity (2026-07-17)
`TaskSpecFields`/`SubheadField`'s existing **sub-head → head** duality (§7.0.1: "new sub-head's
head" picker, ML-suggested but never autofilled, always user-confirmed) gets a matching
**head → category** tier, applied one level up:
- `TaskSpecInit` gains an optional `categoryId` field alongside `headId`.
- When the resolved head is **brand-new** (not in the registry), the field set that already shows
  "New sub-head's head" additionally shows **"New head's category"** — a picker restricted, when
  opened from a category's `+` (§11.8a), to that one category (pre-selected, not editable in that
  entry path); opened from any other surface (Presets, Heads & Sub-heads config, drawer used
  standalone) it is a normal full-category picker with no ML suggestion (there's no signal to
  suggest from at this tier — category is a coarser, user-decided grouping, not inferred).
- Exactly like the sub-head tier: **the resolved value is always user-confirmed before save**;
  nothing autofills a category the user didn't see and could not have changed. This is a UX/entry
  affordance only — it does not change head identity (`headId` remains the `(category, name)`
  PATH id, §11.1 — the category picker is really choosing which path the new head is created
  under).

## 11.8c Sync (2026-07-17)
The budgeting column (`BudgetPanel`, Week Plan mode) and the Calendar view were already reading
and writing the same `state.week` / one dispatch (`WeekView` passes both down unchanged) — there
is no separate calendar store to drift. §11.8a's new add-affordances keep that: a template saved
from a category's `+` dispatches the same `SET_WEEK_PLAN`-family event the "+ Add template" button
already uses, so it appears in both the outliner's roll-ups and the placed-week grid the instant
it's saved, with no extra wiring.

## 11.9 Data-model deltas (sketch, for the build chat)
- `Category` tier (id, name, order) above `WeekTemplate.headId`; head registry gains a category.
- `WeekTemplate`/head budget entry gains: `budgetKind: "absolute" | "percent" | "weekly"`
  (percent only if the head's Category is Core Work), `pct?` (0–100), for weekly:
  `quotaHours`, `quotaType: "atLeast" | "atMost" | "exact"`, `shares?` (per-weekday, default even
  split), `rank` (already exists), pinned derives from timing/identity. `Sleep` absolute synced
  to Settings.
- A weekly-plan validity selector: `Σ === 24h` (gate), per-Category explicit-target fits, live
  netCore + %→hours projection. All pure/event-sourced; the 24h + % math belongs in `packages/core`.
- **Two-pool deltas (spec'd 2026-07-21, §11.3 revision — not yet built):** `WeekPlan` gains
  `poolSplit?: { coreWorkPct: number }` (Upgrading derives as the complement; absent = joint
  pool). `HeadBudget.kind: "percent"` becomes legal for **Upgrading** heads too (still never
  Self-Management). `HeadBudget` gains `subShares?: { activityId: string; pct?: number;
  minutes?: Dur }[]` (Core Work / Upgrading heads only) — the tier-3 sub-head shares; injection
  draws a task against its sub-head's resolved share when one exists. `netCore()` /
  `resolveDay()` / `CoreFit` generalize to per-pool envelopes; the snap helpers
  (`snapTo24h`/`snapPctToCoreFit`) gain pool- and sub-head-aware variants.

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
