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

import { useState } from "react";
import type { Event, HistoryEntry, State } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { fmtClock, fmtDur, toDate } from "../time";
import { useSettings } from "../settings";
import { HistoryEntryEditor } from "./HistoryEntryEditor";
import { GapFillModal } from "./GapFillModal";

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

type Row =
  | { type: "entry"; h: HistoryEntry }
  | { type: "gap"; start: number; end: number; trailing?: boolean };

export function HistoryScreen({ state, dispatch, onBack }: Props): JSX.Element {
  const [editing, setEditing] = useState<HistoryEntry | "new" | null>(null);
  const [filling, setFilling] = useState<{ from: number; to: number } | null>(null);
  // Esc closes the innermost overlay first (editor/modal), else goes back.
  useEscClose(editing || filling ? () => { setEditing(null); setFilling(null); } : onBack);

  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const clock = (min: number): string => fmtClock(toDate(min), hour12);

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

  // Group by day, oldest day first (rows are already chronological).
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = dayKey(r.type === "entry" ? r.h.start : r.start);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  return (
    <div className="config-screen">
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
        {groups.size === 0 && <span className="config-empty">nothing has happened yet — history fills as work completes</span>}
        {[...groups.entries()].map(([key, dayRows]) => {
          const first = dayRows[0]!;
          return (
            <div key={key}>
              <h3 className="history-day">{dayHeading(first.type === "entry" ? first.h.start : first.start)}</h3>
              {dayRows.map((r) =>
                r.type === "gap" ? (
                  <div key={`gap-${r.start}`} className={`history-row history-gap${r.trailing ? " trailing" : ""}`}>
                    <span className="hr-range num">{`${clock(r.start)} – ${clock(r.end)}`}</span>
                    <span className="hr-title">{r.trailing ? "unaccounted (forming)" : "gap"}</span>
                    <span className="hr-dur num">{fmtDur(r.end - r.start)}</span>
                    {r.end - r.start > GAP_THRESHOLD && (
                      <button
                        className="fill-btn"
                        onClick={() => setFilling({ from: r.start, to: r.end })}
                        data-tip="What happened? Fill this unaccounted span"
                      >fill</button>
                    )}
                  </div>
                ) : (
                  <div
                    key={r.h.id}
                    className={`history-row clickable${r.h.outcome === "skipped" ? " skipped" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditing(r.h)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(r.h); } }}
                    data-tip="Click to edit this entry"
                  >
                    <span className="hr-range num">
                      {r.h.kind === "skipped" ? clock(r.h.start) : `${clock(r.h.start)} – ${clock(r.h.end)}`}
                    </span>
                    <span className="hr-title">{r.h.title}</span>
                    <span className="badge head-badge">
                      {r.h.headId}
                      {r.h.activityId && ` · ${r.h.activityId}`}
                    </span>
                    <span className="outcome-pill" data-outcome={r.h.outcome}>{OUTCOME_LABEL[r.h.outcome]}</span>
                    <span className="hr-dur num">{fmtDur(r.h.end - r.h.start)}</span>
                  </div>
                ),
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <HistoryEntryEditor
          entry={editing === "new" ? null : editing}
          history={state.history}
          now={state.now}
          dispatch={dispatch}
          onClose={() => setEditing(null)}
        />
      )}
      {filling && (
        <GapFillModal
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
