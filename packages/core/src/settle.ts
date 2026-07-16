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

/** §7.1 global safety net: the settle-pass proves termination by construction
 * (forward-only, check-before-split, monotone wall pointer). This is the circuit
 * breaker that guarantees a bug can never SILENTLY loop forever — if the
 * structural-op count ever exceeds a generous ceiling, settle throws instead of
 * spinning. A throw discards the batch upstream (the fork/EDIT_COMMIT backstop),
 * so live state is never corrupted; the event log stays replayable for a report. */
export class CircuitBreakerError extends Error {
  constructor(public readonly ops: number) {
    super(`settle circuit breaker tripped after ${ops} structural ops (§7.1)`);
    this.name = "CircuitBreakerError";
  }
}

interface Wall {
  itemId: string;
  start: Min;
  end: Min;
  /** OPEN semi-tail walls may compress under a firm contester (§3.9.1, G27):
   * start may move later, down to end − semiTailFloor. Unset = incompressible. */
  compressibleTo?: Min;
  /** §3.9.1: at the floor, a slideable open semi-tail SLIDES later as a whole
   * (anchored end yields) instead of pinning as an obstacle. */
  slideable?: boolean;
  /** budget-less anchored wall (presumed extent) — tail/head clamps to a
   * neighbouring wall so the presumption never overlaps a real commitment. */
  soft?: boolean;
}

interface SettleInput {
  plan: PlanItem[]; // rank-sorted
  cursor: Min; // first schedulable instant (now, or running task's projected end)
  minFragment: Dur;
  /** §3.9: budget-less (open) tasks reserve their presumed extent up to this
   * cap. Optional for back-compat; defaults to 10h. */
  openExtentCap?: Dur;
  /** §3.9.1 (G27): the floor an open semi-tail's claim can be compressed to by
   * a firm contester. Optional for back-compat; defaults to 1h. */
  semiTailFloor?: Dur;
  /** §2.7 (G24): extra ids to treat as parent brackets even without a child in
   * `plan` — the ancestors of a currently-running leaf. Keeps a decomposed
   * task a bracket (never re-placed as a schedulable task) while its sole leaf
   * runs; the bracket simply shows no span until a leaf returns to the plan. */
  bracketIds?: Set<string>;
}

const isTask = (i: PlanItem): i is UnstartedTask => i.kind === "task";

/** True for a budget-less "open" task — reserves a presumed extent (capped),
 * not a committed duration (§3.9). */
const isOpen = (t: UnstartedTask): boolean => t.budget === undefined;

/** A task acts as a WALL when it has an anchored coordinate it cannot leave.
 * `soft` walls are budget-less anchored tasks whose (presumed) tail may be
 * clamped by a following wall so it never overlaps a real commitment.
 * `cap` is the OPEN presumed-extent this task is entitled to — the fair-share
 * value from §3.9 (10h uncontested / 2h yielding / an even split among peers),
 * precomputed per-task; it defaults to `openCap` when this task is not part of a
 * fair-share group (e.g. a lone open semi-tail contested by a firm task, which
 * keeps its full balloon and is handled by G27 compression, §3.9.1). */
function wallOf(
  t: UnstartedTask,
  minFragment: Dur,
  openCap: Dur,
  tailFloor: Dur,
  cap: Dur = openCap,
): Wall | null {
  switch (t.timing) {
    case "fixed":
      return { itemId: t.id, start: t.anchorStart!, end: t.anchorEnd! };
    case "semi-head": {
      // Start anchored; tail floats. Budget-less → reserve the FAIR-SHARE
      // presumed extent (§3.9 — 10h alone, 2h with a firm task below, its split
      // share among open peers; clamped later to the next wall); budgeted → its
      // budget. (Was the flat `openCap` soft-wall clamp — completed 2026-07-16.)
      const extent = t.budget ?? cap;
      return {
        itemId: t.id,
        start: t.anchorStart!,
        end: t.anchorStart! + extent,
        slideable: t.slideable,
        soft: isOpen(t),
      };
    }
    case "semi-tail": {
      // Budget-less → the fair-share presumed extent when this tail is a PEER in
      // a fair-share group (an open subject splits the free space with it, §3.9);
      // otherwise its full balloon (`cap` defaults to openCap), which a firm
      // contester then compresses via G27 (§3.9.1). Budgeted → its budget.
      const budget = t.budget ?? cap;
      // §3.9.1 (G27): only an OPEN semi-tail's ballooned claim is compressible
      // (down to the floor) — a budgeted semi-tail's budget is a definite need
      // and is never compressed by a contester.
      return {
        itemId: t.id,
        start: t.anchorEnd! - budget,
        end: t.anchorEnd!,
        slideable: t.slideable,
        ...(isOpen(t)
          ? { compressibleTo: t.anchorEnd! - Math.max(minFragment, tailFloor) }
          : {}),
        soft: isOpen(t),
      };
    }
    default:
      return null;
  }
}

/** §3.9 crowded cap: when a FIRM task sits immediately below an open task,
 * the open task yields — it grabs only this modest slice, not the full
 * `openExtentCap`. (2h; the "10h vs 2h" pair are the uncontested vs yielding
 * fallbacks — the real rule is fair-share of contested free space.) */
const CROWDED_CAP: Dur = 120;

/** A FIRM neighbour has a definite space claim → an open task above it yields.
 * (fixed/budgeted, and semi-head which pins a start and occupies downward.) */
const isFirm = (t: UnstartedTask): boolean =>
  t.timing === "fixed" || t.timing === "budgeted" || t.timing === "semi-head";

/** §3.9 forward-filler: an OPEN task that fills the free space FORWARD from its
 * anchor/cursor — an unscheduled task, or a budget-less semi-head (start pinned,
 * tail grows forward). These are the subjects the fair-share cap sizes. */
const isForwardFiller = (t: UnstartedTask): boolean =>
  t.timing === "unscheduled" || (t.timing === "semi-head" && isOpen(t));

/** §3.9 open peer: any budget-less/indefinite claim — a forward-filler OR an
 * open semi-tail (anchored end, floating start). Open peers SPLIT contested free
 * space evenly; a semi-tail joins the split only as a peer BELOW a forward-filler
 * (a lone open semi-tail contested by a firm task is G27 compression, not a
 * fair-share yield — so a fair-share group always STARTS with a forward-filler). */
const isOpenPeer = (t: UnstartedTask): boolean =>
  isForwardFiller(t) || (t.timing === "semi-tail" && isOpen(t));

export function settle({
  plan,
  cursor,
  minFragment,
  openExtentCap = 600,
  semiTailFloor = 60,
  bracketIds,
}: SettleInput): Placement[] {
  const placements = new Map<string, Placement>();
  const squeezeTol = minFragment - 1;

  // §7.1 circuit breaker: every structural-op loop iteration below charges one
  // op against a generous ceiling. Legal input is bounded by O(plan²) (each item
  // is placed in one monotone left-to-right pass over the walls), so this never
  // trips in practice — it only fires if an invariant break makes a loop spin,
  // in which case we THROW (batch discarded upstream) instead of hanging.
  const opCeiling = 256 + 64 * (plan.length + 1) * (plan.length + 1);
  let ops = 0;
  const charge = (): void => {
    if (++ops > opCeiling) throw new CircuitBreakerError(ops);
  };

  // §2.7 (G24): a task named by some other task's `parentId` is a PARENT — a
  // derived bracket. It never occupies the spine: only its descendant leaves
  // are placed by the normal physics below; the parent's placement is computed
  // afterwards as the span of its leaves. Recognise parents up front so the
  // wall/fill passes skip them.
  const parentIds = new Set<string>(bracketIds ?? []);
  for (const i of plan) if (isTask(i) && i.parentId) parentIds.add(i.parentId);
  const isParent = (id: string): boolean => parentIds.has(id);

  // §3.9 fair-share sizing (2026-07-11; completed 2026-07-16): an OPEN task's
  // reserved extent depends on what sits immediately BELOW it (next in time),
  // NOT on priority. A fair-share GROUP is a maximal run of open peers that
  // STARTS with a forward-filler (unscheduled / open semi-head) and extends over
  // consecutive open peers, INCLUDING open semi-tails (an open semi-tail below a
  // forward-filler is an equal peer, not a firm 2h wall — the completed case).
  // Nothing below the group → the full `openExtentCap` (10h) split evenly; a firm
  // task below → CROWDED_CAP (2h) split evenly. `capById` sizes every member:
  // an unscheduled member's fill width, a semi-head member's forward extent, and
  // an open semi-tail PEER's balloon span (so a forward-filler above it gets room
  // instead of being crushed). A run that would START with a semi-tail is skipped
  // — that tail keeps its full balloon + G27 compression (§3.9.1), unchanged.
  const taskSeq = plan.filter(isTask).filter((t) => !isParent(t.id));
  const capById = new Map<string, Dur>();
  for (let i = 0; i < taskSeq.length; ) {
    if (!isForwardFiller(taskSeq[i]!)) { i++; continue; }
    let j = i;
    while (j < taskSeq.length && isOpenPeer(taskSeq[j]!)) j++;
    const run = j - i; // open peers in the group share one cap evenly
    const after = taskSeq[j]; // first non-open-peer below → a definite (firm) claim
    const groupCap = !after ? openExtentCap : CROWDED_CAP;
    const share = Math.max(minFragment, Math.floor(groupCap / run));
    for (let k = i; k < j; k++) capById.set(taskSeq[k]!.id, share);
    i = j;
  }

  // ---- 1. Pin anchors (walls), clipped to the cursor ------------------------
  // Collect raw walls first, sort, then CLAMP soft (budget-less) presumed
  // extents to their neighbours so a presumption never overlaps a real
  // commitment (§3.9) — only then build placements.
  const rawWalls: Wall[] = [];
  for (const item of plan) {
    if (!isTask(item) || isParent(item.id)) continue; // parents are brackets, not walls
    const w = wallOf(item, minFragment, openExtentCap, semiTailFloor, capById.get(item.id) ?? openExtentCap);
    if (w) rawWalls.push(w);
  }
  rawWalls.sort((a, b) => a.start - b.start || a.end - b.end);
  // Clamp each soft wall's presumed side to the nearest hard boundary. A
  // soft semi-head shortens its tail to the next wall's start; a soft
  // semi-tail lifts its (presumed) start to the previous wall's end. Floor
  // at minFragment so it never vanishes.
  for (let i = 0; i < rawWalls.length; i++) {
    const w = rawWalls[i]!;
    if (!w.soft) continue;
    const next = rawWalls[i + 1];
    const prev = rawWalls[i - 1];
    if (next && next.start < w.end) w.end = Math.max(w.start + minFragment, next.start);
    if (prev && prev.end > w.start) w.start = Math.min(w.end - minFragment, prev.end);
  }

  const walls: Wall[] = [];
  const runnerSlid: Wall[] = []; // G28: slideable walls displaced by runner pressure
  for (const w of rawWalls) {
    // G28: a slideable wall under ANY cursor pressure — bare now, a runner's
    // span, or overrun — SLIDES later instead of being consumed: it rides just
    // ahead of the cursor, live per tick. An open semi-tail first deflates to
    // its floor (the clip below IS that deflation, end fixed); only past the
    // floor does the whole floor-span ride. A budgeted semi-tail / semi-head
    // rides whole (definite need, never compressed). Non-slideable walls keep
    // the old clip/amputate physics (R4) — slideable is never crushed.
    if (w.slideable && cursor > (w.compressibleTo ?? w.start)) {
      const span = w.compressibleTo !== undefined ? w.end - w.compressibleTo : w.end - w.start;
      const { compressibleTo: _dropped, ...rest } = w;
      runnerSlid.push({ ...rest, start: cursor, end: cursor + span });
      continue;
    }
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
  // Land each runner-slid wall in the first free space at/after its slid
  // start, hopping over settled walls (a slid task never overlaps — no-overlap
  // is inviolable). Anchored end has yielded: overflowDeficit stays 0.
  for (const w of runnerSlid) {
    const span = w.end - w.start;
    let start = w.start;
    for (const other of walls) {
      if (other.end <= start) continue;
      if (other.start < start + span) start = other.end;
      else break;
    }
    const placed: Wall = { ...w, start, end: start + span };
    placements.set(w.itemId, {
      itemId: w.itemId,
      parts: [{ start: placed.start, end: placed.end }],
      squeezedDeficit: 0,
      overflowDeficit: 0,
    });
    walls.push(placed);
    walls.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  // ---- 2. Fill flexible items by rank into inter-wall space -----------------
  // Free space is traversed with a monotone pointer; walls are skipped over.
  let ptr = cursor;
  let wallIdx = 0;

  /** Advance ptr past any wall that has begun at/before ptr. */
  const skipWalls = (): void => {
    for (;;) {
      charge();
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

  // §3.9.1 (G27): open semi-tails displaced by SLIDE, awaiting re-placement
  // right after the contester that displaced them.
  const slidTails: Wall[] = [];

  /** §3.9.1 (G27): a firm contester needing `needed` minutes compresses the
   * blocking open semi-tail from its floating start, down to the floor. At the
   * floor: slideable → the semi-tail is unpinned (slides after the contester,
   * via `slidTails`); unslideable → it stays a firm obstacle (old business:
   * wrap/frogleap). Loops because unpinning may expose another compressible
   * wall behind it. */
  const makeRoom = (needed: Dur): void => {
    for (;;) {
      charge();
      // NOT skipWalls(): a ballooned semi-tail typically starts AT ptr, and
      // skipWalls would jump past it before it could be compressed. Advance
      // only over walls fully behind ptr; the first wall overlapping or ahead
      // of ptr is the candidate obstacle.
      while (wallIdx < walls.length && walls[wallIdx]!.end <= ptr) wallIdx++;
      const w = walls[wallIdx];
      if (!w || w.start - ptr >= needed) return;
      if (w.compressibleTo === undefined) return; // not an open semi-tail — firm
      if (w.compressibleTo > w.start) {
        // Compress just enough for the contester, never past the floor. The
        // anchored end never moves; the claim's placement shrinks with it.
        w.start = Math.min(w.compressibleTo, ptr + needed);
        const p = placements.get(w.itemId)!;
        p.parts = w.start < w.end ? [{ start: w.start, end: w.end }] : [];
        if (w.start - ptr >= needed) return;
      }
      if (!w.slideable) return; // pinned at the floor — obstacle, old motions apply
      // SLIDE: unpin the floor-span semi-tail; it re-lands after the contester.
      walls.splice(wallIdx, 1);
      slidTails.push(w);
    }
  };

  /** Re-place slid semi-tails (floor span, anchored end yielded) contiguously
   * after the contester, clamped by the next wall like any soft claim. */
  const flushSlidTails = (): void => {
    for (const w of slidTails) {
      const span = w.end - w.start;
      const width = Math.min(span, slotWidth());
      const parts: Part[] = width > 0 ? [{ start: ptr, end: ptr + width }] : [];
      placements.set(w.itemId, { itemId: w.itemId, parts, squeezedDeficit: 0, overflowDeficit: 0 });
      ptr += width;
    }
    slidTails.length = 0;
  };

  for (const item of plan) {
    if (isTask(item) && isParent(item.id)) continue; // parent bracket — derived after the fill
    if (isTask(item) && wallOf(item, minFragment, openExtentCap, semiTailFloor)) continue; // walls already placed

    // Open (budget-less) UNSCHEDULED task: fills the current free slot up to
    // its fair-share cap (§3.9 — 10h uncontested / 2h yielding / split among
    // open peers; precomputed in capById), clamped by the next wall.
    // Lower-rank items land after it.
    if (isTask(item) && isOpen(item)) {
      skipWalls();
      const cap = capById.get(item.id) ?? openExtentCap;
      const width = Math.min(cap, slotWidth());
      const parts: Part[] = width > 0 ? [{ start: ptr, end: ptr + width }] : [];
      ptr += width;
      placements.set(item.id, {
        itemId: item.id,
        parts,
        squeezedDeficit: 0,
        overflowDeficit: 0,
      });
      continue;
    }

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
    const budget = t.budget ?? minFragment; // budgeted has a budget; open handled above
    const parts: Part[] = [];
    let deficit = budget;
    let squeezed = 0;

    if (t.breakable) {
      // WRAP-AROUND (breakable = budgeted, non-ommf):
      // squeeze up to tolerance against the first obstacle, else split across slots.
      let firstSlot = true;
      while (deficit > 0) {
        charge();
        makeRoom(deficit); // §3.9.1: compress/slide an open semi-tail ahead first
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
        charge();
        makeRoom(deficit); // §3.9.1: compress/slide an open semi-tail ahead first
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

    flushSlidTails(); // §3.9.1: slid semi-tails land right after their contester

    placements.set(t.id, {
      itemId: t.id,
      parts,
      squeezedDeficit: squeezed,
      overflowDeficit: deficit,
    });
  }

  // §2.7 (G24): derive each parent's bracket from its descendant leaves. The
  // bracket spans [min leaf start, max leaf end]; it carries no deficits of its
  // own (conservation lives on the leaves). A parent whose leaves are all
  // unplaced gets an empty bracket. Computed over all parents (a parent may
  // itself be a child — its leaves resolve recursively past nested parents).
  const leavesOf = (id: string): string[] => {
    const kids = plan.filter((i): i is UnstartedTask => isTask(i) && i.parentId === id);
    return kids.flatMap((k) => (isParent(k.id) ? leavesOf(k.id) : [k.id]));
  };
  for (const item of plan) {
    if (!isTask(item) || !isParent(item.id)) continue;
    const parts: Part[] = leavesOf(item.id).flatMap((lid) => placements.get(lid)?.parts ?? []);
    const bracket: Part[] =
      parts.length > 0
        ? [{ start: Math.min(...parts.map((p) => p.start)), end: Math.max(...parts.map((p) => p.end)) }]
        : [];
    placements.set(item.id, { itemId: item.id, parts: bracket, squeezedDeficit: 0, overflowDeficit: 0 });
  }

  // Return in plan order for stable downstream consumption.
  return plan.map((i) => placements.get(i.id)!).filter(Boolean);
}
