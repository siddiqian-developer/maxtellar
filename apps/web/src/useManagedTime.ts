/**
 * §2.6 managed channel — the ONE sanctioned auto-log (the app observed it directly).
 *
 * While a task is RUNNING, minutes the user's hands are literally in the app
 * editing/planning are not work on R — they belong to **Self-Management**. This
 * books them by reattributing `spent → managed` on the running task when the
 * surface closes (`LOG_CHANNEL`, the same mechanism as pomodoro break/modal time).
 *
 * Two things the spec pins down that this must respect:
 *  - **R is NEVER split.** The running card stays one continuous span; only the
 *    internal ledger changes. Nothing is inserted into the plan or history.
 *  - Managed is a **channel of the running task**. With nothing running there is
 *    no managed channel — that time is simply unaccounted and becomes Lost Hours
 *    at the next SOD (§4.2). We do NOT invent a Self-Management occupancy for it.
 *
 * Time is measured on the APP's clock (`state.now`), never `Date.now()`, so the
 * dev sandbox clock and tick model stay authoritative. `LOG_CHANNEL` clamps to the
 * running task's `spent` (physics, E3), so a long edit can never over-book.
 */
import { useEffect, useRef } from "react";
import type { Event } from "@maxtellar/core";

export function useManagedTime(
  /** Is the editing/planning surface open? */
  open: boolean,
  /** The app's clock (`state.now`), in epoch minutes. */
  now: number,
  /** Is a task running right now? (Managed is a channel OF the running task.) */
  running: boolean,
  dispatch: (e: Event) => void,
): void {
  // `now` ticks every minute; keep it in a ref so the effect fires on OPEN/CLOSE
  // transitions only, not on every tick.
  const nowRef = useRef(now);
  nowRef.current = now;
  const runningRef = useRef(running);
  runningRef.current = running;
  const openedAt = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      // Only start the meter if something is actually running to attribute to.
      openedAt.current = runningRef.current ? nowRef.current : null;
      return;
    }
    const start = openedAt.current;
    openedAt.current = null;
    if (start === null) return;
    const minutes = nowRef.current - start;
    // Sub-minute edits round to 0 and book nothing — the ledger is integer minutes.
    if (minutes > 0) dispatch({ type: "LOG_CHANNEL", channel: "managed", minutes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
