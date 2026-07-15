# maxtellar design tokens — single source of truth for theme.css

Spec §1.5 names the language ("concierge calm", warm minimal); this file pins the
exact values. `apps/web/src/theme.css` implements these — if they diverge, this
file wins. Theme defaults to system light/dark; a topbar toggle cycles
system → light → dark (persisted to localStorage as `theme`, applied via
`data-theme` on `<html>`).

## Typography

- Body: `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, 14px, line-height 1.45
- Display (h1–h3): `"Lora", Georgia, "Times New Roman", serif`, weight 600
- All times/durations: `font-variant-numeric: tabular-nums lining-nums` (class `num`)

## Shape & motion

- Corner radius: 6px
- Drawer entrance: `translateX(100%) → 0`, 0.25s `cubic-bezier(0.16, 1, 0.3, 1)`
- Plan-block reflow: `top/height 0.6s ease` ("gently witnessed")
- Shadow (floating elements): light `0 4px 16px rgba(40,36,28,0.08)`, dark `0 4px 16px rgba(0,0,0,0.3)`

## Core palette

| Token | Light | Dark |
|---|---|---|
| paper (canvas) | `#faf9f5` | `#1b1a17` |
| paper-raised (surfaces) | `#ffffff` | `#232220` |
| ink (text) | `#21201c` | `#f0eee7` |
| ink-soft | `#55524a` | `#c7c3b6` |
| ink-faint | `#6d6a60` | `#a5a08e` |
| hairline (borders) | `rgba(31,30,26,0.11)` | `rgba(255,255,255,0.09)` |
| accent (petrol teal — living elements) | `#2f6d68` | `#7bc0b8` |
| accent-strong (primary buttons) | `#2f6d68` | `#3e8b84` |
| on-accent (text on buttons, on `accent-strong`) | `#ffffff` | `#ffffff` |
| accent-soft (running tint) | `color-mix(accent 12%, transparent)` | `color-mix(accent 14%, transparent)` |
| plan-card | `#ffffff` | `#232220` |
| past-card | `#f3f1ea` | `#2b2a26` |
| danger | `#b91c1c` | `#ef4444` |
| scrim (overlays) | `rgba(12,11,9,0.6)` | same |

## State-hue pills (one hue per timing type; chips + card badges, white text)

| Timing type | Light | Dark |
|---|---|---|
| unscheduled (burnt orange) | `#c05e1a` | `#d2701f` |
| budgeted (mustard) | `#a8821a` | `#c9a227` |
| semi-head / semi-tail (indigo) | `#6366f1` | `#6366f1` |
| fixed (plum) | `#7048b6` | `#9a7bd8` |

## Label casing (convention — applies everywhere, now and future)

- **User-facing labels are Capitalized** (first letter upper, e.g. `Slideable`, `Breakable`,
  `Start`, `Budget`). Implemented via `text-transform: capitalize` where a group of labels
  shares a class, so future additions inherit it automatically.
- **Acronyms stay all-caps** (`OMMF`) — `capitalize` leaves already-uppercase letters intact.
- **Pills/badges** (timing chips, role tags, card badges) use their own `text-transform:
  uppercase` style — a deliberate exception, not the default.

## Tooltips & section hint glyphs

- **Labelless sections** (timing-type row, flags row): no heading text; a trailing `ⓘ`
  glyph (`.hint-glyph`) sits at the row's right edge — `ink-faint`, opacity 0.35, brightens
  to 0.8 on hover/focus. Layout via `.hint-row { display:flex; align-items:center; gap:10px }`
  with the content `flex:1` and the glyph `flex:none`.
- **Tooltip** (custom, never native `title`): trigger carries `data-tip="…"`; a `::after`
  renders it. Surface `paper-raised`, 1px hairline border, `ink-soft` 11px/1.35 text
  (weight 400, no transform), `--shadow-2`, radius 6px, max-width 220px. Above the element
  (`bottom: 100% + 6px`), fades in (opacity + 3px→0 rise) after a **0.5s dwell**. Glyphs
  right-anchor the tip and render it **downward** (`top: 100% + 6px`) so it clears the
  drawer header; form labels left-anchor it and render upward.
- **Anchor direction follows available space** (general rule): open a tip toward the side
  that has room. Near the top edge → downward; near the right edge → right-anchored so it
  opens leftward (e.g. the rightmost flag, `Breakable`); near the left/bottom → the mirror.
  Default is upward + left-anchored; override per element when it would clip.

## Global clock (topbar)

Absolutely centered (`left/top: 50%; transform: translate(-50%,-50%)`) so it stays exact
regardless of side content; `pointer-events: none`; hidden below 720px viewport width.
Stacked column: date line (above) — 13px, `ink-faint`, short format (weekday, day, month);
time line (below) — serif, 600 weight, 18px, tabular-nums, `ink`, includes seconds. Format
(12h/24h) reads from the app-wide setting (below), not a local default.

## Dev clock (topbar, dev sandbox only)

Sits at **3/4 of the topbar width** (`left: 75%; transform: translate(-50%, -50%)`,
vertically centered like the global clock), visible only while the Dev sandbox setting is
on; hidden below 720px
with the global clock. Same stacked column (date over time-with-seconds, same sizes) but
**budgeted-hue** (`--st-budgeted`) time line and a `DEV` micro-label (9px, uppercase,
wide-tracked, budgeted hue) above the date, so it can never be mistaken for wall time. It
is a button (`pointer-events` on, unlike the global clock): click opens a popover card
(paper-raised, hairline border, 8px radius, below the clock) holding the **Tick** chip row
(10s…60m single steps) and the **Run** chip row (10s/1s…10m/1s rates + Stop) — chips reuse
`.type-chip` styling with `data-status="budgeted"`; the active running rate stays `active`.
While an accelerated rate is running (anything above the 1s/1s default) the time line
gains a subtle pulse (opacity 1→0.75, 1s ease alternate) as the "fast-forwarding" cue.

## Time format setting (app-wide)

One setting — `12h` (default, AM/PM) or `24h` — in `apps/web/src/settings.tsx`
(`SettingsProvider`/`useSettings`, persisted to localStorage key `timeFormat`). Consumed
by the global clock, `Timeline`'s tick/block labels, and `Pipeline`'s card times via the
shared `fmtClock(date, hour12)` / `fmtAbs(min, { hour12 })` helpers in `time.ts` — never a
per-component 12h/24h prop with its own default. Changed via the Settings panel (gear icon,
topbar) using the drawer's slide-in chrome.

**AM/PM is always uppercase** — `time.ts`'s `fmtClock` emits `"AM"`/`"PM"` literally;
`GlobalClock` uses the native `toLocaleTimeString` (locale-dependent casing) and forces
`.toUpperCase()` on the result to guarantee the same casing everywhere.

## Now-seam marker

**No time label at all** (settled 2026-07-09, replacing the badge entirely — after several
failed text-color attempts on it, the fix was to remove the text, not keep re-coloring it:
the global clock already shows the time, so the seam repeating it was redundant). Just a
plain **dot** on the time axis, Google-Calendar style: `.now-dot`, 10px circle, `background:
accent`, centered on the axis where the seam line begins (`left: 0; top: 0; transform:
translate(-50%, -50%)` relative to `.now-seam`, which sits at `left: 0` inside
`.timeline-canvas` — i.e. exactly on the canvas's left border-line). No color-contrast
question to solve since there's no text.

## Floating icon buttons (quiet pattern)

Confirmed pattern, used by the theme toggle, settings gear, and the timeline's
"back to now" control: **icon-only, no label text**, monoline SVG (stroke `currentColor`,
~1.6 width, 16px), `ink-faint` at rest with `opacity: 0.7` (back-to-now) or plain
`ink-faint` (topbar buttons), brightening to `ink` (full opacity + color) on hover. Never
a filled/primary button for these — quiet by default, discoverable on hover, is the house
style for incidental controls (as opposed to the drawer's primary Add button, which stays
filled because it's the one deliberate action per screen).

**Icon choice must read as its function at a glance** — an up/down chevron for "back to
now" was ambiguous (which direction is "now"?); replaced with a **crosshair/recenter**
glyph (circle + four tick marks pointing in), the same symbol maps apps use for "return to
current location" — instantly parseable as "recenter on the present" without relying on
scroll direction.

## Icons

**No emoji in the UI** — they render in fixed, fully-saturated platform colors that ignore
the theme palette and read as loud/unpolished against the warm-neutral surfaces. Use
monoline SVG (stroke `currentColor`, ~1.6 width, round caps/joins, 16px) instead. Default
tint is theme tokens (`ink-faint` at rest → `ink` on hover), but a **muted, desaturated**
literal color is fine where it carries real meaning (not decoration) — e.g. the theme-toggle:
system uses the ink-faint default; light uses a muted amber `#b8860b` (hover `#d4a017`);
dark uses a muted indigo `#6b7fd7` (hover `#8b9ce8`). Muted enough to sit quietly against
the warm-neutral surface, saturated enough to read as day/night at a glance — the line
emoji cross is full platform saturation with zero theme awareness.

## Usage rules

- Accent is reserved for **living** elements only: now-seam (2px top border + badge),
  running block/card (accent border + accent-soft fill), primary action.
- Hairline borders over shadows; shadows only on floating elements (back-to-now, drawer).
- **`accent` and `accent-strong` are NOT interchangeable for text contrast**: they're equal
  in light theme but diverge in dark theme (`accent` is a light pastel teal for the seam
  line/running fill; `accent-strong` is a darker teal for buttons, dark enough in both
  themes for white text). The now-seam no longer carries text at all (replaced by a plain
  dot, see below) — but if any future element needs light text on a filled accent, use
  `accent-strong`, not `accent`.
- **Dark-theme `ink-soft`/`ink-faint` were hardened** (2026-07-09) for general legibility:
  `ink-soft` `#b8b4a7`→`#c7c3b6`, `ink-faint` `#94907f`→`#a5a08e`. If dark-mode text still
  reads as too dim anywhere, it's a candidate for the same treatment — check the specific
  element's background pairing before changing the shared token further.
- Seam duality: blocks above `now` solid/settled (past-card, hairline border); below
  `now` provisional (plan-card, dashed ink-faint border; anchored → solid ink-soft border).
  A **pinned** start/end edge (solid top/bottom on `fixed`/`semi-head`/`semi-tail`) is drawn
  **2px** wide in `ink-soft` — thicker + stronger than the 1px dashed provisional edges — so the
  anchored coordinate stands out. **Every task box** also carries a whispered start/end timestamp
  (`.edge-time`): gutter-aligned to the edge (`left: -64px`, `width: 56px`, right-aligned),
  `font-size: 10px`, main `ink` (readable), `pointer-events: none` — smaller than the 11px hour
  tick so it confirms rather than competes. A **graduation line** (`.edge-time::after`: an 8px
  `ink-faint` top-border tick at `right: -8px`) joins the number to the axis, ruler-style. Its
  emphasis follows the edge's border by **style, not dimming**: `.edge-time-anchored` (solid/pinned)
  = upright; `.edge-time-floating` (dashed/presumed) = `italic` with a leading `~` in the markup (≈
  "will reflow"). Open tasks' end is always floating. Coinciding times dedupe to the later task's
  (start outranks end).
- **Hour-collision offset + leader:** a `.edge-time` that lands within ~11px of an hour label is
  pushed below the hour (`.edge-time-offset`: `width: 44px`, own `::after` graduation `display:
  none`) and stacked up to 2 per hour (`OFFSET_BASE 14px` + `OFFSET_STEP 15px` in `Timeline.tsx`);
  a **diagonal leader** back to the true edge is drawn in an SVG gutter overlay (`.leader-layer`,
  `left: -64px`, gutter coords x=0→64 axis) as a `.edge-leader` polyline (`stroke: ink-faint`,
  `stroke-width: 1`): from the timestamp's right end up to the edge, then a short horizontal tick
  into the axis.
- **Always-on hour graduation tick (`.hour-tick`):** a solid `ink-faint` `border-top` tick at each
  labelled hour, `left: 0; width: 8px` — extends right off the axis, stopping at the block inset
  (blocks start at `left: 8px`) so it never touches a box. Independent of the opt-in grid below.
- **Timeline ruler graduation (opt-in):** minor ticks between the hour labels, off by default.
  `.grad-mark` sits on the axis (`left: 0`, `border-top: 1px`); `.grad-5` (fine ticks) `width: 4px`
  `hairline`; `.grad-half` (half-hour) `width: 9px` `ink-faint`. Settings → Timeline grid picks the
  interval (Off / 5 / 10 / 15 / 30 min); the half-hour is always the stronger tick when visible.
- No gradients, no glass, no glow.

## Semantic action-button colors (law — applies to every action button, now and future)

**A button's accent must match its meaning**, never just the brand color (corrected
2026-07-10: Cancel was teal-accented, which read as "affirmative"):
- **Confirm / create / primary action** → `accent-strong` fill + `on-accent` text
  (`button.primary`).
- **Cancel / abandon / destructive** → `danger` outline (transparent fill; hover tints
  `color-mix(danger 10%, transparent)`) — `button.cancel-accent`.
- **Secondary affirmative** (e.g. "Add & start now") → **`accent-strong` outline**
  (transparent fill; hover tints `color-mix(accent-strong 10%, transparent)`) —
  `button.start-accent` (revised 2026-07-11). It's a create action, so the brand accent
  matches its meaning; outline (not filled) keeps it from competing with the solid `Add`.
- **Neutral secondary** (no affirmative/destructive meaning) → default hairline outline button.
Outline (not filled) for non-primary actions so they stay present next to a solid primary
without competing. Drawer footer order (settled 2026-07-10):
`Add(primary) · Add & start now ⚡(accent outline) · [flex space] · Cancel(danger outline)`.

## Semantic notice colour (law — applies to every auto-adjustment surface, now and future)

An **auto-adjustment / snap notice** — the app corrected the user's input for them (past-time
snapped forward, overnight wrap, MIN_FRAGMENT floor, any §7.0.2 meaning-change) — has its own
semantic colour, **distinct from an error and from the brand**:
- **Notice / snap / auto-adjustment** → `--notice` (amber) border + `--notice-soft` tint fill +
  a **caution glyph `⚠`** in `--notice` (via `.form-warning::before`), `ink` body text. It is
  NOT an error (never `--danger` red) and NOT brand-affirmative (never `--accent` teal). The
  glyph is mandatory — the notice must read as "we adjusted this" at a glance, never as bare
  text. Reuse `.form-warning` (or the same tokens + glyph) for any future adjustment notice.
- Tokens: `--notice` #b7791f light / #f0b445 dark; `--notice-soft` = `color-mix(--notice, transparent)`.
- Distinct from `--danger` (hard block / destructive) and `--accent` (brand / affirmative).

## Pipeline task card (spec VI "card anatomy", 2026-07-12)

Class `.card` in the pipeline, column layout, `gap: 8px`, padding `10px 12px`; the
header row (`.card .row`) is a flex row with `gap: 6px` (compacted 2026-07-12).

- **Left state bar:** `border-left: 3px solid <state-hue>` — running `--accent`, overrun
  `--danger`, unstarted its timing hue (`--st-unscheduled/-budgeted/-semi/-fixed`; both
  semis share `--st-semi`); rest of the border stays `hairline`. The running card keeps
  its `accent-soft` fill.
- **Index badge** (`.pipe-idx`): 12px, weight 700, `ink-faint`, tabular-nums, `#N`.
- **Live dot** (`.live-dot`): 7px circle, `--accent` (`.overrun` → `--danger`), subtle
  matching `box-shadow: 0 0 6px`; `::after` ripple ring animates `scale 0.7→2.4` /
  `opacity 0.9→0` over 1.5s infinite; `display: none` under `prefers-reduced-motion`.
  Sits inline just before the index badge, only on the running card.
- **Timing-type pill** (2026-07-12, on EVERY card): the existing `.card .badge[data-timing]`
  style — `--st-*`-filled pill, white text, uppercase, compacted to 9px in the card row,
  `flex-shrink: 0` — content the timing-type label, placed just before the status
  capsule in the header row. The running card reads its
  timing from `RunningTask.timing` (carried over at START_TASK); a paused remainder shows
  its recomputed remainder timing.
- **Status capsule** (`.state-capsule`): pill (`border-radius: 999px`, padding `2px 7px`,
  inner gap 4px — compacted 2026-07-12 from `2px 9px`/5px for the packed header row),
  background `color-mix(<state-hue> 10%, transparent)`, border
  `color-mix(<state-hue> 35%, transparent)`; category span 9.5px 500 uppercase
  `ink-faint`, `•` bullet, substate span 9.5px 700 uppercase in the state hue.
  **Lifecycle-only (2026-07-12):** `Started • Running/Overrun/Paused`, or single-segment
  `Unstarted` (no substate — the timing moved to the timing pill). Substate→hue: running
  `accent`, overrun `danger`, paused (remainder) `ink-soft` on a plain hairline capsule
  (deliberately hue-less — calm, no new amber token). The unstarted capsule keeps its
  timing hue (`data-hue` = the timing's hue key) so the card still color-agrees.
- **Head badge:** the existing neutral `.badge` pill, content `Head · Sub-head`
  (sub-head omitted when empty). Never hued — color is reserved for state.
  **Lives in the header row next to the title (2026-07-12)** — no own row. The title
  drops its `flex: 1` and ellipsizes (`min-width: 0; overflow: hidden; text-overflow:
  ellipsis; white-space: nowrap`); the capsule takes `margin-left: auto` to stay
  right-pinned; the badge gets the same ellipsis treatment plus `flex-shrink: 20` so a
  long `Head · Sub-head` collapses before the title does. The timing pill and capsule
  are `flex-shrink: 0` — text truncates, pills never do.
- **Fields row** (`.card-fields`): a single flex row (2026-07-12, was a 3-col grid) —
  `display: flex; gap: 10px`, each `.cf-group` a column with `flex: 1 1 auto` and
  min-width left **auto** (= min-content): cells size to their VALUE's content, share
  leftover space, and an over-full row squeezes a long value into wrapping at its
  spaces — but no cell ever shrinks below its longest word, so `00:30` can never wrap.
  Five cells, six on a paused remainder, always one field-row. Label (`.cf-label`):
  9.5px, 600, uppercase, `letter-spacing: 0.04em`, `ink-faint`, plus `width: 0;
  min-width: 100%; overflow: hidden; text-overflow: ellipsis` — the label does NOT
  drive its cell's width (the value does); it stretches to the value's width and
  truncates (`REMAINING` may read `REM…`, never overlapping the next cell). Value
  (`.cf-value`): 12px, tabular-nums, `ink`, `overflow-wrap: break-word` (a long value
  like `~tomorrow 12:01 AM` wraps at spaces, mid-token only as a last resort). Presumed
  (will-reflow) times: `.cf-floating` → italic with a leading `~` in the markup (same
  edge language as the timeline); anchored values upright; absent → `—` in `ink-faint`.
  Every card carries `Start(ed)/End(s)/Budget/Spent/Remaining` (2026-07-12); a paused
  remainder's first field is labelled **Restart** (no "start" — the resume moment) and
  it adds a live **Paused** field as the sixth cell. The former `Resumes at` pill
  (`.resume-pill`) is **removed** (2026-07-12) — redundant with the Restart field.
- **Lock icon** (`.lock-icon`, 2026-07-13): inline padlock SVG shown only when
  `isSlideable = false`, immediately after the title in the header row. 11×11px,
  `stroke: var(--ink-faint)` (neutral — never a state hue), `stroke-width: 1.5`,
  no fill, `flex-shrink: 0`, `title="Not slideable"`. Absence = slideable.
- **Wasted badge** (`.wasted-badge`): quiet neutral pill — hairline border, transparent
  bg, 11px `ink-soft`, the duration in `<strong>` `ink`; never hued.
- Footer buttons keep the semantic action-button law but are **compact (2026-07-12)**:
  `.card .actions button` → `padding: 2px 10px; font-size: 12.5px`. Meta line (`.meta`)
  unchanged.

## Task drawer size

`.drawer`: `width: 100%; max-width: 450px` (widened 2026-07-11 from 440px, +25%), full height,
slides in from the right over the scrim with `border-left` hairline.

## Sub-head / derived-head display

`.derived-head`: 12px, `ink-soft`, with the head name in `<strong>` (`ink`). Shown directly
under the sub-head input the instant a known activity is selected — never editable there;
it's read straight from the registry (§2.1 head/activity hierarchy). Uses the same subtle
`data-tip` mechanism as other drawer fields to note it's derived, not a separate heading.

**Sub-head suggestion choice row (`.ml-choice`, §7.0.1):** a flex row, `align-items: center`
(content centered against the possibly-taller head pill), `gap: 0`.
`.ml-choice-text` is itself a flex row (`align-items: center`): the **lead**
(`.ml-choice-lead`: `suggested` pill + **clickable sub-head pill** + plain `in`) stays whole on one line
(`flex-shrink: 0`); the **head pill** sits **beside** it and takes the remaining width.

The **sub-head name** renders as a **clickable quiet-outline pill** (`.ml-choice-value`, a
`<button>`: `color: ink-faint`, `border: 1px solid hairline`, transparent background, `font-size:
11px`, `padding: 1px 8px`, `border-radius: 8px`; `:hover` → `ink-soft`) — the same quiet theme the
retired "Keep mine" button used. **Clicking it uses the suggestion.** It *is* the accept
affordance: there is no separate "Use this"/"Keep mine" button pair.

The **head** renders as a **subtly brand-filled pill** (`.ml-choice-headpill`: `background:
accent-soft`, text `on-accent` white, `padding: 3px 8px`, `border-radius: 8px`) that **stays beside
the sub-head and never drops below it**. As a flex cell (`flex: 0 1 auto; min-width: 0`) it takes
the remaining width and, when the head is long, **wraps its text INSIDE — the pill grows taller**
rather than moving to the next line (`overflow-wrap: anywhere` breaks a single over-long token in
place). **Note:** the brand tint is a deliberate, user-directed exception to the "accent is
reserved for living elements only" usage rule below.

## Topbar navigation menu (2026-07-12)

`.nav-menu`: flex row, `gap: 2px`, sits directly after the wordmark. Each `.nav-btn` is
the house quiet icon button (28px square, transparent, `ink-faint`, monoline 16px SVG,
hover → `ink`), with a `data-tip` tooltip (Day / History / Analytics). Active screen:
`.nav-btn.active` → `color: ink; opacity: 1` plus a 2px `ink-soft` underline bar
(`::after`, `left/right: 6px; bottom: 2px; border-radius: 1px`). Never accent — the menu
is chrome, not a living element.

## History screen (full page, 2026-07-12)

Same full-page chrome as the Heads config screen (`.config-screen`: `grid-column: 1/-1;
grid-row: 2/3` under the topbar, which stays visible), scrollable, `max-width: 640px`
centered body. Day group: `.history-day` heading — 14px serif-weight 600 `ink`, hairline
`border-bottom`, `padding-bottom: 6px`, `margin: 18px 0 10px`. Row (`.history-row`): flex,
`gap: 10px`, `align-items: center`, `padding: 8px 4px`, hairline bottom border between
rows; time range `.hr-range` 12px tabular-nums `ink-soft` `width: 130px` upright (history
is fact); title `.hr-title` 13px 600 `ink` `flex: 1`; the neutral head badge (reuses
`.badge.head-badge`); outcome pill `.outcome-pill` (same shape as `.state-capsule`, 9.5px
700 uppercase): completed → accent tint, soft-ended → hue-less hairline, cancelled →
danger tint, skipped → hue-less + `opacity 0.6` + line-through title; duration `.hr-dur`
12px tabular-nums `ink`.
Ordering is **oldest-first** (days and rows, 2026-07-13). **Gap row** (`.history-gap`,
2026-07-13): a `.history-row` with only range / "gap" title / duration (no badge, no
outcome pill); whole row `opacity: 0.55`; title italic 400 `ink-soft`.

## Analytics screen (full page, 2026-07-12)

Same full-page chrome, `max-width: 720px`. Hero row (`.ledger-hero`): 3 stat cells
(`.stat`), each a column — label 10px uppercase `ink-faint` over a 20px serif tabular
value in `ink`; Wasted/Lost values take `--danger` only when non-zero. Tables
(`.ledger-table`): full-width, hairline row borders, 13px; header cells 10px uppercase
`ink-faint`; numeric cells tabular-nums right-aligned; per-head rows plain `ink`; totals
row 600 weight with a `ink-soft` top border. Durations only, `fmtDur`. Section headings
match the config screen's (14px, `ink-soft`).

## SOD / EOD ceremony (§4.2/§4.3, 2026-07-15)

**Topbar controls** (`.ceremony-controls`, after the accounted/lost hero): `.sod-btn` +
`.eod-btn` — 12px 600, `paper-raised` fill, `hairline` border, `ink-soft`; hover → `accent`
border + `ink`. When the SOD precondition holds and no ceremony is running, `.sod-btn.ready`
fills `accent` with white text (hue = a primary, ready action — reuses the accent, introduces
no new hue). **No new colours anywhere in the ceremony** — accent / hairline / paper-raised /
ink-soft / danger only.

**SodCeremony** reuses the full-page config-screen chrome. Header has a right-aligned step
rail `.sod-steps` → `.sod-step` (11px pill; `.active` = accent fill + white; `.done` =
`ink-soft` with a 40%-accent border). Body uses `.config-section` + `.config-subsection`
(h4 12px 600 `ink-soft`). Sweep step shows a `.ledger-hero` (Day span / Accounted / Lost;
Lost `--danger` when non-zero). Leftover rows `.sod-leftover` (8×12px, hairline, radius 8):
title (`.sl-title` 13px, flex), head badge, and a Keep/Discard `.type-chip` (budgeted hue =
keep, fixed hue = discard) — or an "expired — cleared" skipped pill for auto-dead. Discarded
rows are 55% opacity with a strikethrough title. Bulk `.sod-bulk` = Carry all / Discard all.
Durations via `fmtDur`; times via `fmtDayTime`.

**EOD modal** (`.eod-modal`, `max-width: 420px`) reuses drawer chrome: footer
[Complete (primary)] · [Pause] · spacer · [Keep working]. A no-op EOD (nothing running) shows
the shared `.notice-toast`.

## Week plan + off-periods (§4.4/§4.5, 2026-07-15)

**WeekView** (full-page config-screen): header carries a `.sod-btn.ready` **Start New Week**
button. Sections: "This week" (status + OFF-day `.type-chip` toggles, semi-tail hue = selected),
and "Task templates" — a `.wk-section-head` (h3 + `.hist-add-btn`) over a `.sod-leftovers` list
of `.wk-template` rows (title, head badge, `.wk-days` = 11px `ink-soft` weekday letters, budget/
`@time`). Rows hover to `accent`. When mid-week-locked, a `.form-warning` banner shows with an
`.off-urgent` checkbox (Urgent override); Add/rows disable. **No new hues** — accent / semi-tail /
budgeted state hues + hairline/ink only.

**TemplateEditor** + **OffDialog** reuse drawer chrome. Timing/weekday pickers are `.type-chips`;
`.wk-shortcuts` = `.link-btn` (underlined 12px accent text) for Daily/Weekdays/Weekend. Anchor
time-of-day and budget fields are smart-input (§7.0.2). The topbar `.ceremony-controls` gains an
**Off / End Off** `.eod-btn` next to EOD.

## Heads & Sub-heads config screen (full page)

Not a modal — replaces the timeline+pipeline grid area entirely (`grid-column: 1/-1;
grid-row: 2/3` — **below the topbar, which stays visible** since the nav menu lives
there; corrected 2026-07-12, the old `1/3` span shoved the topbar into an implicit bottom
row), scrollable, `max-width: 640px` centered body. Sticky header (`back`
chevron + title) matches the topbar's height/border-bottom for visual continuity. Section
headings are small (`14px`, `ink-soft`) — this screen is data-entry-first, no fancy chrome
needed since it's visited rarely. Head delete (×) sits inline with the head name
(`.config-head-title`, flex gap 6px) — same `.chip-delete` quiet-ink-faint-to-danger style
as sub-head chip deletes; simply absent (not disabled/greyed) for built-in heads.

**Built-in marker** (`.built-in-dot`): a plain 5px circle, **`accent-strong` (brand)** at 60%
opacity — the brand tint marks it as a core/system-provided item; no text — the tooltip
("Built-in — can't be deleted") only appears on hover. Registry
list is sorted built-ins first (stable sort, order preserved within each group). This is
the quietest possible signal: the missing delete button already communicates
"protected"; the dot is just a secondary hint for *why*, not a loud "BUILT-IN" badge.

## Reassign panel (config screen)

`.reassign-panel`: 1px `accent` border (not hairline — this is an active, in-progress
action, deserves more visual weight than the surrounding static sections), `--radius`,
12px padding. Appears inline in place of a plain delete when the target is still
referenced by a task (see spec Part VI "Deletion guard"). Footer-style row: fuzzy dropdown
for the target sub-head, a second fuzzy dropdown for its head (only shown when the typed
target is new), `primary` "Reassign & delete", `cancel-accent` "Cancel" — same button
semantics as the drawer footer (§ "Semantic action-button colors").

## Fuzzy filtered dropdown (the one combobox pattern, everywhere)

`.fuzzy-combobox` wraps a `.clearable-field` input + an absolutely-positioned
`.fuzzy-list` (`top: 100% + 4px`, `paper-raised` surface, hairline border, `--shadow-2`,
radius, `max-height: 220px` scrollable, `z-index: 50`). Each `.fuzzy-option` is 13px
`ink-soft`; matched letters render in `<strong>` at full `ink` + weight 700 — **bold only,
no color change** (deliberately not tinted, per the request that specified "bolded").
Active/hovered option gets `accent-soft` background. Matching algorithm is subsequence
("literal letters, in order"), not fuzzy-with-typo-tolerance and not plain substring —
see `apps/web/src/fuzzy.ts`. Ranking: tighter match-span first, then earliest first-match
position, so more precise matches float to the top.

## Splash screen

- Overlay: `position: fixed; inset: 0; z-index: 100`, background `--paper`, exit
  `transition: opacity 450ms ease` (class `splash-leave`).
- Hold: minimum **3000ms** from mount (constant `SPLASH_MIN_MS` in `App.tsx`), fade
  **450ms** (`SPLASH_FADE_MS`); splash also covers the pre-`ready` store window.
- Stack: column, centered, `gap: 22px`.
- Wordmark: serif (h1), **58px**, `--ink`; enters via `splash-rise` 1000ms
  `cubic-bezier(0.2,0.7,0.3,1)`: opacity 0→1, `translateY(14px)`→0, letter-spacing
  `0.08em`→`0.01em`.
- Seam: **280 × 2px**, `--accent-soft`, draws via `splash-draw` (scaleX 0→1 from center)
  800ms, 400ms delay.
- Dot: 12px circle, `--accent`, centered on the seam's left end; fades in 400ms @1000ms,
  then `splash-sweep` (left 0→100%→0) 2400ms `cubic-bezier(0.45,0.05,0.55,0.95)` infinite
  from 1200ms.
- Tagline: "every minute accounted", 13px, uppercase, letter-spacing `0.28em`,
  `--ink-soft`; fades in 800ms @900ms.
