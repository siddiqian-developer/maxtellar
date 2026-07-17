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
  RECHARGE,
  FOOD,
  WASTED_TIME,
  LOST_HOURS,
  OFF_PERIOD,
  CATEGORIES,
  RECHARGING,
  CORE_WORK,
  MAINTENANCE,
  TIME_WASTED,
  SELF_MANAGEMENT_ID,
  RECHARGE_ID,
  FOOD_ID,
  WASTED_TIME_ID,
  LOST_HOURS_ID,
  OFF_PERIOD_ID,
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
 * Recharge/Food are "inevitable-necessity" heads: undeletable AND plannable. */
export const PLANNABLE_BUILT_IN_HEADS: readonly string[] = [SELF_MANAGEMENT_ID, RECHARGE_ID, FOOD_ID];
/** §2.10/§4.5 system built-ins — accounting-owned, never planned as ordinary
 * tasks; shown in config (with a note) but hidden from the drawer's planning
 * pickers. Off-Periods is booked by the §4.5 off-period mechanism, not planned. */
export const SYSTEM_BUILT_IN_HEADS: readonly string[] = [WASTED_TIME_ID, LOST_HOURS_ID, OFF_PERIOD_ID];
/** All undeletable built-ins (plannable + system) — PATH ids. */
export const BUILT_IN_HEADS: readonly string[] = [...PLANNABLE_BUILT_IN_HEADS, ...SYSTEM_BUILT_IN_HEADS];
/** A built-in's name is reserved only WITHIN its own category (user decision
 * 2026-07-18) — e.g. no user head may be named "Recharge" under Recharging
 * (that collides with the real built-in's path), but "Recharge" is free to
 * use as a user head's name under a different category. Map: name -> its
 * built-in's home category. */
const RESERVED_IN_CATEGORY: Readonly<Record<string, string>> = {
  [SELF_MANAGEMENT]: CORE_WORK,
  [RECHARGE]: RECHARGING,
  [FOOD]: MAINTENANCE,
  [WASTED_TIME]: TIME_WASTED,
  [LOST_HOURS]: TIME_WASTED,
  [OFF_PERIOD]: MAINTENANCE,
};

/** One-line note shown in the config for the non-plannable system heads only
 * (plannable built-ins carry no note — §2.10). */
export const BUILT_IN_HEAD_NOTES: Record<string, string> = {
  [WASTED_TIME_ID]: "system head — logged, never planned",
  [LOST_HOURS_ID]: "system head — auto-booked at day close",
  [OFF_PERIOD_ID]: "system head — booked by off-periods, never planned",
};

/** Built-in sub-heads seeded under their head (the §2.9 presets live here). */
const BUILT_IN_SUBHEADS: Record<string, string[]> = {
  [RECHARGE_ID]: ["Sleep", "Nap"],
  [FOOD_ID]: ["Food"],
};

/** Is (headId, activity) a built-in preset sub-head? Undeletable, like its head. */
export function isBuiltInActivity(headId: string, activity: string): boolean {
  return (BUILT_IN_SUBHEADS[headId] ?? []).includes(activity);
}

/** §11.1 shipped seed — BUILT-INS ONLY (2026-07-18: all user/example heads
 * removed pending the user's next authoritative list, which will mark which
 * entries are built-in). Registry object key order IS the display order
 * within a category. */
const DEFAULT_REGISTRY: HeadsRegistry = {
  // Recharging
  [RECHARGE_ID]: [...(BUILT_IN_SUBHEADS[RECHARGE_ID] ?? [])],
  // Core Work
  [SELF_MANAGEMENT_ID]: [],
  // Maintenance
  [FOOD_ID]: [...(BUILT_IN_SUBHEADS[FOOD_ID] ?? [])],
  [OFF_PERIOD_ID]: [],
  // Wasted Time
  [WASTED_TIME_ID]: [],
  [LOST_HOURS_ID]: [],
};

/** Merge a persisted registry so every UNDELETABLE built-in head — and its
 * seeded built-in sub-heads — is always present, without dropping the user's
 * own additions (unions sub-head lists for built-in heads). Starts from
 * `stored`, NOT from DEFAULT_REGISTRY: non-built-in seed heads are deletable
 * starters, so once a stored registry exists they must not silently resurrect
 * on reload (bug class fixed 2026-07-16). First run (nothing stored) still
 * gets the full DEFAULT_REGISTRY via the caller. */
function mergeRegistry(stored: HeadsRegistry): HeadsRegistry {
  const merged: HeadsRegistry = { ...stored };
  for (const head of BUILT_IN_HEADS) {
    const seeded = BUILT_IN_SUBHEADS[head] ?? [];
    const existing = stored[head] ?? [];
    merged[head] = [...seeded, ...existing.filter((a) => !seeded.includes(a))];
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
  /** Ordered categories: the shipped 7 (+ user-added), user-reorderable. */
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
