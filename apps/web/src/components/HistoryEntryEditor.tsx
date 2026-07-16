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
import { resolvePastTime, fitPastInterval, dayStartMin } from "../casualTime";
import { fmtDayTime, fmtDur } from "../time";

import { useEscClose } from "../useEscClose";
import { SubheadField } from "./SubheadField";
import { DatePicker } from "./DatePicker";
import { StepperField } from "./StepperField";

interface Props {
  /** The entry to edit, or null for a fresh back-logged entry. */
  entry: HistoryEntry | null;
  /** Full current history — the batch base for an EDIT_HISTORY replace. */
  history: HistoryEntry[];
  now: number;
  /** §4.2 (2026-07-15): the editable-window floor = the last day-start (last
   * DayRecord.end / the forming day's head sleep). Sealed days are locked. */
  floor: number;
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

export function HistoryEntryEditor({ entry, history, now, floor, dispatch, onClose }: Props): JSX.Element {
  const { timeFormat, showWeekday } = useSettings();
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
  const [startStr, setStartStr] = useState(fmtDayTime(seedStart, now, hour12, showWeekday));
  const [endStr, setEndStr] = useState(fmtDayTime(seedEnd, now, hour12, showWeekday));
  const [outcome, setOutcome] = useState<HistoryOutcome>(entry?.outcome ?? "completed");
  const [sleepKind, setSleepKind] = useState<HistoryEntry["sleepKind"]>(entry?.sleepKind);
  const [notes, setNotes] = useState<string[]>([]);
  const [calField, setCalField] = useState<"start" | "end" | null>(null);
  // Esc closes the calendar first, then the drawer (back-navigation stack).
  useEscClose(calField ? () => setCalField(null) : onClose);

  const span = Math.max(0, endMin - startMin);

  // Editable-window floor = the last day-start (§4.2 day records; passed in).
  // Sealed days are locked; the forming day is editable.
  const fmtT = (m: number): string => fmtDayTime(m, now, hour12, showWeekday);
  // Existing occupancy the fit must not overlap (self excluded when editing).
  const others = history
    .filter((h) => h.kind === "occupancy" && h.id !== entry?.id)
    .map((h) => ({ start: h.start, end: h.end }));

  const commitTime = (field: "start" | "end", raw: string): void => {
    if (!raw.trim()) return;
    const r = resolvePastTime(raw, now);
    if (r.value === undefined) {
      setNotes([`Couldn't read "${raw}" as a time — leaving it as typed`]);
      return;
    }
    const localNotes = [...r.notes];
    let v = r.value;
    // The start-floor is a single-field rule → announce it here at the boundary.
    if (field === "start" && v < floor) {
      v = floor;
      localNotes.push(`Start earlier than the editable window (the last day-start) — moved to ${fmtT(floor)}`);
    }
    if (field === "start") {
      setStartMin(v);
      setStartStr(fmtT(v));
    } else {
      setEndMin(v);
      setEndStr(fmtT(v));
    }
    setNotes(localNotes);
  };

  /** ±5-min chevron nudge (§7.0.5 — every time input carries the stepper; this
   * surface silently lacked one until the shared `StepperField` was composed).
   * Steps the COMMITTED value and reformats, re-applying the same start-floor
   * boundary rule `commitTime` enforces. */
  const stepTime = (field: "start" | "end", dir: 1 | -1): void => {
    let v = (field === "start" ? startMin : endMin) + dir * 5;
    const localNotes: string[] = [];
    if (field === "start" && v < floor) {
      v = floor;
      localNotes.push(`Start earlier than the editable window (the last day-start) — moved to ${fmtT(floor)}`);
    }
    if (field === "start") {
      setStartMin(v);
      setStartStr(fmtT(v));
    } else {
      setEndMin(v);
      setEndStr(fmtT(v));
    }
    setNotes(localNotes);
  };

  // §7.0.5 calendar affordance (past): keep the typed time-of-day, set the DATE.
  const pickDay = (dayMin: number): void => {
    const field = calField;
    if (!field) return;
    const cur = field === "start" ? startMin : endMin;
    const tod = ((cur % 1440) + 1440) % 1440;
    let v = dayMin + tod;
    const localNotes: string[] = [];
    if (v > now) { v = now; localNotes.push("Clamped to now — history can't cross into the future"); }
    if (field === "start" && v < floor) { v = floor; localNotes.push(`Start earlier than the editable window (the last day-start) — moved to ${fmtT(floor)}`); }
    if (field === "start") { setStartMin(v); setStartStr(fmtT(v)); }
    else { setEndMin(v); setEndStr(fmtT(v)); }
    setNotes(localNotes);
    setCalField(null);
  };

  // A Sleep/Nap tag also names the sub-head (Recharge auto-derives, §2.9).
  const chooseSleepKind = (k: HistoryEntry["sleepKind"]): void => {
    setSleepKind(k);
    if (k === "sleep") setActivity("Sleep");
    else if (k === "nap") setActivity("Nap");
  };

  const fieldErr = useMemo<string | null>(() => {
    if (!title.trim()) return "Give it a title.";
    if (!activity.trim() || !head) return "Pick a sub-head.";
    return null;
  }, [title, activity, head]);

  const save = (): void => {
    if (fieldErr || !head) {
      setNotes(fieldErr ? [fieldErr] : []);
      return;
    }
    // Canonical resolve from the current strings (covers un-blurred edits),
    // then the overlap-aware fit — all valid snaps in one place (§7.0.2).
    const rs = resolvePastTime(startStr, now);
    const re = resolvePastTime(endStr, now);
    if (rs.value === undefined || re.value === undefined) {
      setNotes(["Enter valid start and end times."]);
      return;
    }
    const fit = fitPastInterval(rs.value, re.value, others, now, floor, fmtT);
    const snapNotes = [...rs.notes, ...re.notes, ...fit.notes];
    // Reflect whatever the fit resolved to, so the user always sees the truth.
    setStartMin(fit.start);
    setEndMin(fit.end);
    setStartStr(fmtT(fit.start));
    setEndStr(fmtT(fit.end));
    if (!fit.ok) {
      setNotes(snapNotes.length ? snapNotes : ["No room here — adjust the times."]);
      return;
    }
    // A meaning-change → announce and require one more Save to confirm (never
    // dispatch a silently-changed meaning). A clean interval saves in one tap.
    if (snapNotes.length > 0) {
      setNotes(snapNotes);
      return;
    }

    addActivity(head, activity.trim()); // persist a new (head, sub-head)

    // Keep wall = spent + wasted + managed + breaks across a span edit: the
    // non-work channels are preserved, spent absorbs the difference (clamped).
    const finalSpan = fit.end - fit.start;
    const base: Channels = entry?.channels ?? { spent: 0, wasted: 0, managed: 0, breaks: 0 };
    const nonSpent = base.wasted + base.managed + base.breaks;
    const channels: Channels =
      nonSpent <= finalSpan
        ? { ...base, spent: finalSpan - nonSpent }
        : { spent: finalSpan, wasted: 0, managed: 0, breaks: 0 };

    const insert: Omit<HistoryEntry, "id"> = {
      taskId: entry?.taskId ?? null,
      title: title.trim(),
      headId: head,
      activityId: activity.trim(),
      kind: entry?.kind ?? "occupancy",
      start: fit.start,
      end: fit.end,
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
      <StepperField
        text={value}
        onText={set}
        onCommit={() => commitTime(field, value)}
        onStep={(dir) => stepTime(field, dir)}
        ariaLabel={name}
        calendar={{
          onOpen: () => setCalField(field),
          ariaLabel: `Pick a date for ${name}`,
          tip: "Pick a past date (up to today). The time stays as typed.",
        }}
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
            <SubheadField activity={activity} onActivity={setActivity} onHead={setHead} title={title} />
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
        {/* Footer: [Add/Save, Cancel] grouped left, spacer, Delete far right
            (edit only, danger-tinted — separated from the confirm actions). */}
        <div className="drawer-footer">
          <button className="primary" onClick={save} disabled={fieldErr !== null} data-tip={fieldErr ?? "Save"}>
            {isNew ? "Add" : "Save"}
          </button>
          <button className="cancel-accent" onClick={onClose}>Cancel</button>
          <span style={{ flex: 1 }} />
          {!isNew && (
            <button className="cancel-accent delete-btn" onClick={remove} data-tip="Delete this entry">Delete</button>
          )}
        </div>
        {calField && (
          <DatePicker now={now} direction="past" earliest={dayStartMin(floor)} onPick={pickDay} onClose={() => setCalField(null)} />
        )}
      </div>
    </div>
  );
}
