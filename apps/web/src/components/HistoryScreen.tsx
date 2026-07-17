/**
 * History — exact as-happened flow (SPEC VI.4), now with the pre-SOD EDITOR
 * slice (§4.1). Entries grouped by day, oldest day first, rows oldest-first
 * within (the screen reads like the day happened); idle time between two
 * finished runs renders as a quiet gap row (a gap spanning midnight splits at
 * the day heading). Each row: absolute start–end (upright — history is fact),
 * title, neutral head badge, outcome pill, duration.
 *
 * Editor slice (2026-07-15): each entry row is clickable → opens the
 * HistoryEntryEditor; "+ Add entry" back-logs a fresh one; any gap longer than
 * GAP_THRESHOLD (30 min) — interior OR the still-forming trailing gap to `now`
 * (the editor's one divergence from the read-only "no trailing gap" rule) —
 * carries a "fill" affordance opening the >30-min GapFillModal. Commit is
 * immediate per-entry (EDIT_HISTORY for edit/delete, BACKLOG for inserts).
 */

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Event, HistoryEntry, State } from "@maxtellar/core";
import { formingDayStart, headName } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { dayStartMin } from "../casualTime";
import { fmtClock, fmtDur, toDate } from "../time";
import { useSettings } from "../settings";
import { HistoryEntryEditor } from "./HistoryEntryEditor";
import { GapFillModal } from "./GapFillModal";

const MIN_PER_DAY = 1440;

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  onBack: () => void;
}

/** §4.2 / §7: the missing-data threshold — gaps beyond this ask "what happened?" */
const GAP_THRESHOLD = 30;

const OUTCOME_LABEL: Record<HistoryEntry["outcome"], string> = {
  completed: "Completed",
  "soft-ended": "Soft-ended",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

/** Calendar-day key + heading for a minute stamp (sleep-cycle days come with §4). */
function dayKey(min: number): string {
  const d = toDate(min);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayHeading(min: number): string {
  return toDate(min).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** First minute of the local day after `min` (for splitting gaps at midnight). */
function nextMidnight(min: number): number {
  const d = toDate(min);
  d.setHours(24, 0, 0, 0);
  return Math.floor(d.getTime() / 60000);
}

type EntryRow = { type: "entry"; h: HistoryEntry };
type GapRow = { type: "gap"; start: number; end: number; trailing?: boolean };
type Row = EntryRow | GapRow;

/** The flattened list the virtualizer indexes: day headings and rows in one
 * sequence (a nested group render can't be windowed). */
type Item =
  | { kind: "header"; key: string; at: number }
  | { kind: "row"; r: Row };

export function HistoryScreen({ state, dispatch, onBack }: Props): JSX.Element {
  // The scroll container is `.config-screen` (it owns overflow-y), not `.config-body`.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<HistoryEntry | "new" | null>(null);
  const [filling, setFilling] = useState<{ from: number; to: number } | null>(null);
  // Esc closes the innermost overlay first (editor/modal), else goes back.
  useEscClose(editing || filling ? () => { setEditing(null); setFilling(null); } : onBack);

  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const clock = (min: number): string => fmtClock(toDate(min), hour12);

  // §4.2: editable-window floor = the last day-start (last DayRecord.end / the
  // forming day's head sleep). With no records and no history yet, keep the
  // pre-SOD fallback of yesterday so a first back-log can still span before now.
  const editableFloor =
    state.days.length > 0 || state.history.some((h) => h.kind === "occupancy")
      ? formingDayStart(state)
      : dayStartMin(state.now) - MIN_PER_DAY;

  // Oldest-first flow with gap rows between two consecutive FINISHED runs
  // (occupancy entries with real span; zero-occupancy markers never bound a
  // gap). The trailing gap to `now` IS surfaced here (editor divergence).
  const sorted = [...state.history].sort((a, b) => a.start - b.start || a.end - b.end);
  const rows: Row[] = [];
  let prevEnd: number | null = null; // end of the last finished run seen
  for (const h of sorted) {
    if (h.kind === "occupancy" && h.end > h.start) {
      if (prevEnd !== null && h.start > prevEnd) {
        // split a midnight-spanning gap at the day boundary
        let from = prevEnd;
        while (from < h.start) {
          const to = Math.min(h.start, nextMidnight(from));
          rows.push({ type: "gap", start: from, end: to });
          from = to;
        }
      }
      prevEnd = Math.max(prevEnd ?? h.end, h.end);
    }
    rows.push({ type: "entry", h });
  }
  // Trailing gap: the still-forming span from the last finished run to `now`.
  // Only surfaced (with a fill affordance) when it exceeds the threshold.
  if (prevEnd !== null && state.now - prevEnd > GAP_THRESHOLD) {
    let from = prevEnd;
    while (from < state.now) {
      const to = Math.min(state.now, nextMidnight(from));
      rows.push({ type: "gap", start: from, end: to, trailing: true });
      from = to;
    }
  }

  // Group by day, oldest day first (rows are already chronological), then FLATTEN
  // to a single item list so the virtualizer can size day headings and rows in one
  // pass — a grouped render can't be windowed without measuring every group.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = dayKey(r.type === "entry" ? r.h.start : r.start);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const items: Item[] = [];
  for (const [key, dayRows] of groups) {
    const first = dayRows[0]!;
    items.push({ kind: "header", key, at: first.type === "entry" ? first.h.start : first.start });
    for (const r of dayRows) items.push({ kind: "row", r });
  }

  // History is unbounded — it grows for the life of the app — so only the visible
  // window is in the DOM (§7.0.4: @tanstack/react-virtual). Rows vary in height
  // (a gap row, a wrapped title), so each is measured rather than assumed:
  // `estimateSize` is only the pre-measure guess.
  const virt = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]!.kind === "header" ? 40 : 34),
    overscan: 10,
    getItemKey: (i) => {
      const it = items[i]!;
      return it.kind === "header" ? `h-${it.key}` : it.r.type === "gap" ? `g-${it.r.start}` : it.r.h.id;
    },
  });

  return (
    <div className="config-screen" ref={scrollRef}>
      <div className="config-header">
        <button className="theme-toggle" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>History</h2>
        <span style={{ flex: 1 }} />
        <button className="hist-add-btn" onClick={() => setEditing("new")} data-tip="Back-log a past entry by hand">+ Add entry</button>
      </div>
      <div className="config-body">
        {items.length === 0 && <span className="config-empty">nothing has happened yet — history fills as work completes</span>}
        {/* The virtualizer positions items absolutely inside a spacer of the full
            list height, so the scrollbar still reflects ALL of history. */}
        <div className="hist-virt" style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((v) => {
            const it = items[v.index]!;
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virt.measureElement}
                className="hist-virt-item"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
              >
                {it.kind === "header" ? (
                  <h3 className="history-day">{dayHeading(it.at)}</h3>
                ) : it.r.type === "gap" ? (
                  <div className={`history-row history-gap${it.r.trailing ? " trailing" : ""}`}>
                    <span className="hr-range num">{`${clock(it.r.start)} – ${clock(it.r.end)}`}</span>
                    <span className="hr-title">{it.r.trailing ? "unaccounted (forming)" : "gap"}</span>
                    <span className="hr-dur num">{fmtDur(it.r.end - it.r.start)}</span>
                    {it.r.end - it.r.start > GAP_THRESHOLD && (
                      <button
                        className="fill-btn"
                        onClick={() => setFilling({ from: (it.r as GapRow).start, to: (it.r as GapRow).end })}
                        data-tip="What happened? Fill this unaccounted span"
                      >fill</button>
                    )}
                  </div>
                ) : (
                  <div
                    className={`history-row clickable${it.r.h.outcome === "skipped" ? " skipped" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditing((it.r as EntryRow).h)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing((it.r as EntryRow).h); } }}
                    data-tip="Click to edit this entry"
                  >
                    <span className="hr-range num">
                      {it.r.h.kind === "skipped" ? clock(it.r.h.start) : `${clock(it.r.h.start)} – ${clock(it.r.h.end)}`}
                    </span>
                    <span className="hr-title">{it.r.h.title}</span>
                    <span className="badge head-badge">
                      {headName(it.r.h.headId)}
                      {it.r.h.activityId && ` · ${it.r.h.activityId}`}
                    </span>
                    <span className="outcome-pill" data-outcome={it.r.h.outcome}>{OUTCOME_LABEL[it.r.h.outcome]}</span>
                    <span className="hr-dur num">{fmtDur(it.r.h.end - it.r.h.start)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <HistoryEntryEditor
          entry={editing === "new" ? null : editing}
          history={state.history}
          now={state.now}
          floor={editableFloor}
          dispatch={dispatch}
          onClose={() => setEditing(null)}
        />
      )}
      {filling && (
        <GapFillModal
          state={state}
          from={filling.from}
          to={filling.to}
          now={state.now}
          dispatch={dispatch}
          onClose={() => setFilling(null)}
        />
      )}
    </div>
  );
}
