/**
 * Dev clock (SPEC VI, dev sandbox only): sits right of the global clock and
 * shows logical `now` — the scheduler clock — with a DEV label so it can't be
 * mistaken for wall time. Clicking it opens a popover with Tick steps (single
 * advances) and Run rates (dev-time per real second). Sub-minute ticks
 * accumulate locally; a batch TICK is dispatched only on whole-minute
 * boundaries — domain time stays integer minutes, the event log never sees
 * seconds. Timeline/pipeline render from `state.now`, so they follow this
 * clock automatically; wall ticks are no-ops until real time catches up (R11).
 */

import { useEffect, useRef, useState } from "react";
import type { Event, Min } from "@maxtellar/core";
import { useSettings } from "../settings";
import { toDate } from "../time";

interface Props {
  now: Min;
  dispatch: (e: Event) => void;
}

const TICK_STEPS: { label: string; sec: number }[] = [
  { label: "10s", sec: 10 },
  { label: "15s", sec: 15 },
  { label: "30s", sec: 30 },
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "10m", sec: 600 },
  { label: "15m", sec: 900 },
  { label: "30m", sec: 1800 },
  { label: "60m", sec: 3600 },
];

const RUN_RATES: { label: string; sec: number }[] = [
  { label: "10s/1s", sec: 10 },
  { label: "30s/1s", sec: 30 },
  { label: "1m/1s", sec: 60 },
  { label: "5m/1s", sec: 300 },
  { label: "10m/1s", sec: 600 },
];

export function DevClock({ now, dispatch }: Props): JSX.Element {
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const [open, setOpen] = useState(false);
  // Seconds past `now` from sub-minute ticking; whole minutes go out as TICK.
  const [sec, setSec] = useState(0);
  // null = the 1s/1s default (real pace — the clock is never frozen);
  // a number = accelerated dev-seconds per real second.
  const [rate, setRate] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // `now` may also advance from wall ticks or other events; the seconds
  // remainder only ever meant "past the now we last saw", so keep it as-is —
  // approximate is fine for a testing affordance.
  const advance = (bySec: number): void => {
    const total = sec + bySec;
    const mins = Math.floor(total / 60);
    setSec(total - mins * 60);
    if (mins > 0) dispatch({ type: "TICK", to: now + mins });
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    const perSec = rate ?? 1;
    const id = setInterval(() => advanceRef.current(perSec), 1000);
    return () => clearInterval(id);
  }, [rate]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const d = toDate(now);
  d.setSeconds(sec);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).toUpperCase();
  const date = new Intl.DateTimeFormat([], { weekday: "short", day: "numeric", month: "short" }).format(d);

  return (
    <div className="dev-clock" ref={rootRef}>
      <button
        className="dev-clock-face"
        onClick={() => setOpen((o) => !o)}
        title="Dev clock — logical scheduler time (click for tick/run controls)"
        aria-expanded={open}
      >
        <span className="dev-clock-label">dev</span>
        <span className="clock-date">{date}</span>
        <span className={`clock-time num${rate !== null ? " dev-running" : ""}`}>{time}</span>
      </button>
      {open && (
        <div className="dev-clock-pop" role="dialog" aria-label="Dev clock controls">
          <span className="dev-clock-row-label">Tick</span>
          <div className="type-chips">
            {TICK_STEPS.map((t) => (
              <button
                key={t.label}
                type="button"
                className="type-chip"
                data-status="budgeted"
                onClick={() => advance(t.sec)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="dev-clock-row-label">Run</span>
          <div className="type-chips">
            {RUN_RATES.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`type-chip${rate === r.sec ? " active" : ""}`}
                data-status="budgeted"
                onClick={() => setRate((cur) => (cur === r.sec ? null : r.sec))}
              >
                {r.label}
              </button>
            ))}
            <button
              type="button"
              className="type-chip"
              data-status="fixed"
              disabled={rate === null}
              onClick={() => setRate(null)}
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
