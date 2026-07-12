/**
 * THE FORK (§3.12) — Antigravity's sandbox, React-DOM-diffing style.
 * Fork on mutate; sandbox `now` is LOCKED; commit re-settles at REAL now
 * ("live wins"); cancel or ANY error discards the sandbox — the live state can
 * never be corrupted by an edit in progress.
 */

import type { Event, PlanItem, State } from "./types.js";
import { reduce } from "./reducer.js";
import { settle } from "./settle.js";
import { cursorOf } from "./reducer.js";

export interface Sandbox {
  /** now frozen at fork instant — gaps can't glide under the user's hands. */
  frozenNow: number;
  plan: PlanItem[];
  /** preview layout computed against the frozen cursor */
  preview: () => ReturnType<typeof settle>;
}

export function fork(live: State): Sandbox {
  const frozenNow = live.now;
  const frozenCursor = cursorOf(live);
  // structural copy — the sandbox owns its plan array
  const plan = live.plan.map((i) => ({ ...i }));
  return {
    frozenNow,
    plan,
    preview: () =>
      settle({
        plan,
        cursor: frozenCursor,
        minFragment: live.minFragment,
        openExtentCap: live.openExtentCap,
        semiTailFloor: live.semiTailFloor,
      }),
  };
}

/**
 * Commit the sandbox against the LIVE state (which kept ticking).
 * Re-settles at real `now`; the running task's real elapsed is ground truth.
 * Throws → caller discards the sandbox; live state untouched (pure reduce).
 */
export function commit(live: State, sandbox: Sandbox): State {
  const event: Event = { type: "EDIT_COMMIT", batch: sandbox.plan };
  return reduce(live, event); // pure: any throw leaves `live` unreferenced/unchanged
}

/** Cancel is simply: drop the sandbox object. Provided for symmetry/telemetry. */
export function cancel(_sandbox: Sandbox): void {
  /* nothing — the sandbox is garbage; live state was never touched */
}
