/**
 * The active timeline — MAIN surface (SPEC VI): pinned now-seam at 35% height,
 * the day flows upward through it. Record above (solid, settled); plan below
 * (dashed, provisional, gently-witnessed reflow). One terracotta seam.
 */

import { useEffect, useRef, useState } from "react";
import type { State, UnstartedTask } from "@timekeeper/core";
import { runningView } from "@timekeeper/core";
import { fmtDur, fmtClock } from "../time";
import { useSettings } from "../settings";

const PPM = 1.6; // px per minute
const PAST_WINDOW = 6 * 60;
const FUTURE_WINDOW = 12 * 60;

export function Timeline({ state }: { state: State }): JSX.Element {
  const { timeFormat } = useSettings();
  const hhmm = (min: number): string => fmtClock(new Date(min * 60000), timeFormat === "12h");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  const windowStart = state.now - PAST_WINDOW;
  const windowEnd = state.now + FUTURE_WINDOW;
  const y = (min: number): number => (min - windowStart) * PPM;
  const canvasH = (windowEnd - windowStart) * PPM;

  // keep the seam pinned at 35% while following
  useEffect(() => {
    const el = scrollRef.current;
    if (el && follow) el.scrollTop = y(state.now) - el.clientHeight * 0.35;
  });

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = y(state.now) - el.clientHeight * 0.35;
    if (Math.abs(el.scrollTop - pinned) > 40 && follow) setFollow(false);
  };

  // hour gridline labels
  const hourMarks: number[] = [];
  for (let m = Math.ceil(windowStart / 60) * 60; m <= windowEnd; m += 60) hourMarks.push(m);

  const planItems = new Map(state.plan.map((i) => [i.id, i]));

  // §3.9 presumed extent (display only, R10 — the scheduler reserves just
  // MIN_FRAGMENT for these and never reads what we draw): floating tasks are
  // STRETCHED to the remaining nominal day (= next local midnight; grilled
  // 2026-07-11). Unscheduled floats (no anchors) divide the remainder evenly,
  // stacking in rank order; a budget-less semi-head keeps its anchored start
  // and extends to the next placement. All clamped by anchored placements.
  const nowDate = new Date(state.now * 60000);
  const dayEnd = Math.floor(
    new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1).getTime() / 60000,
  );
  const isFloating = (id: string): boolean => {
    const it = planItems.get(id);
    return it?.kind === "task" && it.budget === undefined && it.anchorEnd === undefined;
  };
  const anchoredStartsAfter = (min: number): number | undefined =>
    state.placements
      .filter((p) => !isFloating(p.itemId))
      .flatMap((p) => p.parts.map((pt) => pt.start))
      .filter((s) => s > min)
      .sort((a, b) => a - b)[0];
  const presumed = new Map<string, { start: number; end: number }>();
  {
    const floats = state.placements.filter((p) => isFloating(p.itemId) && p.parts.length > 0);
    const drifters = floats.filter((p) => planItems.get(p.itemId)?.kind === "task" && (planItems.get(p.itemId) as UnstartedTask).anchorStart === undefined);
    const semiHeads = floats.filter((p) => !drifters.includes(p));
    // budget-less semi-head: anchored start → next placement (or day end)
    for (const p of semiHeads) {
      const start = p.parts[0]!.start;
      const end = Math.max(start + state.minFragment, Math.min(anchoredStartsAfter(start) ?? dayEnd, dayEnd));
      presumed.set(p.itemId, { start, end });
    }
    // unscheduled drifters: divide the remaining day evenly, stacked in order
    const first = drifters[0]?.parts[0];
    if (first && dayEnd > first.start) {
      const share = Math.max(state.minFragment, Math.floor((dayEnd - first.start) / drifters.length));
      let cursor = first.start;
      for (const p of drifters) {
        let end = Math.min(cursor + share, dayEnd);
        const wall = anchoredStartsAfter(cursor);
        if (wall !== undefined) end = Math.min(end, wall);
        if (end <= cursor) end = cursor + state.minFragment; // degenerate: keep the real slot
        presumed.set(p.itemId, { start: cursor, end });
        cursor = end;
      }
    }
  }

  return (
    <div className="timeline-wrap">
      <div className="timeline-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="timeline-canvas" style={{ height: canvasH }}>
          {hourMarks.map((m) => (
            <div key={m} className="tick-label num" style={{ top: y(m) }}>
              {hhmm(m)}
            </div>
          ))}

          {/* record — above now, frozen */}
          {state.history
            .filter((h) => h.end > windowStart)
            .map((h) => (
              <div
                key={h.id}
                className={`block past${h.kind === "skipped" ? " skipped" : ""}`}
                style={{
                  top: y(h.start),
                  height: Math.max(h.kind === "skipped" ? 4 : 8, (h.end - h.start) * PPM - 2),
                }}
                title={`${h.title} · ${hhmm(h.start)}–${hhmm(h.end)} · ${h.outcome}`}
              >
                {h.title}
                <span className="sub"> {h.kind === "skipped" ? "skipped" : hhmm(h.start)}</span>
              </div>
            ))}

          {/* the living block — running task at its FULL projected span (never
              shrinks): spent portion (above now) solid, remaining (below now)
              lighter. Stopwatch mode has no projected end — grows with now. */}
          {state.running && (() => {
            const r = state.running;
            const rv = runningView(state);
            const end = rv ? Math.max(rv.projectedEnd, state.now) : state.now;
            const totalH = Math.max(10, (end - r.startedAt) * PPM - 2);
            const spentH = Math.min((state.now - r.startedAt) * PPM, totalH);
            return (
              <div className="block running" style={{ top: y(r.startedAt), height: totalH }}>
                <div className="running-spent" style={{ height: spentH }} aria-hidden="true" />
                <div className="running-label">
                  ▶ {r.title}
                  <span className="sub num"> {fmtDur(state.now - r.startedAt)}</span>
                  {rv && rv.mode === "countdown" && (
                    <span className="sub num"> · {fmtDur(rv.remaining)} left</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* plan — below now, provisional, reflowing. Floating tasks render
              at their PRESUMED extent (display only) with an "open" label. */}
          {state.placements.flatMap((p) => {
            const item = planItems.get(p.itemId);
            if (!item) return [];
            const anchored =
              item.kind === "task" &&
              (item.timing === "fixed" ||
                item.timing === "semi-head" ||
                item.timing === "semi-tail");
            const open = presumed.get(p.itemId);
            const parts = open ? [open] : p.parts;
            return parts.map((part, idx) => (
              <div
                key={`${p.itemId}-${idx}`}
                className={`block plan${anchored ? " anchored" : ""}${open ? " open-ended" : ""}`}
                style={{ top: y(part.start), height: Math.max(8, (part.end - part.start) * PPM - 2) }}
                title={open ? `${hhmm(part.start)} · open-ended (presumed extent)` : `${hhmm(part.start)}–${hhmm(part.end)}`}
              >
                {item.kind === "task" ? item.title : "· gap ·"}
                {open && <span className="sub"> open</span>}
                {parts.length > 1 && <span className="sub"> — part {idx + 1}</span>}
                {p.squeezedDeficit > 0 && <span className="sub num"> ⌁{p.squeezedDeficit}m</span>}
              </div>
            ));
          })}

          {/* the seam — where uncertain plan crystallizes into certain record.
              No time label (the global clock already shows it) — just a dot
              on the time axis, Google-Calendar style. */}
          <div className="now-seam" style={{ top: y(state.now) }}>
            <span className="now-dot" aria-hidden="true" />
          </div>
        </div>
      </div>

      {!follow && (
        <button className="back-to-now" onClick={() => setFollow(true)} aria-label="Back to now">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}
