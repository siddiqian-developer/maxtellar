/**
 * History — exact as-happened flow (SPEC VI.4), read-only full screen.
 * Entries grouped by day, oldest day first, rows oldest-first within (the
 * screen reads like the day happened, 2026-07-13); idle time between two
 * finished runs renders as a quiet gap row (no trailing gap to `now`, none
 * before the first run; a gap spanning midnight splits at the day heading).
 * Each row: absolute start–end (upright — history is fact), title, neutral
 * head badge, outcome pill, duration. The pre-SOD history editor is a later
 * slice.
 */

import type { HistoryEntry, State } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { fmtClock, fmtDur, toDate } from "../time";
import { useSettings } from "../settings";

interface Props {
  state: State;
  onBack: () => void;
}

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

type Row = { type: "entry"; h: HistoryEntry } | { type: "gap"; start: number; end: number };

export function HistoryScreen({ state, onBack }: Props): JSX.Element {
  useEscClose(onBack);
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const clock = (min: number): string => fmtClock(toDate(min), hour12);

  // Oldest-first flow with gap rows between two consecutive FINISHED runs
  // (occupancy entries with real span; zero-occupancy markers never bound a
  // gap). No trailing gap to `now` — that idle is still forming.
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
                  <div key={`gap-${r.start}`} className="history-row history-gap">
                    <span className="hr-range num">{`${clock(r.start)} – ${clock(r.end)}`}</span>
                    <span className="hr-title">gap</span>
                    <span className="hr-dur num">{fmtDur(r.end - r.start)}</span>
                  </div>
                ) : (
                  <div key={r.h.id} className={`history-row${r.h.outcome === "skipped" ? " skipped" : ""}`}>
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
    </div>
  );
}
