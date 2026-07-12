/**
 * Validity matrix + physics-of-time snapping (§2.5, E3).
 * Flags are stored & editable (maximal editability), guarded here on every write:
 * contradictions are SNAPPED to the nearest legal value, never persisted.
 */

import type { Dur, Min, TimingType, UnstartedTask } from "./types.js";

export interface ValidationNote {
  field: string;
  message: string;
}

/** Derive the canonical flags for a type (the matrix, §2.5). */
export function canonicalFlags(timing: TimingType, ommf: boolean): {
  slideable: boolean;
  breakable: boolean;
} {
  const slideable = timing !== "fixed";
  const breakable = timing === "budgeted" && !ommf;
  return { slideable, breakable };
}

/**
 * Snap a task to legality. Returns the corrected task plus notes describing
 * every snap performed (surfaced to the user; the app never silently lies —
 * and never says "no": it corrects and tells, E3/G4).
 */
export function snapTask(
  t: UnstartedTask,
  minFragment: Dur,
  now: Min,
): { task: UnstartedTask; notes: ValidationNote[] } {
  const notes: ValidationNote[] = [];
  const task: UnstartedTask = { ...t };

  // --- timing-type coherence: which coordinates may exist -------------------
  if (task.timing === "budgeted" || task.timing === "unscheduled") {
    if (task.anchorStart !== undefined) {
      delete task.anchorStart;
      notes.push({ field: "anchorStart", message: "type carries no start anchor; cleared" });
    }
    if (task.anchorEnd !== undefined) {
      delete task.anchorEnd;
      notes.push({ field: "anchorEnd", message: "type carries no end anchor; cleared" });
    }
  }
  if (task.timing === "semi-head" && task.anchorEnd !== undefined) {
    delete task.anchorEnd;
    notes.push({ field: "anchorEnd", message: "head-anchored tail floats; end cleared" });
  }
  if (task.timing === "semi-tail" && task.anchorStart !== undefined) {
    delete task.anchorStart;
    notes.push({ field: "anchorStart", message: "tail-anchored head floats; start cleared" });
  }
  if (task.timing === "unscheduled" && task.budget !== undefined) {
    delete task.budget;
    notes.push({ field: "budget", message: "unscheduled carries no budget; cleared" });
  }
  // A semi-scheduled task missing its anchor demotes to the anchor-less type.
  if (task.timing === "semi-head" && task.anchorStart === undefined) {
    task.timing = task.budget !== undefined ? "budgeted" : "unscheduled";
    notes.push({ field: "timing", message: "head anchor missing; type demoted" });
  }
  if (task.timing === "semi-tail" && task.anchorEnd === undefined) {
    task.timing = task.budget !== undefined ? "budgeted" : "unscheduled";
    notes.push({ field: "timing", message: "tail anchor missing; type demoted" });
  }

  // --- fixed: the {start,end,budget} triple must cohere ---------------------
  if (task.timing === "fixed") {
    if (task.anchorStart === undefined || task.anchorEnd === undefined) {
      throw new Error("fixed task requires anchorStart and anchorEnd");
    }
    if (task.anchorEnd <= task.anchorStart) {
      task.anchorEnd = task.anchorStart + Math.max(minFragment, 1);
      notes.push({ field: "anchorEnd", message: "end ≤ start; snapped forward" });
    }
    const span = task.anchorEnd - task.anchorStart;
    if (task.budget !== span) {
      task.budget = span;
      if (t.budget !== undefined && t.budget !== span)
        notes.push({ field: "budget", message: "budget = end − start; recomputed" });
    }
  }

  // --- MIN_FRAGMENT floor (7.1: no budget below the floor, ever) ------------
  if (task.budget !== undefined && task.budget < minFragment) {
    task.budget = minFragment;
    notes.push({ field: "budget", message: `budget below MIN_FRAGMENT; snapped to ${minFragment}m` });
    if (task.timing === "fixed" && task.anchorStart !== undefined) {
      task.anchorEnd = task.anchorStart + minFragment;
    }
  }

  // --- flags: snap only CONFIRMED-INVALID combinations (§2.5 matrix) --------
  // Maximal editability: a semi/unscheduled task's slideability and a budgeted
  // task's unbreakability are legitimate user choices (e.g. an unslideable
  // semi-tail pins at its floor instead of sliding, §3.9.1) — never derived
  // away. Only the matrix's four contradictions are snapped.
  if (task.timing === "fixed" && task.slideable) {
    task.slideable = false;
    notes.push({ field: "slideable", message: "fixed is never slideable; snapped" });
  }
  if (task.timing === "budgeted" && !task.slideable) {
    task.slideable = true;
    notes.push({ field: "slideable", message: "budgeted always slides; snapped" });
  }
  if (task.timing !== "budgeted" && task.breakable) {
    task.breakable = false;
    notes.push({ field: "breakable", message: "only budgeted is breakable; snapped" });
  }
  if (task.ommf && task.breakable) {
    task.breakable = false;
    notes.push({ field: "breakable", message: "ommf is never breakable; snapped" });
  }

  // --- future-only anchors for proposals (G5) -------------------------------
  if (task.anchorStart !== undefined && task.anchorStart < now) {
    // Late fixed/semi-head tasks are legal (amputation at birth, G18) — no snap.
    // Placement handles it; nothing to do here.
  }

  return { task, notes };
}
