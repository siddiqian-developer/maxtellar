/**
 * §2.9/§11.1b/§2.10b preset pills for the task drawer. A preset pre-fills a
 * bundle of fields — some locked, some editable — and can be auto-selected
 * from a matching title (ML auto-switch, §7.0.1).
 *
 * 2026-07-18: presets became a USER-EDITABLE LIST (not a fixed 7-id union) —
 * any registry head can be added as a preset, and any preset can be removed
 * (Settings → Presets, the compact table). Each preset carries its own TIMING
 * TYPE and, for whichever field that timing REQUIRES per §2.5's FIELD_ROLES
 * matrix (budgeted→budget; fixed→start+end; semi-head→start; semi-tail→end;
 * unscheduled→none), a VALUE SOURCE:
 *  - "flat"     — a fixed number the user set (minutes for budget; a time-of-
 *                 day for start/end).
 *  - "weekPlan" — resolved live at apply-time from the WEEK PLAN: budget from
 *                 that head's TODAY line in `weekDayShape` (§11); start/end
 *                 from a matching WeekTemplate's own anchors, if one fires
 *                 today for this head (falls back to the flat value if none).
 *  - "settings" — only meaningful for Sleep's budget (week.sleepMinutes,
 *                 §11.4 — the one pre-existing settings-sourced value).
 *
 * The whole PRESETS list (not just per-id timing) is now persisted state —
 * lives in `settings.tsx` (`presetsConfig`), not a static export here. This
 * file keeps the RESOLUTION logic (source → concrete value) and the built-in
 * shipped defaults, since both are pure and used by multiple surfaces.
 */

import { SLEEP_ID, NAP, FOOD_ID, MEDITATION_ID, EXERCISE_ID, LEARNING_ID, headName } from "@maxtellar/core";
import type { State, TimingType, WeekTemplate } from "@maxtellar/core";
import { templateValidOn, weekDayShape } from "@maxtellar/core";

export type BudgetSource = "flat" | "weekPlan" | "settings";
export type AnchorSource = "flat" | "weekPlan";

export interface PresetConfig {
  /** Stable row id. Usually the head's PATH id (one preset per head;
   * re-adding a removed head's preset reuses the same id, no duplicates) —
   * EXCEPT Sleep/Nap (revised 2026-07-19): both are presets for the SAME
   * head (`SLEEP_ID`) now that Nap is a sub-head, not its own head, so Nap's
   * `id` is synthesized (`${SLEEP_ID}::Nap`) to stay distinct from Sleep's
   * (`SLEEP_ID`). `id` is opaque everywhere it's used (dnd-kit sort key,
   * update/remove lookup) — nothing assumes `id === headId`. */
  id: string;
  headId: string;
  /** Pill label / seed title, and — for Sleep/Nap specifically — the
   * sub-head `resolvePreset` resolves to (`subhead: p.label`, below). Title
   * is user-editable at log time unless `titleLocked` (Sleep/Nap keep a
   * fixed title, matching §2.9). */
  label: string;
  titleLocked: boolean;
  timing: TimingType;
  /** Flat minutes, used when budgetSource==="flat" OR as the fallback when a
   * sourced value isn't available today. */
  budgetFlat: number;
  budgetSource: BudgetSource;
  /** Flat time-of-day minutes [0,1440), used the same way for start/end. */
  startFlat: number;
  endFlat: number;
  anchorSource: AnchorSource;
  /** Lowercased keywords for the §7.0.1 deterministic title auto-switch. */
  keywords: string[];
}

/** §11.1b shipped defaults (2026-07-18) — Socialization intentionally absent
 * (removed from presets per the user; it stays a plain built-in head). Order
 * is the user's: Exercise, Food, Learning, Nap, Meditation, Sleep. */
export const SHIPPED_PRESETS: PresetConfig[] = [
  {
    id: EXERCISE_ID,
    headId: EXERCISE_ID,
    label: "Exercise",
    titleLocked: false,
    timing: "budgeted",
    budgetFlat: 30,
    budgetSource: "weekPlan",
    startFlat: 0,
    endFlat: 0,
    anchorSource: "flat",
    keywords: ["exercise", "workout", "gym", "run", "running", "training"],
  },
  {
    id: FOOD_ID,
    headId: FOOD_ID,
    label: "Food",
    titleLocked: false,
    timing: "unscheduled",
    budgetFlat: 30,
    budgetSource: "flat",
    startFlat: 0,
    endFlat: 0,
    anchorSource: "flat",
    keywords: ["food", "meal", "eat", "eating", "lunch", "dinner", "breakfast", "brunch", "snack", "supper"],
  },
  {
    id: LEARNING_ID,
    headId: LEARNING_ID,
    label: "Learning",
    titleLocked: false,
    timing: "fixed",
    budgetFlat: 30,
    budgetSource: "flat",
    startFlat: 9 * 60,
    endFlat: 9 * 60 + 30,
    anchorSource: "weekPlan",
    keywords: ["learning", "study", "studying", "course", "practice"],
  },
  {
    // Nap is a Sleep sub-head now, not its own head (revised 2026-07-19) — see
    // the `id` field comment above for why this can't just be `SLEEP_ID`.
    id: `${SLEEP_ID}::${NAP}`,
    headId: SLEEP_ID,
    label: "Nap",
    titleLocked: true,
    timing: "unscheduled",
    budgetFlat: 20,
    budgetSource: "flat",
    startFlat: 0,
    endFlat: 0,
    anchorSource: "flat",
    keywords: ["nap", "napping", "power nap", "siesta", "doze"],
  },
  {
    id: MEDITATION_ID,
    headId: MEDITATION_ID,
    label: "Meditation",
    titleLocked: false,
    timing: "unscheduled",
    budgetFlat: 15,
    budgetSource: "flat",
    startFlat: 0,
    endFlat: 0,
    anchorSource: "flat",
    keywords: ["meditation", "meditate", "meditating", "mindfulness"],
  },
  {
    id: SLEEP_ID,
    headId: SLEEP_ID,
    label: "Sleep",
    titleLocked: true,
    timing: "budgeted",
    budgetFlat: 480,
    budgetSource: "settings",
    startFlat: 0,
    endFlat: 0,
    anchorSource: "flat",
    keywords: ["sleep", "sleeping", "bedtime", "go to bed", "night sleep"],
  },
];

/** A new row for "+ Add preset" — sane, inert defaults (unscheduled, flat 30m)
 * for whatever head the user picks. */
export function blankPresetFor(headId: string): PresetConfig {
  return {
    id: headId,
    headId,
    label: headName(headId),
    titleLocked: false,
    timing: "unscheduled",
    budgetFlat: 30,
    budgetSource: "flat",
    startFlat: 9 * 60,
    endFlat: 9 * 60 + 30,
    anchorSource: "flat",
    keywords: [],
  };
}

export interface ResolvedPreset {
  title: string;
  titleEditable: boolean;
  headId: string;
  subhead: string;
  timing: TimingType;
  /** Only the field(s) this timing actually uses are populated (mirrors
   * §2.5 FIELD_ROLES — a `budgeted` preset has no start/end, etc.). */
  budget?: number;
  startTod?: number;
  endTod?: number;
}

/** Today's matching WeekTemplate for this head, if any (weekday-valid, not
 * retired) — the source for `anchorSource==="weekPlan"`. */
function todaysTemplateFor(state: State, headId: string): WeekTemplate | undefined {
  const weekday = new Date(state.now).getDay();
  const midnight = state.now - (state.now % 1440);
  return state.week.templates.find(
    (t) => t.headId === headId && t.weekdays.includes(weekday) && templateValidOn(t, midnight),
  );
}

/**
 * Resolve a preset's live field values at apply-time (tapping the pill).
 * `state` supplies the week-plan/settings sources; a sourced value that isn't
 * available today (no matching template, no budget line) falls back to the
 * preset's own flat value — a preset NEVER fails to apply. `state` is
 * OPTIONAL: a surface with no live day context (the week-plan TEMPLATE
 * editor — a template has no "today") omits it, and every source silently
 * degrades to the preset's flat value (never load-bearing).
 */
export function resolvePreset(p: PresetConfig, state?: State): ResolvedPreset {
  const base: ResolvedPreset = {
    title: p.label,
    titleEditable: !p.titleLocked,
    headId: p.headId,
    subhead: p.label,
    timing: p.timing,
  };

  if (p.timing === "budgeted" || p.timing === "semi-head" || p.timing === "semi-tail" || p.timing === "fixed") {
    let budget = p.budgetFlat;
    if (state && p.budgetSource === "settings") {
      budget = state.week.sleepMinutes;
    } else if (state && p.budgetSource === "weekPlan") {
      const weekday = new Date(state.now).getDay();
      const line = weekDayShape(state.week, weekday).lines.find((l) => l.headId === p.headId);
      if (line) budget = line.minutes;
    }
    if (p.timing === "budgeted") base.budget = budget;
  }

  if (p.timing === "fixed" || p.timing === "semi-head") {
    let start = p.startFlat;
    if (state && p.anchorSource === "weekPlan") {
      const t = todaysTemplateFor(state, p.headId);
      if (t?.anchorStartTod !== undefined) start = t.anchorStartTod;
    }
    base.startTod = start;
  }
  if (p.timing === "fixed" || p.timing === "semi-tail") {
    let end = p.endFlat;
    if (state && p.anchorSource === "weekPlan") {
      const t = todaysTemplateFor(state, p.headId);
      if (t?.anchorEndTod !== undefined) end = t.anchorEndTod;
    }
    base.endTod = end;
  }
  return base;
}

/**
 * §7.0.1 ML auto-switch: pick the preset a title matches, or null. Deterministic
 * keyword match (a whole-word or clear substring hit) — an on-device, always-
 * available signal; never load-bearing. The longest matching keyword wins so
 * "power nap" beats a stray "nap" substring elsewhere.
 */
export function matchPreset(title: string, presets: PresetConfig[]): PresetConfig | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  const words = new Set(t.split(/[^a-z]+/).filter(Boolean));
  let best: { preset: PresetConfig; len: number } | null = null;
  for (const preset of presets) {
    for (const kw of preset.keywords) {
      const hit = kw.includes(" ") ? t.includes(kw) : words.has(kw);
      if (hit && (!best || kw.length > best.len)) best = { preset, len: kw.length };
    }
  }
  return best?.preset ?? null;
}
