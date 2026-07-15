/**
 * Heads & Activities registry (SPEC §2.1: Head = flat category, quotas attach
 * here; Activity = reusable identity under exactly ONE head). "Flat heads"
 * (§8 MVP boundary) means this two-level shape — not that activities aren't
 * grouped under a head. Persisted locally (no backend in MVP, §7.2); managed
 * via the full-screen Heads & Sub-heads configuration screen.
 */

import { createContext, useContext, useEffect, useState } from "react";
import {
  SELF_MANAGEMENT,
  RECHARGE,
  FOOD,
  WASTED_TIME,
  LOST_HOURS,
  OFF_PERIOD,
  CORE_WORK,
  MAINTENANCE,
  TIME_WASTED,
} from "@maxtellar/core";
import { forgetActivity } from "./ml/vectorStore";

/** head name -> its activity (sub-head) names. */
export type HeadsRegistry = Record<string, string[]>;

/** §2.10 plannable built-ins — schedulable like any head, no config note.
 * Recharge/Food are "inevitable-necessity" heads: undeletable AND plannable. */
export const PLANNABLE_BUILT_IN_HEADS: readonly string[] = [SELF_MANAGEMENT, RECHARGE, FOOD];
/** §2.10/§4.5 system built-ins — accounting-owned, never planned as ordinary
 * tasks; shown in config (with a note) but hidden from the drawer's planning
 * pickers. Off-Periods is booked by the §4.5 off-period mechanism, not planned. */
export const SYSTEM_BUILT_IN_HEADS: readonly string[] = [WASTED_TIME, LOST_HOURS, OFF_PERIOD];
/** All undeletable built-ins (plannable + system). */
export const BUILT_IN_HEADS: readonly string[] = [...PLANNABLE_BUILT_IN_HEADS, ...SYSTEM_BUILT_IN_HEADS];

/** One-line note shown in the config for the non-plannable system heads only
 * (plannable built-ins carry no note — §2.10). */
export const BUILT_IN_HEAD_NOTES: Record<string, string> = {
  [WASTED_TIME]: "system head — logged, never planned",
  [LOST_HOURS]: "system head — auto-booked at day close",
  [OFF_PERIOD]: "system head — booked by off-periods, never planned",
};

/** Built-in sub-heads seeded under their head (the §2.9 presets live here). */
const BUILT_IN_SUBHEADS: Record<string, string[]> = {
  [RECHARGE]: ["Sleep", "Nap"],
  [FOOD]: ["Food"],
};

/** Is (head, activity) a built-in preset sub-head? Undeletable, like its head. */
export function isBuiltInActivity(head: string, activity: string): boolean {
  return (BUILT_IN_SUBHEADS[head] ?? []).includes(activity);
}

/** §11.1 Category defaults per built-in head. Identity is the PATH — the same
 * activity name may live under two Categories with different meaning; the map
 * is per HEAD (budgets attach at head level, §11.6). Unknown user heads default
 * to Core Work (the user's tree keeps most heads there; settable in config). */
const DEFAULT_HEAD_CATEGORIES: Record<string, string> = {
  "Main Work": CORE_WORK,
  [SELF_MANAGEMENT]: CORE_WORK,
  [RECHARGE]: MAINTENANCE,
  [FOOD]: MAINTENANCE,
  [WASTED_TIME]: TIME_WASTED,
  [LOST_HOURS]: TIME_WASTED,
  [OFF_PERIOD]: MAINTENANCE,
};

const DEFAULT_REGISTRY: HeadsRegistry = {
  "Main Work": [],
  [SELF_MANAGEMENT]: [],
  [RECHARGE]: [...(BUILT_IN_SUBHEADS[RECHARGE] ?? [])],
  [FOOD]: [...(BUILT_IN_SUBHEADS[FOOD] ?? [])],
  [WASTED_TIME]: [],
  [LOST_HOURS]: [],
  [OFF_PERIOD]: [],
};

/** Merge a persisted registry over the defaults so every built-in head — and
 * its seeded built-in sub-heads — is always present, without dropping the
 * user's own additions (unions sub-head lists for built-in heads). */
function mergeRegistry(stored: HeadsRegistry): HeadsRegistry {
  const merged: HeadsRegistry = { ...DEFAULT_REGISTRY, ...stored };
  for (const head of BUILT_IN_HEADS) {
    const seeded = BUILT_IN_SUBHEADS[head] ?? [];
    const existing = stored[head] ?? [];
    merged[head] = [...seeded, ...existing.filter((a) => !seeded.includes(a))];
  }
  return merged;
}

interface HeadsApi {
  registry: HeadsRegistry;
  /** All heads (built-ins first), for the config screen. */
  heads: string[];
  /** Only the heads a user may PLAN under — excludes the system built-ins
   * (Wasted Time / Lost Hours). This is what the drawer's pickers read. */
  plannableHeads: string[];
  /** Sub-heads under plannable heads only — the drawer's sub-head options. */
  plannableActivities: string[];
  /** activity name -> its head name, or undefined if unknown. */
  headFor: (activity: string) => string | undefined;
  addHead: (head: string) => void;
  /** Adds the activity under `head`, creating the head if new. */
  addActivity: (head: string, activity: string) => void;
  /** Removes the activity from its head. Existing tasks keep their activityId
   * string — the registry only stops listing/deriving it. Also forgets the
   * activity's ML title→sub-head pairings + name vector (§7.0.1). */
  deleteActivity: (head: string, activity: string) => void;
  /** Removes a head and all its sub-heads from the registry. No-op for
   * BUILT_IN_HEADS. Existing tasks keep their headId/activityId untouched.
   * Forgets every removed sub-head's ML pairings (§7.0.1). */
  deleteHead: (head: string) => void;
  /** §11.1: the head's Category (Core Work default for unknowns). */
  categoryFor: (head: string) => string;
  /** §11.1: assign a head to a Category (persisted). */
  setHeadCategory: (head: string, category: string) => void;
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

  // §11.1: head → Category (persisted separately; merged over defaults).
  const [headCategories, setHeadCategories] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("headCategories");
      if (stored) return { ...DEFAULT_HEAD_CATEGORIES, ...(JSON.parse(stored) as Record<string, string>) };
    } catch {
      // fall through to defaults
    }
    return DEFAULT_HEAD_CATEGORIES;
  });

  useEffect(() => {
    localStorage.setItem("headCategories", JSON.stringify(headCategories));
  }, [headCategories]);

  const categoryFor = (head: string): string => headCategories[head] ?? CORE_WORK;
  const setHeadCategory = (head: string, category: string): void => {
    setHeadCategories((m) => ({ ...m, [head]: category }));
  };

  const addHead = (head: string): void => {
    const h = head.trim();
    if (!h) return;
    setRegistry((r) => (r[h] ? r : { ...r, [h]: [] }));
  };

  const addActivity = (head: string, activity: string): void => {
    const h = head.trim();
    const a = activity.trim();
    if (!h || !a) return;
    setRegistry((r) => {
      const existing = r[h] ?? [];
      if (existing.includes(a)) return r;
      return { ...r, [h]: [...existing, a] };
    });
  };

  const deleteActivity = (head: string, activity: string): void => {
    if (isBuiltInActivity(head, activity)) return; // built-in preset sub-heads are undeletable
    setRegistry((r) => {
      const existing = r[head];
      if (!existing || !existing.includes(activity)) return r;
      return { ...r, [head]: existing.filter((a) => a !== activity) };
    });
    // Deletion means "forget these title→sub-head pairings" (§7.0.1): drop the
    // ML corpus entries + name vector so a same-name re-create starts clean.
    forgetActivity(activity);
  };

  const deleteHead = (head: string): void => {
    if (BUILT_IN_HEADS.includes(head)) return;
    const subs = registry[head] ?? []; // capture before removal, to forget each
    setRegistry((r) => {
      if (!(head in r)) return r;
      const { [head]: _removed, ...rest } = r;
      return rest;
    });
    subs.forEach(forgetActivity);
  };

  const headFor = (activity: string): string | undefined => {
    const a = activity.trim();
    if (!a) return undefined;
    return Object.entries(registry).find(([, acts]) => acts.includes(a))?.[0];
  };

  const heads = Object.keys(registry);
  const plannableHeads = heads.filter((h) => !SYSTEM_BUILT_IN_HEADS.includes(h));
  const plannableActivities = plannableHeads.flatMap((h) => registry[h] ?? []);

  return (
    <HeadsContext.Provider value={{ registry, heads, plannableHeads, plannableActivities, headFor, addHead, addActivity, deleteActivity, deleteHead, categoryFor, setHeadCategory }}>
      {children}
    </HeadsContext.Provider>
  );
}

export function useHeads(): HeadsApi {
  const ctx = useContext(HeadsContext);
  if (!ctx) throw new Error("useHeads must be used within HeadsProvider");
  return ctx;
}
