/**
 * Proposal placement (G4/G5): an anchored proposal (fixed / semi-scheduled)
 * is a REQUEST — on commit the scheduler finds the nearest legal coordinates.
 * Direction preserves the order implied by the requested time vs the obstacle:
 * requested-after → push forward; requested-before → push backward (never
 * across `now`; if backward can't fit, fall forward).
 *
 * A proposal whose time is already past `now` is NOT moved — that's legal
 * (amputation at birth, G18). Only wall-vs-wall overlaps are resolved here;
 * flexible items re-settle around walls anyway.
 */

import type { Dur, Min, PlanItem, UnstartedTask } from "./types.js";

interface Interval {
  start: Min;
  end: Min;
}

export function wallInterval(t: UnstartedTask, minFragment: Dur): Interval | null {
  switch (t.timing) {
    case "fixed":
      return { start: t.anchorStart!, end: t.anchorEnd! };
    case "semi-head":
      return { start: t.anchorStart!, end: t.anchorStart! + (t.budget ?? minFragment) };
    case "semi-tail":
      return { start: t.anchorEnd! - (t.budget ?? minFragment), end: t.anchorEnd! };
    default:
      return null;
  }
}

const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

/** Move an anchored task to the nearest legal coordinates given existing walls. */
export function placeAnchored(
  task: UnstartedTask,
  otherWalls: Interval[],
  now: Min,
  minFragment: Dur,
): UnstartedTask {
  let iv = wallInterval(task, minFragment);
  if (!iv) return task;
  const span = iv.end - iv.start;
  const walls = otherWalls.slice().sort((a, b) => a.start - b.start);

  let guard = 0;
  for (;;) {
    if (++guard > walls.length + 2) break; // circuit breaker — cannot loop (§7.1)
    const hit = walls.find((w) => overlaps(iv!, w));
    if (!hit) break;

    if (iv.start >= hit.start) {
      // requested-after → forward: land right after the obstacle
      iv = { start: hit.end, end: hit.end + span };
    } else {
      // requested-before → backward: land right before the obstacle…
      const candidate = { start: hit.start - span, end: hit.start };
      // …but never across now; if it doesn't fit, fall forward.
      if (candidate.start >= now && !walls.some((w) => overlaps(candidate, w))) {
        iv = candidate;
      } else {
        iv = { start: hit.end, end: hit.end + span };
      }
    }
  }

  const moved: UnstartedTask = { ...task };
  switch (task.timing) {
    case "fixed":
      moved.anchorStart = iv.start;
      moved.anchorEnd = iv.end;
      break;
    case "semi-head":
      moved.anchorStart = iv.start;
      break;
    case "semi-tail":
      moved.anchorEnd = iv.end;
      break;
  }
  return moved;
}

/** Resolve every anchored task in a batch, in rank order (earlier ranks win). */
export function placeBatch(plan: PlanItem[], now: Min, minFragment: Dur): PlanItem[] {
  const walls: Interval[] = [];
  return plan.map((item) => {
    if (item.kind !== "task") return item;
    const iv = wallInterval(item, minFragment);
    if (!iv) return item;
    const placed = placeAnchored(item, walls, now, minFragment);
    walls.push(wallInterval(placed, minFragment)!);
    return placed;
  });
}
