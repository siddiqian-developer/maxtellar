/**
 * THE SETTLE-PASS (§3.13) — one pure layout function serving tick, injection,
 * and edit-commit alike. Deterministic, forward-only, terminating.
 *
 * The G10 tick choreography (squeeze → wrap → 1-min transfer → vanish → reunify)
 * is EMERGENT: settle is re-run each tick with a cursor that advances 1 min, and
 * the placement it computes reproduces the worked example exactly (see tests).
 *
 * Termination guarantees implemented here (§7.1):
 *  - forward-only: the fill pointer only moves later; nothing is ever placed
 *    before `cursor`.
 *  - check-before-split: slots narrower than MIN_FRAGMENT are invisible; no
 *    sub-MIN_FRAGMENT part is ever created (R2).
 *  - floor behavior: a compressed tail-anchored item below the floor amputates
 *    in place via overflowDeficit (R4).
 */

import type { Dur, Min, Part, Placement, PlanItem, UnstartedTask } from "./types.js";

interface Wall {
  itemId: string;
  start: Min;
  end: Min;
  /** semi-tail walls may compress: start may move later, down to end − minFragment. */
  compressibleTo?: Min;
}

interface SettleInput {
  plan: PlanItem[]; // rank-sorted
  cursor: Min; // first schedulable instant (now, or running task's projected end)
  minFragment: Dur;
}

const isTask = (i: PlanItem): i is UnstartedTask => i.kind === "task";

/** A task acts as a WALL when it has an anchored coordinate it cannot leave. */
function wallOf(t: UnstartedTask, minFragment: Dur): Wall | null {
  switch (t.timing) {
    case "fixed":
      return { itemId: t.id, start: t.anchorStart!, end: t.anchorEnd! };
    case "semi-head": {
      // Start anchored; tail floats. Scheduler reserves only the minimum extent
      // (presumed extent is display-only, §3.9). Budgeted semi-head reserves budget.
      const extent = t.budget ?? minFragment;
      return { itemId: t.id, start: t.anchorStart!, end: t.anchorStart! + extent };
    }
    case "semi-tail": {
      const budget = t.budget ?? minFragment;
      return {
        itemId: t.id,
        start: t.anchorEnd! - budget,
        end: t.anchorEnd!,
        compressibleTo: t.anchorEnd! - minFragment,
      };
    }
    default:
      return null;
  }
}

export function settle({ plan, cursor, minFragment }: SettleInput): Placement[] {
  const placements = new Map<string, Placement>();
  const squeezeTol = minFragment - 1;

  // ---- 1. Pin anchors (walls), clipped to the cursor ------------------------
  const walls: Wall[] = [];
  for (const item of plan) {
    if (!isTask(item)) continue;
    const w = wallOf(item, minFragment);
    if (!w) continue;

    // Cursor pressure clips a wall's head (amputation/compression — the reducer
    // records the skipped time; settle shows the surviving remainder). The
    // arithmetic is uniform: overflow = extent − placed (conservation-exact).
    const extent = w.end - w.start;
    const start = cursor > w.start ? Math.min(cursor, w.end) : w.start;
    const overflow = extent - (w.end - start);

    const parts: Part[] = start < w.end ? [{ start, end: w.end }] : [];
    placements.set(w.itemId, {
      itemId: w.itemId,
      parts,
      squeezedDeficit: 0,
      overflowDeficit: overflow,
    });
    if (start < w.end) walls.push({ ...w, start });
  }
  walls.sort((a, b) => a.start - b.start || a.end - b.end);

  // ---- 2. Fill flexible items by rank into inter-wall space -----------------
  // Free space is traversed with a monotone pointer; walls are skipped over.
  let ptr = cursor;
  let wallIdx = 0;

  /** Advance ptr past any wall that has begun at/before ptr. */
  const skipWalls = (): void => {
    for (;;) {
      // find the next wall overlapping or before ptr
      while (wallIdx < walls.length && walls[wallIdx]!.end <= ptr) wallIdx++;
      const w = walls[wallIdx];
      if (w && w.start <= ptr) {
        ptr = w.end;
        wallIdx++;
        continue;
      }
      return;
    }
  };

  /** Space available from ptr to the next wall (Infinity if none). */
  const slotWidth = (): Dur => {
    skipWalls();
    const w = walls[wallIdx];
    return w ? w.start - ptr : Number.POSITIVE_INFINITY;
  };

  for (const item of plan) {
    if (isTask(item) && wallOf(item, minFragment)) continue; // walls already placed

    if (item.kind === "gap") {
      // Inert spacer: consumes free space up to its budget; shrinks under walls;
      // never jumps a wall (immovable), so it takes what the current slot offers.
      skipWalls();
      const width = Math.min(item.budget, slotWidth());
      const parts: Part[] = width > 0 ? [{ start: ptr, end: ptr + width }] : [];
      ptr += width;
      placements.set(item.id, {
        itemId: item.id,
        parts,
        squeezedDeficit: item.budget - width, // shrunken portion (vanishes at 0 total)
        overflowDeficit: 0,
      });
      continue;
    }

    const t = item as UnstartedTask;
    const budget = t.budget ?? minFragment; // unscheduled reserves min extent (§3.9)
    const parts: Part[] = [];
    let deficit = budget;
    let squeezed = 0;

    if (t.breakable) {
      // WRAP-AROUND (breakable = budgeted, non-ommf):
      // squeeze up to tolerance against the first obstacle, else split across slots.
      let firstSlot = true;
      while (deficit > 0) {
        skipWalls();
        const width = slotWidth();
        if (width >= deficit) {
          parts.push({ start: ptr, end: ptr + deficit });
          ptr += deficit;
          deficit = 0;
          break;
        }
        if (firstSlot && deficit - width <= squeezeTol && width >= minFragment) {
          // SQUEEZE: within tolerance — compress into the slot, no split (G10).
          parts.push({ start: ptr, end: ptr + width });
          ptr += width;
          squeezed = deficit - width;
          deficit = 0;
          break;
        }
        // WRAP: place a part here, continue after the wall. Check-before-split
        // protects BOTH sides (R2): the placed chunk must be ≥ MIN_FRAGMENT and
        // the remaining tail must stay ≥ MIN_FRAGMENT (or be zero) — otherwise
        // shrink the chunk, or skip the slot entirely.
        let take = Math.min(width, deficit);
        if (take < deficit && deficit - take < minFragment) take = deficit - minFragment;
        if (take >= minFragment) {
          parts.push({ start: ptr, end: ptr + take });
          deficit -= take;
        }
        // jump past the wall
        const w = walls[wallIdx]!;
        ptr = w.end;
        wallIdx++;
        firstSlot = false;
      }
    } else {
      // FROGLEAP (unbreakable): whole body into the first slot that fits.
      for (;;) {
        skipWalls();
        const width = slotWidth();
        if (width >= deficit) {
          parts.push({ start: ptr, end: ptr + deficit });
          ptr += deficit;
          deficit = 0;
          break;
        }
        const w = walls[wallIdx];
        if (!w) {
          // no wall ahead yet slot too small — cannot happen (infinite tail)
          break;
        }
        ptr = w.end;
        wallIdx++;
      }
    }

    placements.set(t.id, {
      itemId: t.id,
      parts,
      squeezedDeficit: squeezed,
      overflowDeficit: deficit,
    });
  }

  // Return in plan order for stable downstream consumption.
  return plan.map((i) => placements.get(i.id)!).filter(Boolean);
}
