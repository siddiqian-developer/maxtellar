/**
 * The active timeline — MAIN surface (SPEC VI): pinned now-seam at 35% height,
 * the day flows upward through it. Record above (solid, settled); plan below
 * (dashed, provisional, gently-witnessed reflow). One terracotta seam.
 */

import { useEffect, useRef, useState } from "react";
import type { State, UnstartedTask } from "@timekeeper/core";
import { fmtDur } from "../time";

const PPM = 1.6; // px per minute
const PAST_WINDOW = 6 * 60;
const FUTURE_WINDOW = 12 * 60;

function hhmm(min: number): string {
  const d = new Date(min * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Timeline({ state }: { state: State }): JSX.Element {
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

          {/* the living block — running task, snapped to now */}
          {state.running && (
            <div
              className="block running"
              style={{
                top: y(state.running.startedAt),
                height: Math.max(10, (state.now - state.running.startedAt) * PPM - 2),
              }}
            >
              ▶ {state.running.title}
              <span className="sub num"> {fmtDur(state.now - state.running.startedAt)}</span>
            </div>
          )}

          {/* plan — below now, provisional, reflowing */}
          {state.placements.flatMap((p) => {
            const item = planItems.get(p.itemId);
            if (!item) return [];
            const anchored =
              item.kind === "task" &&
              (item.timing === "fixed" ||
                item.timing === "semi-head" ||
                item.timing === "semi-tail");
            return p.parts.map((part, idx) => (
              <div
                key={`${p.itemId}-${idx}`}
                className={`block plan${anchored ? " anchored" : ""}`}
                style={{ top: y(part.start), height: Math.max(8, (part.end - part.start) * PPM - 2) }}
                title={`${hhmm(part.start)}–${hhmm(part.end)}`}
              >
                {item.kind === "task" ? item.title : "· gap ·"}
                {p.parts.length > 1 && <span className="sub"> — part {idx + 1}</span>}
                {p.squeezedDeficit > 0 && <span className="sub num"> ⌁{p.squeezedDeficit}m</span>}
              </div>
            ));
          })}

          {/* the seam — where uncertain plan crystallizes into certain record */}
          <div className="now-seam" style={{ top: y(state.now) }}>
            <span className="badge num">{hhmm(state.now)}</span>
          </div>
        </div>
      </div>

      {!follow && (
        <button className="back-to-now primary" onClick={() => setFollow(true)}>
          ⟳ now
        </button>
      )}
    </div>
  );
}
