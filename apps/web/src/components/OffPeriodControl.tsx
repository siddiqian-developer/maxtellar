/**
 * Off-period control (§4.5) — abrupt, mid-week. When an off-period is running it
 * shows "End Off"; otherwise "Off" opens a dialog asking title + known/unknown
 * end. Known end → a countdown block; unknown → an open (stopwatch) block. Both
 * are Inviolable and book to the Off-Periods head.
 *
 * §4.5 displaced-tasks flow: the dialog lists the plan tasks the block will
 * displace, each with a keep/discard toggle (the pruning-list pattern, §4.2).
 * Keep = "push" (default — the task settles below the block and survives);
 * discard = "perish" (CANCEL_TASK after the block starts). Smart-input on the
 * end time (§7.0.2). Esc → close the dialog.
 */
import { useState } from "react";
import type { Event, State, UnstartedTask } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { useSettings } from "../settings";
import { parseCasualTime, parseTimeOfDay } from "../casualTime";
import { fmtDayTime } from "../time";
import { DatePicker } from "./DatePicker";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
}

export function OffPeriodControl({ state, dispatch }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const running = state.running?.isOff === true;

  if (running) {
    return (
      <button className="eod-btn" onClick={() => dispatch({ type: "END_OFF_PERIOD" })} data-tip="End the off-period and resume the plan">
        End Off
      </button>
    );
  }
  return (
    <>
      <button className="eod-btn" onClick={() => setOpen(true)} data-tip="Start an off-period (illness, travel, an abrupt break)">
        Off
      </button>
      {open && <OffDialog state={state} dispatch={dispatch} onClose={() => setOpen(false)} />}
    </>
  );
}

function OffDialog({
  state,
  dispatch,
  onClose,
}: {
  state: State;
  dispatch: (e: Event) => void;
  onClose: () => void;
}): JSX.Element {
  const now = state.now;
  const { timeFormat, showWeekday } = useSettings();
  const hour12 = timeFormat === "12h";
  const [title, setTitle] = useState("");
  const [known, setKnown] = useState(false);
  const [endStr, setEndStr] = useState("");
  const [endMin, setEndMin] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  // §4.5 displaced tasks: the top-level unstarted plan items the block pushes
  // below it (children ride with their parent bracket, as in SOD pruning).
  const displaced = state.plan.filter((i): i is UnstartedTask => i.kind === "task" && !i.parentId);
  const [discard, setDiscard] = useState<Set<string>>(new Set());
  const toggleDiscard = (id: string): void =>
    setDiscard((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  // Esc closes the calendar first, then the dialog (back-navigation stack).
  useEscClose(calOpen ? () => setCalOpen(false) : onClose);

  // §7.0.5: the calendar sets the DATE; the typed time-of-day is kept (default 5pm).
  const pickDay = (dayMin: number): void => {
    const cur = endMin !== null ? ((endMin % 1440) + 1440) % 1440 : (() => { const t = parseTimeOfDay(endStr); return t ? t.hour * 60 + t.min : 17 * 60; })();
    const v = dayMin + cur;
    setKnown(true);
    setEndMin(v);
    setEndStr(fmtDayTime(v, now, hour12, showWeekday));
    setErr(null);
    setCalOpen(false);
  };

  const commitEnd = (raw: string): void => {
    if (!raw.trim()) { setEndMin(null); return; }
    const r = parseCasualTime(raw, now, {});
    if (r.value === undefined) { setErr(`Couldn't read "${raw}" as a time.`); return; }
    let v = r.value;
    if (v <= now) v += 1440; // a past clock means the next occurrence (tomorrow)
    setEndMin(v);
    setEndStr(fmtDayTime(v, now, hour12, showWeekday));
    setErr(null);
  };

  const start = (): void => {
    if (known && endMin === null) { setErr("Enter when it ends, or switch to open-ended."); return; }
    dispatch({
      type: "START_OFF_PERIOD",
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(known && endMin !== null ? { knownEnd: endMin } : {}),
    });
    // §4.5 perish: the chosen discards leave the plan; the rest push below.
    for (const id of discard) dispatch({ type: "CANCEL_TASK", taskId: id });
    onClose();
  };

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer eod-modal" role="dialog" aria-modal="true" aria-labelledby="off-title">
        <div className="drawer-header">
          <h2 id="off-title">Start an off-period</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <p className="field-desc">
            An Inviolable block on the spine — your planned tasks push below it and resume when it
            ends. Booked to the Off-Periods head.
          </p>
          <div className="field">
            <label>What is it?</label>
            <div className="clearable-field">
              <input value={title} aria-label="Off-period title" onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sick, Travel" autoFocus />
            </div>
          </div>
          <div className="field">
            <label>End</label>
            <div className="type-chips" role="radiogroup" aria-label="End known">
              <button type="button" className={`type-chip${!known ? " active" : ""}`} data-status="unscheduled" onClick={() => setKnown(false)}>Open-ended</button>
              <button type="button" className={`type-chip${known ? " active" : ""}`} data-status="fixed" onClick={() => setKnown(true)}>Known end</button>
            </div>
          </div>
          {known && (
            <div className="field">
              <label>Ends at</label>
              <div className="time-stepper">
                <input value={endStr} className="num" aria-label="Ends at"
                  onChange={(e) => setEndStr(e.target.value)}
                  onBlur={() => commitEnd(endStr)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEnd(endStr); } }}
                  placeholder="e.g. 5pm, tomorrow 9am" />
                <button type="button" tabIndex={-1} className="cal-btn" aria-label="Pick an end date"
                  data-tip="Pick a date (day after tomorrow onward). Today & tomorrow: just type them."
                  onClick={() => setCalOpen(true)}>📅</button>
              </div>
            </div>
          )}
          {displaced.length > 0 && (
            <div className="field">
              <label>Displaced tasks <span className="hint-glyph" tabIndex={0} data-tip="The block pushes these below it. Kept tasks resume when it ends (push); discarded ones are cancelled (perish, §4.5).">ⓘ</span></label>
              <ul className="sod-leftovers">
                {displaced.map((t) => {
                  const gone = discard.has(t.id);
                  return (
                    <li key={t.id} className={`sod-leftover${gone ? " discarded" : ""}`}>
                      <span className="sl-title">{t.title}</span>
                      <span className="badge head-badge">{t.headId}{t.activityId && ` · ${t.activityId}`}</span>
                      <button type="button"
                        className={`type-chip${gone ? " active" : ""}`}
                        data-status={gone ? "fixed" : "budgeted"}
                        onClick={() => toggleDiscard(t.id)}>
                        {gone ? "Discard" : "Keep"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {err && <div className="form-warning" role="status">{err}</div>}
        </div>
        {calOpen && <DatePicker now={now} direction="future" onPick={pickDay} onClose={() => setCalOpen(false)} />}
        <div className="drawer-footer">
          <button className="primary" onClick={start}>Start off-period</button>
          <button className="cancel-accent" onClick={onClose}>Cancel</button>
          <span style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}
