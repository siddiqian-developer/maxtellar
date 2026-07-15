/**
 * Invariant asserts (§7.1 step 6) — run after every event in tests/dev and by
 * the property suite. A violation is a scheduler bug, never user error.
 */

import type { Dur, Part, State, UnstartedTask } from "./types.js";
import { cursorOf } from "./reducer.js";

export interface Violation {
  rule: string;
  detail: string;
}

/** §2.7 (G24): a decomposed task's committed size is Σ of its children. */
function childBudget(t: UnstartedTask): Dur {
  if (t.budget !== undefined) return t.budget;
  if (t.timing === "fixed" && t.anchorStart !== undefined && t.anchorEnd !== undefined)
    return t.anchorEnd - t.anchorStart;
  return 0;
}

export function checkInvariants(s: State): Violation[] {
  const v: Violation[] = [];
  const cursor = cursorOf(s);

  // §2.7 (G24): a task named by another's parentId is a PARENT — a derived
  // bracket that overlaps its own leaves by design and holds no budget of its
  // own. Excluded from the spine physics below; checked instead by the
  // zero-sum rule at the end.
  const parentIds = new Set<string>();
  for (const i of s.plan) if (i.kind === "task" && i.parentId) parentIds.add(i.parentId);
  // A running leaf's ancestors stay brackets even without a plan child (§2.7).
  let rpid = s.running?.parentId;
  while (rpid) {
    parentIds.add(rpid);
    rpid = (s.plan.find((i) => i.id === rpid) as UnstartedTask | undefined)?.parentId;
  }

  // 1. Occupancy history: non-overlapping, end ≤ now, start ≤ end.
  const occ = s.history
    .filter((h) => h.kind === "occupancy")
    .slice()
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < occ.length; i++) {
    const h = occ[i]!;
    if (h.end > s.now) v.push({ rule: "history-le-now", detail: `${h.id} ends ${h.end} > now ${s.now}` });
    if (h.start > h.end) v.push({ rule: "history-order", detail: `${h.id} start > end` });
    if (i > 0 && occ[i - 1]!.end > h.start)
      v.push({ rule: "no-overlap-history", detail: `${occ[i - 1]!.id} overlaps ${h.id}` });
  }

  // 2. Placements: parts in the future (≥ cursor for flexibles; walls may abut),
  //    globally non-overlapping, and no task part below MIN_FRAGMENT.
  const allParts: (Part & { id: string })[] = [];
  for (const p of s.placements) {
    const item = s.plan.find((i) => i.id === p.itemId);
    if (item?.kind === "task" && parentIds.has(item.id)) continue; // parent bracket: derived span
    for (const part of p.parts) {
      if (part.end <= part.start)
        v.push({ rule: "part-order", detail: `${p.itemId} part ${part.start}-${part.end}` });
      if (part.start < s.now)
        v.push({ rule: "future-only", detail: `${p.itemId} part starts ${part.start} < now ${s.now}` });
      // MIN_FRAGMENT applies to CREATED fragments (split products of flexible
      // tasks) — not to an anchored wall's amputating remainder, which is
      // reality consuming the task, not the scheduler fragmenting it (§3.7/R4).
      const isAnchored =
        item?.kind === "task" &&
        (item.timing === "fixed" || item.timing === "semi-head" || item.timing === "semi-tail");
      if (item?.kind === "task" && !isAnchored && part.end - part.start < s.minFragment)
        v.push({
          rule: "min-fragment",
          detail: `${p.itemId} part ${part.end - part.start}m < ${s.minFragment}m`,
        });
      allParts.push({ ...part, id: p.itemId });
    }

    // 3. Budget conservation: parts + squeezed + overflow = budget (when known).
    if (item?.kind === "task" && item.budget !== undefined && item.timing !== "unscheduled") {
      const placed = p.parts.reduce((acc, x) => acc + (x.end - x.start), 0);
      const total = placed + p.squeezedDeficit + p.overflowDeficit;
      if (total !== item.budget)
        v.push({
          rule: "budget-conservation",
          detail: `${p.itemId}: placed ${placed} + squeezed ${p.squeezedDeficit} + overflow ${p.overflowDeficit} ≠ budget ${item.budget}`,
        });
    }
  }
  allParts.sort((a, b) => a.start - b.start);
  for (let i = 1; i < allParts.length; i++) {
    if (allParts[i - 1]!.end > allParts[i]!.start)
      v.push({
        rule: "no-overlap-plan",
        detail: `${allParts[i - 1]!.id} overlaps ${allParts[i]!.id} at ${allParts[i]!.start}`,
      });
  }

  // 3b. §2.7 (G24) zero-sum budget: at decomposition a parent's budget is set
  //     to the sum of its children's committed sizes. As leaves run/complete
  //     they leave the plan (their time migrates to history) and a paused
  //     remainder shrinks, so the *remaining* children can only sum to LESS
  //     than the parent's fixed original total. The always-true invariant is
  //     therefore `parent.budget ≥ Σ remaining children` — a parent that is
  //     smaller than its own live parts is the real corruption this guards.
  for (const item of s.plan) {
    if (item.kind !== "task" || !parentIds.has(item.id)) continue;
    const kids = s.plan.filter(
      (i): i is UnstartedTask => i.kind === "task" && i.parentId === item.id,
    );
    const sum = kids.reduce((acc, c) => acc + childBudget(c), 0);
    if ((item.budget ?? 0) < sum)
      v.push({
        rule: "zero-sum-budget",
        detail: `parent ${item.id} budget ${item.budget} < Σ children ${sum}`,
      });
  }

  // 3c. §4.2 zero-sum day records: a sealed DayRecord tiles fully — within
  //     [start,end) the occupancy history (real work + the SOD-booked Lost
  //     Hours) sums to exactly the span, so wall = accounted + lost is explicit
  //     history, not a live subtraction. A residual gap means SOD failed to book
  //     Lost Hours; an excess means occupancy overran the sweep boundary.
  for (const rec of s.days) {
    const sum = s.history
      .filter((h) => h.kind === "occupancy")
      .reduce((acc, h) => acc + Math.max(0, Math.min(h.end, rec.end) - Math.max(h.start, rec.start)), 0);
    if (sum !== rec.end - rec.start)
      v.push({
        rule: "day-record-zero-sum",
        detail: `record ${rec.id}: occupancy ${sum} ≠ span ${rec.end - rec.start}`,
      });
  }

  // 4. Running occupies [startedAt, now]; no placed part may invade it.
  if (s.running) {
    for (const part of allParts) {
      if (part.start < cursor && s.running.budget !== undefined)
        v.push({
          rule: "runner-occupancy",
          detail: `${part.id} starts ${part.start} before runner's projected end ${cursor}`,
        });
    }
  }

  return v;
}

/** Forward-only lemma checker for tests: between consecutive states, no placed
 *  part of a surviving item may move EARLIER (§7.1). */
export function checkForwardOnly(before: State, after: State): Violation[] {
  const v: Violation[] = [];
  for (const pb of before.placements) {
    const pa = after.placements.find((p) => p.itemId === pb.itemId);
    if (!pa || pb.parts.length === 0 || pa.parts.length === 0) continue;
    const firstBefore = pb.parts[0]!.start;
    const firstAfter = pa.parts[0]!.start;
    if (firstAfter < firstBefore)
      v.push({
        rule: "forward-only",
        detail: `${pb.itemId} moved earlier: ${firstBefore} → ${firstAfter}`,
      });
  }
  return v;
}
