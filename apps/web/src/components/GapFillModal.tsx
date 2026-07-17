/**
 * Gap-fill "what happened?" modal (§4.2 / §2.9 / §2.10) — the single >30-min
 * missing-data component. Given an unaccounted span [from, to] (both ≤ now), it
 * asks what happened and books it via BACKLOG. Fill types: a named Activity, a
 * Food-pattern built-in quick-fill (Sleep/Nap/Food/Meditation/Exercise/
 * Socialization/Learning — each its own head, §11.1b), Wasted (the system
 * Wasted-Time head, loggable here though never plannable, §2.10), or Leave →
 * the residue stays unaccounted and becomes Lost Hours at the next SOD (no
 * event).
 *
 * Built as ONE component with two entry points: the history editor's gap rows
 * now, and the SOD missing-data ceremony in Stage 4. Reuses the drawer chrome;
 * Esc → back to the opener.
 */
import { useMemo, useState } from "react";
import type { Event, HistoryEntry, State } from "@maxtellar/core";
import { WASTED_TIME_ID } from "@maxtellar/core";
import { useHeads } from "../heads";
import { useSettings } from "../settings";
import { fmtDayTime, fmtDur } from "../time";
import { useEscClose } from "../useEscClose";
import { SubheadField } from "./SubheadField";
import { resolvePreset } from "../presets";

interface Props {
  state: State;
  from: number;
  to: number;
  now: number;
  dispatch: (e: Event) => void;
  onClose: () => void;
}

export function GapFillModal({ state, from, to, now, dispatch, onClose }: Props): JSX.Element {
  useEscClose(onClose);
  const { timeFormat, showWeekday, presetsConfig } = useSettings();
  const hour12 = timeFormat === "12h";
  const { addActivity } = useHeads();

  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  const [head, setHead] = useState<string | undefined>(undefined);

  const span = Math.max(0, to - from);

  const book = (entryTitle: string, headId: string, activityId: string): void => {
    const entry: Omit<HistoryEntry, "id"> = {
      taskId: null,
      title: entryTitle,
      headId,
      activityId,
      kind: "occupancy",
      start: from,
      end: to,
      outcome: "completed",
      channels: { spent: span, wasted: 0, managed: 0, breaks: 0 },
    };
    dispatch({ type: "BACKLOG", entry });
    onClose();
  };

  const activityErr = useMemo<string | null>(() => {
    if (!title.trim()) return "Give it a title.";
    if (!activity.trim() || !head) return "Pick a sub-head.";
    return null;
  }, [title, activity, head]);

  const logActivity = (): void => {
    if (activityErr || !head) return;
    addActivity(head, activity.trim());
    book(title.trim(), head, activity.trim());
  };

  return (
    <div className="drawer-overlay">
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="gapfill-title">
        <div className="drawer-header">
          <h2 id="gapfill-title">What happened?</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          <p className="field-desc">
            Unaccounted time — <strong className="num">{fmtDayTime(from, now, hour12, showWeekday)}</strong> to{" "}
            <strong className="num">{fmtDayTime(to, now, hour12, showWeekday)}</strong> ({fmtDur(span)}).
          </p>

          {/* Quick single-tap fills — one per Food-pattern built-in (§11.1b), plus Wasted. */}
          <div className="field">
            <label>Quick fill</label>
            <div className="type-chips" role="group" aria-label="Quick fill">
              {presetsConfig.map((p) => {
                const r = resolvePreset(p, state);
                return (
                  <button key={p.id} type="button" className="type-chip" data-status="semi-tail" onClick={() => book(r.title, r.headId, r.subhead)}>{p.label}</button>
                );
              })}
              <button type="button" className="type-chip" data-status="fixed" onClick={() => book("Wasted", WASTED_TIME_ID, "")}>Wasted</button>
            </div>
          </div>

          {/* Named activity */}
          <div className="field">
            <label>Or log an activity</label>
            <div className="clearable-field">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What were you doing?" />
            </div>
          </div>
          <div className="field">
            <label>Sub-head <span className="req-dot" aria-label="required">•</span></label>
            <SubheadField activity={activity} onActivity={setActivity} onHead={setHead} title={title} />
          </div>
        </div>
        {/* Footer order consistent with the New Task drawer: primary first
            (left), spacer, dismiss last (right). */}
        <div className="drawer-footer">
          <button className="primary" onClick={logActivity} disabled={activityErr !== null} data-tip={activityErr ?? "Log this activity"}>Log</button>
          <span style={{ flex: 1 }} />
          <button className="cancel-accent" onClick={onClose} data-tip="Leave it unaccounted — it becomes Lost Hours at the next day close">Leave (→ Lost)</button>
        </div>
      </div>
    </div>
  );
}
