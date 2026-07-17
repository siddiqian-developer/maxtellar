/**
 * Heads & Activities registry (SPEC §2.1, §11.1: Category → Head → Sub-head).
 * A head's identity is its PATH `(category, head)`, encoded as ONE string id
 * (core `headPath.ts`) — the same head name may live under two Categories with
 * different meaning ("Social Media" under Not Work vs Wasted Time). Display
 * always uses the bare name via `headName()`.
 *
 * Categories are an ordered list: the 7 shipped defaults (§11.1) plus any
 * user-added ones (add-only). The order is user-controlled and persisted.
 * Persisted locally (no backend in MVP, §7.2); managed via the full-screen
 * Heads & Sub-heads configuration screen.
 */

import { createContext, useContext, useEffect, useState } from "react";
import {
  SELF_MANAGEMENT,
  SLEEP,
  FOOD,
  WASTED_TIME,
  LOST_HOURS,
  OFF_PERIOD,
  MEDITATION,
  EXERCISE,
  SOCIALIZATION,
  LEARNING,
  CATEGORIES,
  RECHARGING,
  CORE_WORK,
  MAINTENANCE,
  REGENERATION,
  UPGRADING,
  NOT_WORK,
  TIME_WASTED,
  LOST_TIME,
  SELF_MANAGEMENT_ID,
  SLEEP_ID,
  NAP_ID,
  FOOD_ID,
  WASTED_TIME_ID,
  LOST_HOURS_ID,
  OFF_PERIOD_ID,
  MEDITATION_ID,
  EXERCISE_ID,
  SOCIALIZATION_ID,
  LEARNING_ID,
  headPath,
  headName,
  headCategory,
  isHeadPath,
  sanitizeHeadName,
} from "@maxtellar/core";
import { forgetActivity } from "./ml/vectorStore";

/** head PATH id -> its activity (sub-head) names. */
export type HeadsRegistry = Record<string, string[]>;

/** §2.10 plannable built-ins — schedulable like any head, no config note.
 * Sleep/Food are "inevitable-necessity" heads: undeletable AND plannable
 * (Sleep/Nap became distinct HEADS 2026-07-18, replacing the earlier
 * "Recharge" head + sleepKind sub-distinction — see core `types.ts`;
 * Nap itself was then demoted to an ORDINARY deletable seeded head,
 * user decision 2026-07-18 — only Sleep carries the built-in mark).
 * Meditation/Exercise/Socialization/Learning joined 2026-07-18 with the same
 * treatment (Food-pattern parity — see §11.1b for the preset+quick-add layer
 * specific to these plus Sleep/Food). */
export const PLANNABLE_BUILT_IN_HEADS: readonly string[] = [
  SELF_MANAGEMENT_ID,
  SLEEP_ID,
  FOOD_ID,
  MEDITATION_ID,
  EXERCISE_ID,
  SOCIALIZATION_ID,
  LEARNING_ID,
];
/** §2.10/§4.5 system built-ins — accounting-owned, never planned as ordinary
 * tasks; shown in config (with a note) but hidden from the drawer's planning
 * pickers. Off-Periods is booked by the §4.5 off-period mechanism, not planned. */
export const SYSTEM_BUILT_IN_HEADS: readonly string[] = [WASTED_TIME_ID, LOST_HOURS_ID, OFF_PERIOD_ID];
/** All undeletable built-ins (plannable + system) — PATH ids. */
export const BUILT_IN_HEADS: readonly string[] = [...PLANNABLE_BUILT_IN_HEADS, ...SYSTEM_BUILT_IN_HEADS];
/** All 8 shipped categories are built-in (2026-07-18): reorderable, but never
 * renamed or removed. Distinct from `CATEGORIES` (the shipped DEFAULT order)
 * — this is the identity check used to bar removal of any of these eight,
 * regardless of the live (user-reordered) position. */
export const BUILT_IN_CATEGORIES: readonly string[] = CATEGORIES;
/** A built-in's name is reserved only WITHIN its own category (user decision
 * 2026-07-18) — e.g. no user head may be named "Sleep" under Recharging (that
 * collides with the real built-in's path), but "Sleep" is free to use as a
 * user head's name under a different category. Map: name -> its built-in's
 * home category. */
const RESERVED_IN_CATEGORY: Readonly<Record<string, string>> = {
  [SELF_MANAGEMENT]: CORE_WORK,
  [SLEEP]: RECHARGING,
  [FOOD]: MAINTENANCE,
  [WASTED_TIME]: TIME_WASTED,
  [LOST_HOURS]: LOST_TIME,
  [OFF_PERIOD]: MAINTENANCE,
  [MEDITATION]: REGENERATION,
  [EXERCISE]: REGENERATION,
  [SOCIALIZATION]: REGENERATION,
  [LEARNING]: UPGRADING,
};

/** One-line note shown in the config for the non-plannable system heads only
 * (plannable built-ins carry no note — §2.10). */
export const BUILT_IN_HEAD_NOTES: Record<string, string> = {
  [WASTED_TIME_ID]: "system head — logged, never planned",
  [LOST_HOURS_ID]: "system head — auto-booked at day close",
  [OFF_PERIOD_ID]: "system head — booked by off-periods, never planned",
};

/** Is (headId, activity) a built-in preset sub-head? None shipped in the seed
 * (2026-07-18: the seed carries zero sub-heads — users add their own later).
 * Kept as a function (not a flat constant) so a future built-in preset
 * sub-head has one place to register. */
export function isBuiltInActivity(_headId: string, _activity: string): boolean {
  return false;
}

/** §11.1 shipped seed — the user's authoritative list (2026-07-18, overrides
 * the prior seed entirely). The list is Category -> Head, FLAT — NO sub-heads
 * at all (confirmed by the user: every line under a category is a head, full
 * stop; sub-heads exist in the schema but are added later, by the user, never
 * seeded). Built-ins marked `*` in the source list are the PATH constants
 * (Sleep, Self-Management, Food, Meditation, Exercise, Socialization
 * [Regeneration], Learning — Nap seeds but is ordinary/deletable). Off-Periods/Wasted Time/Lost Hours are system
 * built-ins with no `*` in the user's list (pre-existing, §4.5/§2.6
 * accounting heads). Registry object key order IS the display order within
 * a category. */
const DEFAULT_REGISTRY: HeadsRegistry = {
  // Recharging
  [SLEEP_ID]: [],
  [NAP_ID]: [],
  // Core Work
  [SELF_MANAGEMENT_ID]: [],
  [headPath(CORE_WORK, "Strategy and Planning")]: [],
  [headPath(CORE_WORK, "Research")]: [],
  [headPath(CORE_WORK, "Project Execution")]: [],
  [headPath(CORE_WORK, "Job")]: [],
  [headPath(CORE_WORK, "Sales")]: [],
  [headPath(CORE_WORK, "Fundraising")]: [],
  [headPath(CORE_WORK, "Job Search")]: [],
  [headPath(CORE_WORK, "Marketing")]: [],
  [headPath(CORE_WORK, "Public Speaking")]: [],
  [headPath(CORE_WORK, "Investor Hunting")]: [],
  [headPath(CORE_WORK, "Networking")]: [],
  [headPath(CORE_WORK, "Other Work #1")]: [],
  [headPath(CORE_WORK, "Other Work #2")]: [],
  // Maintenance
  [FOOD_ID]: [],
  [headPath(MAINTENANCE, "Kitchen work")]: [],
  [headPath(MAINTENANCE, "Cleaning")]: [],
  [headPath(MAINTENANCE, "Plantcare")]: [],
  [headPath(MAINTENANCE, "Clothes Work")]: [],
  [headPath(MAINTENANCE, "Health")]: [],
  [OFF_PERIOD_ID]: [],
  // Regeneration
  [headPath(REGENERATION, "Rest")]: [],
  [MEDITATION_ID]: [],
  [headPath(REGENERATION, "Break")]: [],
  [EXERCISE_ID]: [],
  [SOCIALIZATION_ID]: [],
  [headPath(REGENERATION, "Entertainment")]: [],
  // Upgrading
  [headPath(UPGRADING, "Personal Philosophy")]: [],
  [LEARNING_ID]: [],
  [headPath(UPGRADING, "English Speaking Learning/Practice")]: [],
  // Not Work
  [headPath(NOT_WORK, "Social Media")]: [],
  [headPath(NOT_WORK, "Sports")]: [],
  [headPath(NOT_WORK, "Socialization")]: [],
  // Wasted Time
  [WASTED_TIME_ID]: [],
  [headPath(TIME_WASTED, "Social Media")]: [],
  [headPath(TIME_WASTED, "Socialization")]: [],
  [headPath(TIME_WASTED, "Entertainment")]: [],
  // Lost Time
  [LOST_HOURS_ID]: [],
};

/** Merge a persisted registry so every UNDELETABLE built-in head is always
 * present, without dropping the user's own additions. Starts from `stored`,
 * NOT from DEFAULT_REGISTRY: non-built-in seed heads are deletable starters,
 * so once a stored registry exists they must not silently resurrect on
 * reload (bug class fixed 2026-07-16). First run (nothing stored) still gets
 * the full DEFAULT_REGISTRY via the caller. No built-in ships with seeded
 * sub-heads (2026-07-18) — this is a pure "key exists" guarantee now. */
function mergeRegistry(stored: HeadsRegistry): HeadsRegistry {
  const merged: HeadsRegistry = { ...stored };
  for (const head of BUILT_IN_HEADS) {
    merged[head] = stored[head] ?? [];
  }
  return merged;
}

/** Stored category order merged so every shipped category is always present
 * (user reorder wins; missing shipped ones append in default order). */
function mergeCategoryOrder(stored: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const c of [...stored, ...CATEGORIES]) {
    if (!seen.has(c)) {
      seen.add(c);
      merged.push(c);
    }
  }
  return merged;
}

interface HeadsApi {
  registry: HeadsRegistry;
  /** All head PATH ids, in category order (then registry insertion order). */
  heads: string[];
  /** Ordered categories: the shipped 8 (+ user-added), user-reorderable. */
  categories: string[];
  /** Only the heads a user may PLAN under — excludes the system built-ins
   * (Wasted Time / Lost Hours / Off-Periods). The drawer's pickers read this. */
  plannableHeads: string[];
  /** Sub-heads under plannable heads only — the drawer's sub-head options. */
  plannableActivities: string[];
  /** activity name -> its head PATH id (first match in category order). */
  headFor: (activity: string) => string | undefined;
  /** Adds a head under `category` (default Core Work). Accepts a bare name or
   * a full path id. Built-in names are reserved — resolves to the built-in. */
  addHead: (head: string, category?: string) => void;
  /** Adds the activity under `headRef` (path id, or a bare name resolved in
   * category order — creating the head under Core Work if new). */
  addActivity: (headRef: string, activity: string) => void;
  /** Removes the activity from its head. Existing tasks keep their activityId
   * string — the registry only stops listing/deriving it. Also forgets the
   * activity's ML title→sub-head pairings + name vector (§7.0.1). */
  deleteActivity: (headId: string, activity: string) => void;
  /** Removes a head and all its sub-heads from the registry. No-op for
   * built-ins. Existing tasks keep their headId/activityId untouched.
   * Forgets every removed sub-head's ML pairings (§7.0.1). */
  deleteHead: (headId: string) => void;
  /** §11.1: the head's Category — parsed straight from the path id. */
  categoryFor: (headId: string) => string;
  /** §11.1a: move a head to another category — RE-KEYS its path id (sub-heads
   * ride along). Returns the new id, or null if barred (built-in head, same
   * category, or the target already has a head of that name). Task references
   * to the old id are the CALLER's job (config screen reassigns). */
  moveHead: (headId: string, toCategory: string) => string | null;
  /** §11.1a: append a user category (add-only). No-op on duplicates. */
  addCategory: (category: string) => void;
  /** §11.1a: persist a new category order (a permutation; validated). */
  reorderCategories: (order: string[]) => void;
}

const HeadsContext = createContext<HeadsApi | null>(null);

export function HeadsProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [registry, setRegistry] = useState<HeadsRegistry>(() => {
    try {
      const stored = localStorage.getItem("headsRegistry");
      if (stored) return mergeRegistry(JSON.parse(stored) as HeadsRegistry);
    } catch {
      // fall through to defaults
    }
    return DEFAULT_REGISTRY;
  });

  useEffect(() => {
    localStorage.setItem("headsRegistry", JSON.stringify(registry));
  }, [registry]);

  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("categoryOrder");
      if (stored) return mergeCategoryOrder(JSON.parse(stored) as string[]);
    } catch {
      // fall through to defaults
    }
    return [...CATEGORIES];
  });

  useEffect(() => {
    localStorage.setItem("categoryOrder", JSON.stringify(categoryOrder));
  }, [categoryOrder]);

  const categoryFor = (headId: string): string => headCategory(headId) ?? CORE_WORK;

  /** Position of a head's category in the user order (unknowns sort last). */
  const catPos = (headId: string): number => {
    const i = categoryOrder.indexOf(categoryFor(headId));
    return i < 0 ? categoryOrder.length : i;
  };

  /** All head ids, category order first, registry insertion order within. */
  const heads = Object.keys(registry).sort((a, b) => catPos(a) - catPos(b));

  /** Resolve a head reference — path id, reserved built-in name, or bare name
   * (first head of that name in category order) — to an EXISTING id, if any. */
  const resolveHead = (ref: string): string | undefined => {
    if (isHeadPath(ref)) return registry[ref] !== undefined ? ref : undefined;
    const name = ref.trim();
    if (!name) return undefined;
    return heads.find((h) => headName(h) === name);
  };

  const addHead = (head: string, category: string = CORE_WORK): void => {
    if (isHeadPath(head)) {
      // Full path id given — honor its own category.
      setRegistry((r) => (r[head] ? r : { ...r, [head]: [] }));
      return;
    }
    const name = sanitizeHeadName(head);
    if (!name) return;
    if (RESERVED_IN_CATEGORY[name] === category) return; // collides with a built-in's own path (§11.1)
    const id = headPath(category, name);
    setRegistry((r) => (r[id] ? r : { ...r, [id]: [] }));
  };

  const addActivity = (headRef: string, activity: string): void => {
    const a = activity.trim();
    if (!headRef.trim() || !a) return;
    const id =
      resolveHead(headRef) ??
      (isHeadPath(headRef) ? headRef : headPath(CORE_WORK, sanitizeHeadName(headRef)));
    if (headName(id) === "") return;
    setRegistry((r) => {
      const existing = r[id] ?? [];
      if (existing.includes(a)) return r;
      return { ...r, [id]: [...existing, a] };
    });
  };

  const deleteActivity = (headId: string, activity: string): void => {
    if (isBuiltInActivity(headId, activity)) return; // built-in preset sub-heads are undeletable
    setRegistry((r) => {
      const existing = r[headId];
      if (!existing || !existing.includes(activity)) return r;
      return { ...r, [headId]: existing.filter((a) => a !== activity) };
    });
    // Deletion means "forget these title→sub-head pairings" (§7.0.1): drop the
    // ML corpus entries + name vector so a same-name re-create starts clean.
    forgetActivity(activity);
  };

  const deleteHead = (headId: string): void => {
    if (BUILT_IN_HEADS.includes(headId)) return;
    const subs = registry[headId] ?? []; // capture before removal, to forget each
    setRegistry((r) => {
      if (!(headId in r)) return r;
      const { [headId]: _removed, ...rest } = r;
      return rest;
    });
    subs.forEach(forgetActivity);
  };

  const moveHead = (headId: string, toCategory: string): string | null => {
    if (BUILT_IN_HEADS.includes(headId)) return null; // built-ins keep their category (§11.1a)
    if (!(headId in registry)) return null;
    if (!categoryOrder.includes(toCategory)) return null;
    const name = headName(headId);
    if (categoryFor(headId) === toCategory) return null;
    const newId = headPath(toCategory, name);
    if (registry[newId] !== undefined) return null; // target already has this name
    setRegistry((r) => {
      const { [headId]: subs, ...rest } = r;
      return { ...rest, [newId]: subs ?? [] };
    });
    return newId;
  };

  const addCategory = (category: string): void => {
    const c = sanitizeHeadName(category);
    if (!c || categoryOrder.includes(c)) return;
    setCategoryOrder((o) => [...o, c]);
  };

  const reorderCategories = (order: string[]): void => {
    // Accept only a true permutation of the current order — nothing lost/invented.
    if (order.length !== categoryOrder.length) return;
    if (new Set(order).size !== order.length) return;
    if (!categoryOrder.every((c) => order.includes(c))) return;
    setCategoryOrder(order);
  };

  const headFor = (activity: string): string | undefined => {
    const a = activity.trim();
    if (!a) return undefined;
    return heads.find((h) => (registry[h] ?? []).includes(a));
  };

  const plannableHeads = heads.filter((h) => !SYSTEM_BUILT_IN_HEADS.includes(h));
  const plannableActivities = plannableHeads.flatMap((h) => registry[h] ?? []);

  return (
    <HeadsContext.Provider
      value={{
        registry,
        heads,
        categories: categoryOrder,
        plannableHeads,
        plannableActivities,
        headFor,
        addHead,
        addActivity,
        deleteActivity,
        deleteHead,
        categoryFor,
        moveHead,
        addCategory,
        reorderCategories,
      }}
    >
      {children}
    </HeadsContext.Provider>
  );
}

export function useHeads(): HeadsApi {
  const ctx = useContext(HeadsContext);
  if (!ctx) throw new Error("useHeads must be used within HeadsProvider");
  return ctx;
}
