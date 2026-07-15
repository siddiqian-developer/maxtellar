/**
 * Heads & Activities registry (SPEC §2.1: Head = flat category, quotas attach
 * here; Activity = reusable identity under exactly ONE head). "Flat heads"
 * (§8 MVP boundary) means this two-level shape — not that activities aren't
 * grouped under a head. Persisted locally (no backend in MVP, §7.2); managed
 * via the full-screen Heads & Sub-heads configuration screen.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { SELF_MANAGEMENT } from "@maxtellar/core";
import { forgetActivity } from "./ml/vectorStore";

/** head name -> its activity (sub-head) names. */
export type HeadsRegistry = Record<string, string[]>;

const DEFAULT_REGISTRY: HeadsRegistry = {
  "Main Work": [],
  [SELF_MANAGEMENT]: [],
};

/** Spec §2.10: Self-Management is the one true built-in among the heads this
 * registry manages (Wasted Time / Lost Hours are never-plannable and never
 * enter this registry at all) — undeletable. "Main Work" is only a
 * convenience default seed, not a spec-protected built-in, so it CAN be
 * deleted. */
export const BUILT_IN_HEADS: readonly string[] = [SELF_MANAGEMENT];

interface HeadsApi {
  registry: HeadsRegistry;
  heads: string[];
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
}

const HeadsContext = createContext<HeadsApi | null>(null);

export function HeadsProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [registry, setRegistry] = useState<HeadsRegistry>(() => {
    try {
      const stored = localStorage.getItem("headsRegistry");
      if (stored) return { ...DEFAULT_REGISTRY, ...JSON.parse(stored) };
    } catch {
      // fall through to defaults
    }
    return DEFAULT_REGISTRY;
  });

  useEffect(() => {
    localStorage.setItem("headsRegistry", JSON.stringify(registry));
  }, [registry]);

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

  return (
    <HeadsContext.Provider value={{ registry, heads: Object.keys(registry), headFor, addHead, addActivity, deleteActivity, deleteHead }}>
      {children}
    </HeadsContext.Provider>
  );
}

export function useHeads(): HeadsApi {
  const ctx = useContext(HeadsContext);
  if (!ctx) throw new Error("useHeads must be used within HeadsProvider");
  return ctx;
}
