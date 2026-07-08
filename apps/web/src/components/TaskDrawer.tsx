/**
 * Task entry drawer (SPEC VI): four fields + LIVE type-morph chip — the type
 * changes as fields resolve, mirroring the creation calculation table (§3.6).
 * Physics-snapping happens in core; the drawer only derives the requested type.
 */

import { useMemo, useState } from "react";
import type { Event, TimingType } from "@timekeeper/core";
import { nowMin } from "../time";

interface Props {
  now: number;
  dispatch: (e: Event) => void;
  onClose: () => void;
}

/** HH:mm today → epoch minutes (local). */
function parseClock(v: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Math.floor(d.getTime() / 60000);
}

/** The creation table (§3.6), derived live. */
function deriveTiming(start?: number, end?: number, budget?: number): TimingType {
  if (start !== undefined && (end !== undefined || budget !== undefined)) return "fixed";
  if (end !== undefined && budget !== undefined) return "fixed";
  if (start !== undefined) return "semi-head";
  if (end !== undefined) return "semi-tail";
  if (budget !== undefined) return "budgeted";
  return "unscheduled";
}

export function TaskDrawer({ now, dispatch, onClose }: Props): JSX.Element {
  const [title, setTitle] = useState("");
  const [head, setHead] = useState("Main Work");
  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [budgetStr, setBudgetStr] = useState("");
  const [ommf, setOmmf] = useState(false);

  const start = startStr ? parseClock(startStr) : undefined;
  const end = endStr ? parseClock(endStr) : undefined;
  const budget = budgetStr ? Math.max(0, parseInt(budgetStr, 10) || 0) : undefined;
  const timing = useMemo(() => deriveTiming(start, end, budget), [start, end, budget]);

  const buildEvent = (): Event | null => {
    if (!title.trim()) return null;
    const id = `t-${Date.now()}`;
    // resolve the triple per the table (know 0, 1 or all 3)
    let anchorStart = start;
    let anchorEnd = end;
    let bud = budget;
    if (timing === "fixed") {
      if (anchorStart !== undefined && bud !== undefined && anchorEnd === undefined)
        anchorEnd = anchorStart + bud;
      if (anchorEnd !== undefined && bud !== undefined && anchorStart === undefined)
        anchorStart = anchorEnd - bud;
      if (anchorStart !== undefined && anchorEnd !== undefined) bud = anchorEnd - anchorStart;
    }
    return {
      type: "CREATE_TASK",
      task: {
        id,
        title: title.trim(),
        headId: head,
        activityId: head,
        tier: "normal",
        timing,
        ommf,
        slideable: timing !== "fixed",
        breakable: timing === "budgeted" && !ommf,
        ...(anchorStart !== undefined ? { anchorStart } : {}),
        ...(anchorEnd !== undefined ? { anchorEnd } : {}),
        ...(bud !== undefined ? { budget: bud } : {}),
      } as never,
    };
  };

  const add = (thenStart: boolean): void => {
    const ev = buildEvent();
    if (!ev) return;
    dispatch(ev);
    if (thenStart && ev.type === "CREATE_TASK") {
      dispatch({ type: "START_TASK", taskId: (ev.task as { id: string }).id });
    }
    onClose();
  };

  return (
    <div className="drawer">
      <h2>New task</h2>
      <span className="chip">{timing}</span>
      <div className="field">
        <label>Title</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you doing?" />
      </div>
      <div className="field">
        <label>Head</label>
        <input value={head} onChange={(e) => setHead(e.target.value)} />
      </div>
      <div className="field">
        <label>Start (HH:mm — optional)</label>
        <input value={startStr} onChange={(e) => setStartStr(e.target.value)} placeholder="e.g. 15:50" className="num" />
      </div>
      <div className="field">
        <label>End (HH:mm — optional)</label>
        <input value={endStr} onChange={(e) => setEndStr(e.target.value)} placeholder="e.g. 16:20" className="num" />
      </div>
      <div className="field">
        <label>Budget (minutes — optional)</label>
        <input value={budgetStr} onChange={(e) => setBudgetStr(e.target.value)} placeholder="e.g. 90" className="num" />
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={ommf} onChange={(e) => setOmmf(e.target.checked)} />
        once missed, missed forever (ommf)
      </label>
      <div className="buttons">
        <button className="primary" onClick={() => add(false)}>Add</button>
        <button onClick={() => add(true)}>Add &amp; start now ⚡</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
