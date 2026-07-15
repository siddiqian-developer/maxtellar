/**
 * History entry editor (§4.1 back-log editor slice) — a right-side drawer
 * (reusing the TaskDrawer chrome) that edits ONE past `HistoryEntry` in place,
 * or a fresh back-logged one. Commit is IMMEDIATE and per-entry (user decision
 * 2026-07-15): Save on an existing entry dispatches EDIT_HISTORY with the full
 * history array (this entry replaced); Save on a new draft dispatches BACKLOG
 * (the guarded single-entry insert); Delete dispatches EDIT_HISTORY with the
 * entry omitted.
 *
 * Time fields are smart-input (§7.0.2) with the HISTORY direction: a bare clock
 * resolves into the PAST via `resolvePastTime` (never bumped forward), and every
 * meaning-change is announced in the universal snap-notify strip. Esc → back to
 * the history screen (this drawer closes first).
 */
import { useMemo, useState } from "react";
import type { Channels, Event, HistoryEntry, HistoryOutcome } from "@maxtellar/core";
import { useHeads } from "../heads";
import { useSettings } from "../settings";
import { resolvePastTime } from "../casualTime";
import { fmtDayTime, fmtDur } from "../time";
import { useEscClose } from "../useEscClose";
import { SubheadField } from "./SubheadField";

interface Props {
  /** The entry to edit, or null for a fresh back-logged entry. */
  entry: HistoryEntry | null;
  /** Full current history — the batch base for an EDIT_HISTORY replace. */
  history: HistoryEntry[];
  now: number;
  dispatch: (e: Event) => void;
  onClose: () => void;
}

const OUTCOMES: HistoryOutcome[] = ["completed", "soft-ended", "cancelled", "skipped"];
const OUTCOME_LABEL: Record<HistoryOutcome, string> = {
  completed: "Completed",
  "soft-ended": "Soft-ended",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

export function HistoryEntryEditor({ entry, history, now, dispatch, onClose }: Props): JSX.Element {
  useEscClose(onClose);
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const { addActivity } = useHeads();

  const isNew = entry === null;
  // A fresh draft spans the last half hour up to now (both legal past).
  const seedStart = entry?.start ?? now - 30;
  const seedEnd = entry?.end ?? now;

  const [title, setTitle] = useState(entry?.title ?? "");
  const [activity, setActivity] = useState(entry?.activityId ?? "");
  const [head, setHead] = useState<string | undefined>(entry?.headId);
  const [startMin, setStartMin] = useState<number>(seedStart);
  const [endMin, setEndMin] = useState<number>(seedEnd);
  const [startStr, setStartStr] = useState(fmtDayTime(seedStart, now, hour12));
  const [endStr, setEndStr] = useState(fmtDayTime(seedEnd, now, hour12));
  const [outcome, setOutcome] = useState<HistoryOutcome>(entry?.outcome ?? "completed");
  const [sleepKind, setSleepKind] = useState<HistoryEntry["sleepKind"]>(entry?.sleepKind);
  const [notes, setNotes] = useState<string[]>([]);

  const span = Math.max(0, endMin - startMin);

  const commitTime = (field: "start" | "end", raw: string): void => {
    if (!raw.trim()) return;
    const r = resolvePastTime(raw, now);
    if (r.value === undefined) {
      setNotes([`Couldn't read "${raw}" as a time — leaving it as typed`]);
      return;
    }
    if (field === "start") {
      setStartMin(r.value);
      setStartStr(fmtDayTime(r.value, now, hour12));
    } else {
      setEndMin(r.value);
      setEndStr(fmtDayTime(r.value, now, hour12));
    }
    setNotes(r.notes);
  };

  // A Sleep/Nap tag also names the sub-head (Recharge auto-derives, §2.9).
  const chooseSleepKind = (k: HistoryEntry["sleepKind"]): void => {
    setSleepKind(k);
    if (k === "sleep") setActivity("Sleep");
    else if (k === "nap") setActivity("Nap");
  };

  const err = useMemo<string | null>(() => {
    if (!title.trim()) return "Give it a title.";
    if (!activity.trim() || !head) return "Pick a sub-head.";
    if (startMin > endMin) return "Start is after end — adjust the times.";
    return null;
  }, [title, activity, head, startMin, endMin]);

  const save = (): void => {
    if (err || !head) {
      setNotes(err ? [err] : []);
      return;
    }
    addActivity(head, activity.trim()); // persist a new (head, sub-head)

    // Keep wall = spent + wasted + managed + breaks across a span edit: the
    // non-work channels are preserved, spent absorbs the difference (clamped).
    const base: Channels = entry?.channels ?? { spent: 0, wasted: 0, managed: 0, breaks: 0 };
    const nonSpent = base.wasted + base.managed + base.breaks;
    const channels: Channels =
      nonSpent <= span
        ? { ...base, spent: span - nonSpent }
        : { spent: span, wasted: 0, managed: 0, breaks: 0 };

    const insert: Omit<HistoryEntry, "id"> = {
      taskId: entry?.taskId ?? null,
      title: title.trim(),
      headId: head,
      activityId: activity.trim(),
      kind: entry?.kind ?? "occupancy",
      start: startMin,
      end: endMin,
      outcome,
      channels,
      ...(sleepKind ? { sleepKind } : {}),
      ...(entry?.parentId ? { parentId: entry.parentId } : {}),
      ...(entry?.parentTitle ? { parentTitle: entry.parentTitle } : {}),
    };

    if (isNew) {
      dispatch({ type: "BACKLOG", entry: insert });
    } else {
      const edited: HistoryEntry = { ...insert, id: entry!.id };
      dispatch({ type: "EDIT_HISTORY", batch: history.map((h) => (h.id === entry!.id ? edited : h)) });
    }
    onClose();
  };

  const remove = (): void => {
    if (!entry) return;
    dispatch({ type: "EDIT_HISTORY", batch: history.filter((h) => h.id !== entry.id) });
    onClose();
  };

  const timeField = (
    name: string,
    field: "start" | "end",
    value: string,
    set: (v: string) => void,
  ): JSX.Element => (
    <div className="field">
      <label data-tip='Type casually ("2pm", "yesterday 10pm", "1500") — it formats on blur, into the past.'>
        {name} <span className="req-dot" aria-label="required">•</span>
      </label>
      <input
        value={value}
        aria-label={name}
        onChange={(e) => set(e.target.value)}
        onBlur={() => commitTime(field, value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTime(field, value); } }}
        className="num"
      />
    </div>
  );

  return (
    <div className="drawer-overlay">
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="hist-edit-title">
        <div className="drawer-header">
          <h2 id="hist-edit-title">{isNew ? "Add past entry" : "Edit entry"}</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label>Title <span className="req-dot" aria-label="required">•</span></label>
            <div className="clearable-field">
              <input id="hist-entry-title" value={title} aria-label="Entry title" onChange={(e) => setTitle(e.target.value)} placeholder="What happened?" autoFocus />
            </div>
          </div>
          <div className="field">
            <label>Sub-head <span className="req-dot" aria-label="required">•</span></label>
            <SubheadField activity={activity} onActivity={setActivity} onHead={setHead} />
          </div>
          {timeField("Start", "start", startStr, setStartStr)}
          {timeField("End", "end", endStr, setEndStr)}
          <div className="field">
            <label>Duration</label>
            <span className="num" style={{ fontSize: 13 }}>{fmtDur(span)}</span>
          </div>
          <div className="field">
            <label>Kind</label>
            <div className="type-chips" role="radiogroup" aria-label="Sleep kind">
              {(["none", "sleep", "nap"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`type-chip${(sleepKind ?? "none") === k ? " active" : ""}`}
                  data-status="semi-tail"
                  onClick={() => chooseSleepKind(k === "none" ? undefined : k)}
                >
                  {k === "none" ? "Activity" : k === "sleep" ? "Sleep" : "Nap"}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Outcome</label>
            <div className="type-chips" role="radiogroup" aria-label="Outcome">
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`type-chip${o === outcome ? " active" : ""}`}
                  data-status="semi-tail"
                  onClick={() => setOutcome(o)}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>
          {notes.length > 0 && (
            <div className="form-warning" role="status">
              {notes.map((n, i) => (
                <div key={i}>{n}</div>
              ))}
            </div>
          )}
        </div>
        <div className="drawer-footer">
          {!isNew && (
            <button className="cancel-accent" onClick={remove} data-tip="Delete this entry">Delete</button>
          )}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="cancel-accent" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={err !== null} data-tip={err ?? "Save"}>
            {isNew ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
