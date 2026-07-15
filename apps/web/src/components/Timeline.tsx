/**
 * The active timeline — MAIN surface (SPEC VI): pinned now-seam at 35% height,
 * the day flows upward through it. Record above (solid, settled); plan below
 * (dashed, provisional, gently-witnessed reflow). One terracotta seam.
 */

import { useEffect, useRef, useState } from "react";
import type { State } from "@maxtellar/core";
import { runningView } from "@maxtellar/core";
import { fmtDur, fmtClock } from "../time";
import { useSettings } from "../settings";

const PPM = 1.6; // px per minute
const PAST_WINDOW = 6 * 60;
const FUTURE_WINDOW = 12 * 60;

export function Timeline({ state }: { state: State }): JSX.Element {
  const { timeFormat, gridGranularity } = useSettings();
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

  // ruler graduation marks between the hours — opt-in (Settings → Timeline grid;
  // 0 = off, the default). Ticks every `gridGranularity` min, the half-hour drawn
  // longer/stronger; hours are skipped since they already carry a label.
  const gradMarks: number[] = [];
  if (gridGranularity > 0) {
    for (let m = Math.ceil(windowStart / gridGranularity) * gridGranularity; m <= windowEnd; m += gridGranularity) {
      if (m % 60 !== 0) gradMarks.push(m);
    }
  }

  const planItems = new Map(state.plan.map((i) => [i.id, i]));

  // §2.7 (G24): a parent (a task named by another's parentId) is a derived
  // bracket spanning its leaves — never a filled block (it would overlap them).
  // It is drawn instead as a thin left-rail marker; skipped everywhere below.
  const parentIds = new Set<string>();
  for (const i of state.plan) if (i.kind === "task" && i.parentId) parentIds.add(i.parentId);
  const isParentId = (id: string): boolean => parentIds.has(id);

  // §2.7 (G24): each leaf's original subtask ordinal + its parent's title, so a
  // leaf block on the timeline reads e.g. "Outline · Write essay ↳1". Remaining
  // leaves are a suffix, so ordinals start at subtaskCount − remaining + 1.
  const leafInfo = new Map<string, { parentTitle: string; ordinal: number }>();
  for (const pid of parentIds) {
    const parent = planItems.get(pid);
    if (!parent || parent.kind !== "task") continue;
    const kids = state.plan
      .filter((i) => i.kind === "task" && i.parentId === pid)
      .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
    const base = (parent.subtaskCount ?? kids.length) - kids.length + 1;
    kids.forEach((c, j) => leafInfo.set(c.id, { parentTitle: parent.title, ordinal: base + j }));
  }

  // §2.7 (G24): the composition RAIL — a left-rail that spans ALL of a parent's
  // leaves across time: completed/paused ones in the record (above the seam),
  // the running one, and the still-planned ones below. It persists after the
  // parent task object is gone (history entries carry the composition link), so
  // the timeline reads the past as "these were subtasks of one composed task".
  const railById = new Map<string, { title: string; start: number; end: number }>();
  const extendRail = (pid: string, title: string | undefined, s: number, e: number): void => {
    const cur = railById.get(pid);
    if (!cur) railById.set(pid, { title: title ?? "", start: s, end: e });
    else railById.set(pid, { title: cur.title || (title ?? ""), start: Math.min(cur.start, s), end: Math.max(cur.end, e) });
  };
  const titleOf = (id: string): string | undefined => {
    const it = planItems.get(id);
    return it && it.kind === "task" ? it.title : undefined;
  };
  for (const h of state.history) {
    if (h.parentId) extendRail(h.parentId, h.parentTitle ?? titleOf(h.parentId), h.start, h.end);
  }
  if (state.running?.parentId) {
    const rvR = runningView(state);
    const rEnd = rvR ? Math.max(rvR.projectedEnd, state.now) : state.now;
    extendRail(state.running.parentId, titleOf(state.running.parentId), state.running.startedAt, rEnd);
  }
  for (const p of state.placements) {
    const item = planItems.get(p.itemId);
    if (item?.kind === "task" && item.parentId && p.parts.length > 0) {
      extendRail(item.parentId, titleOf(item.parentId), p.parts[0]!.start, p.parts[p.parts.length - 1]!.end);
    }
  }
  const rails = [...railById.values()].filter((r) => r.end > windowStart && r.start < windowEnd);

  // The running task's subtask identity (if it's a leaf) — for the running label.
  const runParent = state.running?.parentId ? planItems.get(state.running.parentId) : undefined;
  const runSub =
    runParent && runParent.kind === "task"
      ? {
          ordinal: Math.max(1, (runParent.subtaskCount ?? 1) - state.plan.filter((i) => i.kind === "task" && i.parentId === runParent.id).length),
          parentTitle: runParent.title,
        }
      : undefined;

  // §3.9 presumed extent is now a REAL capped reservation the scheduler lays
  // out (grilled 2026-07-11) — placements already carry the open task's full
  // extent, so the timeline just draws them. A budget-less task is flagged
  // "open" (its span is presumed, not a committed duration).
  const isOpen = (id: string): boolean => {
    const it = planItems.get(id);
    return it?.kind === "task" && it.budget === undefined;
  };

  // Gutter timestamps for every task box: its start (first part) and end (last
  // part). Deduped by minute — where a box's end coincides with the next box's
  // start, keep the LATER task's label (a start outranks an end, since the start
  // belongs to the task that occupies the boundary going forward).
  const edgeAt = new Map<number, { min: number; anchored: boolean; isStart: boolean }>();
  const putEdge = (min: number, anchored: boolean, isStart: boolean): void => {
    const prev = edgeAt.get(min);
    if (!prev || (isStart && !prev.isStart)) edgeAt.set(min, { min, anchored, isStart });
  };
  for (const p of state.placements) {
    const item = planItems.get(p.itemId);
    if (!item || item.kind !== "task" || p.parts.length === 0 || isParentId(p.itemId)) continue;
    const open = isOpen(p.itemId);
    const first = p.parts[0];
    const last = p.parts[p.parts.length - 1];
    const topAnchored = item.timing === "fixed" || item.timing === "semi-head";
    // An open task's end is a presumed cap — always floating, regardless of timing.
    // A riding semi-tail needs no case here: slide MOVES the anchor (G28), so
    // the anchored edge is always the live, exact coordinate.
    const bottomAnchored = (item.timing === "fixed" || item.timing === "semi-tail") && !open;
    if (first) putEdge(first.start, topAnchored, true);
    if (last) putEdge(last.end, bottomAnchored, false);
  }
  const edgeTimes = [...edgeAt.values()];

  // A task edge-time whose y lands within OVERLAP_PX of an hour label would sit
  // on top of it. Push such labels below the hour and draw a diagonal leader back
  // to the true edge. Stack up to MAX_STACK per hour; a further one (rare) stays
  // at its edge without a leader rather than piling up.
  const OVERLAP_PX = 11;
  const OFFSET_BASE = 14; // first offset step, clearing the hour label
  const OFFSET_STEP = 15; // extra drop per stacked label
  const MAX_STACK = 2;
  const stackedPerHour = new Map<number, number>();
  const renderedEdges = edgeTimes
    .slice()
    .sort((a, b) => a.min - b.min)
    .map((e) => {
      const edgeY = y(e.min);
      const hourMin = Math.round(e.min / 60) * 60;
      const collides = Math.abs(edgeY - y(hourMin)) < OVERLAP_PX;
      const rank = stackedPerHour.get(hourMin) ?? 0;
      if (!collides || rank >= MAX_STACK) return { ...e, edgeY, tsY: edgeY, offset: false };
      stackedPerHour.set(hourMin, rank + 1);
      return { ...e, edgeY, tsY: y(hourMin) + OFFSET_BASE + rank * OFFSET_STEP, offset: true };
    });

  return (
    <div className="timeline-wrap">
      <div className="timeline-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="timeline-canvas" style={{ height: canvasH }}>
          {hourMarks.map((m) => (
            <div key={m} className="tick-label num" style={{ top: y(m) }}>
              {hhmm(m)}
            </div>
          ))}
          {/* always-on solid graduation tick on the axis at each labelled hour,
              independent of the opt-in sub-hour grid */}
          {hourMarks.map((m) => (
            <div key={`ht${m}`} className="hour-tick" style={{ top: y(m) }} />
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
                {h.parentTitle && <span className="sub"> — Subtask of {h.parentTitle}</span>}
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
                  {runSub && <span className="sub"> — Subtask # {runSub.ordinal} of {runSub.parentTitle}</span>}
                  <span className="sub num"> {fmtDur(state.now - r.startedAt)}</span>
                  {rv && rv.mode === "countdown" && (
                    <span className="sub num"> · {fmtDur(rv.remaining)} left</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* graduation ticks (opt-in) */}
          {gradMarks.map((m) => (
            <div
              key={`g${m}`}
              className={`grad-mark ${m % 30 === 0 ? "grad-half" : "grad-5"}`}
              style={{ top: y(m) }}
            />
          ))}

          {/* plan — below now, provisional, reflowing. Floating tasks render
              at their PRESUMED extent (display only) with an "open" label. */}
          {/* §2.7 (G24): composition rails — one thin left-rail per parent,
              spanning its leaves across record + running + plan (a historical
              record that these were one composed task). */}
          {rails.map((r) => {
            const top = y(Math.max(r.start, windowStart));
            const bottom = y(Math.min(r.end, windowEnd));
            return (
              <div
                key={`rail-${r.title}-${r.start}`}
                className="subtask-bracket"
                style={{ top, height: Math.max(8, bottom - top - 2) }}
                title={`${r.title} · ${hhmm(r.start)}–${hhmm(r.end)} · subtasks`}
              >
                <span className="subtask-bracket-label">{r.title}</span>
              </div>
            );
          })}

          {state.placements.flatMap((p) => {
            const item = planItems.get(p.itemId);
            if (!item) return [];
            if (item.kind === "task" && isParentId(item.id)) return []; // bracket drawn above
            const anchored =
              item.kind === "task" &&
              (item.timing === "fixed" ||
                item.timing === "semi-head" ||
                item.timing === "semi-tail");
            const open = isOpen(p.itemId);
            return p.parts.map((part, idx) => (
              <div
                key={`${p.itemId}-${idx}`}
                className={`block plan${anchored ? " anchored" : ""}${open ? " open-ended" : ""}`}
                data-timing={item.kind === "task" ? item.timing : undefined}
                style={{ top: y(part.start), height: Math.max(8, (part.end - part.start) * PPM - 2) }}
                title={open ? `${hhmm(part.start)} · open (presumed extent, capped)` : `${hhmm(part.start)}–${hhmm(part.end)}`}
              >
                {item.kind === "task" ? item.title : "· gap ·"}
                {leafInfo.has(p.itemId) && (
                  <span className="sub"> — Subtask # {leafInfo.get(p.itemId)!.ordinal} of {leafInfo.get(p.itemId)!.parentTitle}</span>
                )}
                {open && <span className="sub"> open</span>}
                {p.parts.length > 1 && <span className="sub"> — part {idx + 1}</span>}
                {p.squeezedDeficit > 0 && <span className="sub num"> ⌁{p.squeezedDeficit}m</span>}
              </div>
            ));
          })}

          {/* Every task box whispers its start (top) and end (bottom) clock time in
              the gutter, aligned to the edge. Style follows the border: an ANCHORED
              edge (solid — pinned) reads upright; a FLOATING edge (dashed — presumed,
              reflows) reads italic with a leading "~". Gaps get none; a split task
              labels only its real start (first part) and end (last part).
              Deduped by minute: where two coincide (one box's end == the next box's
              start) only the LATER task's label is kept — a start outranks an end.
              Where a label would collide with an hour label it is pushed below and a
              diagonal leader (drawn in the SVG layer) points back to its true edge. */}
          <svg
            className="leader-layer"
            width={64}
            height={canvasH}
            style={{ position: "absolute", left: -64, top: 0, overflow: "visible" }}
            aria-hidden="true"
          >
            {renderedEdges.filter((e) => e.offset).map((e) => (
              // gutter coords: SVG x=0 is the gutter's left, x=64 is the axis. The
              // leader runs from the timestamp's right end up to the edge on the
              // axis, then crosses it into the same short right-side tick the
              // non-offset graduation line uses (overflow is visible).
              <polyline
                key={`l${e.min}-${e.isStart ? "s" : "e"}`}
                className="edge-leader"
                points={`45,${e.tsY} 64,${e.edgeY} 72,${e.edgeY}`}
                fill="none"
              />
            ))}
          </svg>
          {renderedEdges.map((e) => (
            <span
              key={`${e.min}-${e.isStart ? "s" : "e"}`}
              className={`edge-time num ${e.anchored ? "edge-time-anchored" : "edge-time-floating"}${e.offset ? " edge-time-offset" : ""}`}
              style={{ top: e.offset ? e.tsY : e.edgeY }}
            >
              {e.anchored ? "" : "~"}{hhmm(e.min)}
            </span>
          ))}

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
