/**
 * Pipeline — the control surface (SPEC VI): Running + unstarted only, uniform
 * cards, gaps as subtle spacing. Start/Pause/Complete/Cancel sync to the
 * timeline unconditionally (one spine, two projections).
 *
 * Card anatomy per SPEC VI "card anatomy" (2026-07-12): state-hued left bar;
 * one header row — index badge (+ live dot on running), title, neutral head
 * badge, status capsule (CATEGORY • SUBSTATE) right-pinned; a single-row
 * read-only labelled fields strip (a paused remainder's first field is
 * Restart, not Start); quiet wasted pill; compact semantic footer actions.
 * All read-only — editing stays in the drawer/fork, never inline on the card.
 */

import type { CSSProperties, ReactNode } from "react";
import type { Dur, Event, Min, State, TimingType, UnstartedTask } from "@maxtellar/core";
import { pomodoroView, runningView } from "@maxtellar/core";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fmtAbs, fmtDur } from "../time";
import { useSettings } from "../settings";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
}

/** §3.11/§6 layered reorder: a sortable wrapper giving each top-level unstarted
 * card a drag handle (dnd-kit) + ▲▼ priority arrows. Dragging/tapping is an
 * explicit priority override → RERANK → resettle ripple → time-order reactivates
 * (so the card is NOT pinned where dropped; it re-sorts by its new placement). */
function SortableCard({ id, canRaise, canLower, onRaise, onLower, children }: {
  id: string;
  canRaise: boolean;
  canLower: boolean;
  onRaise: () => void;
  onLower: () => void;
  children: ReactNode;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="reorderable-row">
      <div className="reorder-controls">
        <button type="button" className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reprioritize" data-tip="Drag to reprioritize">⋮⋮</button>
        <button type="button" className="reorder-arrow" disabled={!canRaise} onClick={onRaise} aria-label="Raise priority" data-tip="Raise priority">▲</button>
        <button type="button" className="reorder-arrow" disabled={!canLower} onClick={onLower} aria-label="Lower priority" data-tip="Lower priority">▼</button>
      </div>
      {children}
    </div>
  );
}

/** Padlock on a non-slideable card (2026-07-13): neutral, text-sized, sits
 * right after the title. Absence = slideable — only the immovable is marked. */
function LockIcon(): JSX.Element {
  return (
    <svg
      className="lock-icon"
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Not slideable"
    >
      <title>Not slideable</title>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** English ordinal with suffix: 2 → "2nd", 3 → "3rd", 11 → "11th". */
function ordinalWord(k: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = k % 100;
  return `${k}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Substate label + hue key for an unstarted task's timing type. */
const TIMING_LABEL: Record<TimingType, string> = {
  fixed: "Fixed",
  "semi-head": "Semi-head",
  "semi-tail": "Semi-tail",
  budgeted: "Budgeted",
  unscheduled: "Unscheduled",
};

const TIMING_HUE: Record<TimingType, string> = {
  fixed: "fixed",
  "semi-head": "semi",
  "semi-tail": "semi",
  budgeted: "budgeted",
  unscheduled: "unscheduled",
};

/** A paused remainder's prior segments: history occupancy entries whose taskId
 * follows the reducer's pause lineage — each pause appends "-rem" to the id
 * (X → X-rem → X-rem-rem), so stripping suffixes walks back to the origin. */
function pauseLineage(remainderOf: string): string[] {
  const ids: string[] = [];
  let cur: string | undefined = remainderOf;
  while (cur !== undefined) {
    ids.push(cur);
    cur = cur.endsWith("-rem") ? cur.slice(0, -4) : undefined;
  }
  return ids;
}

/** Spent so far + the pause moment (last segment's end) for a remainder. */
function lineageTotals(state: State, remainderOf: string): { spent: Dur; pausedAt: Min } {
  const ids = new Set(pauseLineage(remainderOf));
  let spent = 0;
  let pausedAt = 0;
  for (const h of state.history) {
    if (h.kind !== "occupancy" || h.taskId === null || !ids.has(h.taskId)) continue;
    spent += h.channels.spent;
    if (h.end > pausedAt) pausedAt = h.end;
  }
  return { spent, pausedAt };
}

/** Single-word lifecycle state (no category/substate split): one of
 * Planned / Running / Overrun / Paused. A composed parent shows its active
 * leaf's state, not a state of its own. */
function Capsule({ label, hue }: { label: string; hue: string }): JSX.Element {
  return (
    <span className="state-capsule" data-hue={hue}>
      <span className="cap-cat">{label}</span>
    </span>
  );
}

function Field({ label, value, floating }: { label: string; value: string | null; floating?: boolean }): JSX.Element {
  return (
    <div className="cf-group">
      <span className="cf-label">{label}</span>
      {value === null ? (
        <span className="cf-value cf-empty">—</span>
      ) : (
        <span className={`cf-value num${floating ? " cf-floating" : ""}`}>
          {floating && "~"}
          {value}
        </span>
      )}
    </div>
  );
}

export function Pipeline({ state, dispatch }: Props): JSX.Element {
  const rv = runningView(state);
  const pv = pomodoroView(state);
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const abs = (m: Min): string => fmtAbs(m, { now: state.now, hour12 });

  // §2.7 (G24): a parent (a task named by another's parentId) is a derived
  // bracket — it groups its leaves rather than occupying the spine itself. A
  // running leaf's ancestors stay brackets even with no plan child (so a
  // decomposed task never shows as a plain startable card while its leaf runs).
  const parentIds = new Set<string>();
  for (const i of state.plan) if (i.kind === "task" && i.parentId) parentIds.add(i.parentId);
  const runningAncestors = new Set<string>();
  let rpid = state.running?.parentId;
  while (rpid) {
    parentIds.add(rpid);
    runningAncestors.add(rpid);
    rpid = (state.plan.find((i) => i.id === rpid) as UnstartedTask | undefined)?.parentId;
  }
  const isParentId = (id: string): boolean => parentIds.has(id);
  const childrenOf = (id: string): UnstartedTask[] =>
    state.plan
      .filter((i): i is UnstartedTask => i.kind === "task" && i.parentId === id)
      .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  const startOf = (id: string): number | undefined =>
    state.placements.find((p) => p.itemId === id)?.parts[0]?.start;

  // The running task's subtask identity (if it's a leaf): its live ordinal is
  // subtaskCount − remaining-plan-leaves, and the parent's title.
  const runParent = state.running?.parentId
    ? (state.plan.find((i) => i.id === state.running!.parentId) as UnstartedTask | undefined)
    : undefined;
  const runSub = runParent
    ? { ordinal: Math.max(1, (runParent.subtaskCount ?? 1) - childrenOf(runParent.id).length), parentTitle: runParent.title }
    : undefined;

  // Top-level entries (no parent) in TIME order — mirrors the timeline. Each
  // parent expands into its leaves (rank order) nested one level deeper, and
  // each leaf carries its 1-based subtask ordinal within the parent.
  const topLevel = state.plan.filter((i) => !(i.kind === "task" && i.parentId));
  type Node =
    | { kind: "card"; item: UnstartedTask; depth: number; idx: number; ordinal?: number; parentTitle?: string }
    | { kind: "bracket"; item: UnstartedTask; depth: number }
    | { kind: "gap"; item: { id: string; budget: number }; depth: number };
  const nodes: Node[] = [];
  // Pipeline index: the running card is #1; EVERY unstarted card — standalone OR
  // subtask leaf — consumes the next number (so a task after a 2-subtask
  // composition is #3, not #1). Gaps and bracket headers take no number. A leaf
  // ALSO carries its live subtask ordinal + parent title for the "Subtask # N
  // of <Parent>" label.
  let idx = state.running ? 1 : 0;
  const walk = (item: (typeof topLevel)[number], depth: number, ordinal?: number, parentTitle?: string): void => {
    if (item.kind === "gap") {
      nodes.push({ kind: "gap", item, depth });
      return;
    }
    if (isParentId(item.id)) {
      const kids = childrenOf(item.id);
      // While the sole leaf runs the parent has no plan child — the running
      // card in "Now" stands in for it, so show nothing here. It reappears
      // (composed) the moment a leaf returns to the plan (e.g. on pause).
      if (kids.length === 0) return;
      nodes.push({ kind: "bracket", item, depth });
      // Live ordinals renumber contiguously (subtaskCount shrinks on cancel).
      const base = (item.subtaskCount ?? kids.length) - kids.length + 1;
      kids.forEach((c, kk) => walk(c, depth + 1, base + kk, item.title));
      return;
    }
    idx += 1;
    if (ordinal !== undefined) nodes.push({ kind: "card", item, depth, idx, ordinal, parentTitle: parentTitle ?? "" });
    else nodes.push({ kind: "card", item, depth, idx });
  };
  for (const item of [...topLevel].sort((a, b) => {
    const sa = startOf(a.id);
    const sb = startOf(b.id);
    if (sa === undefined && sb === undefined) return 0;
    if (sa === undefined) return 1;
    if (sb === undefined) return -1;
    return sa - sb;
  })) {
    walk(item, 0);
  }

  // §3.11/§6 layered reorder. Reorderable units = TOP-LEVEL standalone unstarted
  // cards (not the running card, not gaps, not composed brackets or their nested
  // leaves — composition reordering is a later slice). Arrows step one rank in
  // RANK order; drag drops set the rank to the drop's visual intent. Both →
  // RERANK → resettle ripple (§3.13), then the list re-sorts by TIME.
  const byRank = (a: UnstartedTask, b: UnstartedTask): number => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);
  const reorderables = state.plan.filter(
    (i): i is UnstartedTask => i.kind === "task" && !i.parentId && !isParentId(i.id),
  );
  const rankOrder = [...reorderables].sort(byRank);
  const rankPos = new Map(rankOrder.map((t, i) => [t.id, i] as const));
  // Display (time) order of the reorderable ids — the SortableContext order.
  const reorderIds = nodes.filter((n) => n.kind === "card" && n.depth === 0).map((n) => n.item.id);
  const raise = (taskId: string): void => {
    const i = rankPos.get(taskId);
    if (i === undefined || i <= 0) return;
    dispatch({ type: "RERANK", taskId, afterId: i >= 2 ? rankOrder[i - 2]!.id : null });
  };
  const lower = (taskId: string): void => {
    const i = rankPos.get(taskId);
    if (i === undefined || i >= rankOrder.length - 1) return;
    dispatch({ type: "RERANK", taskId, afterId: rankOrder[i + 1]!.id });
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = reorderIds.indexOf(active.id as string);
    const newIndex = reorderIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(reorderIds, oldIndex, newIndex);
    const pos = moved.indexOf(active.id as string);
    dispatch({ type: "RERANK", taskId: active.id as string, afterId: pos > 0 ? moved[pos - 1]! : null });
  };

  /** One unstarted-task card (leaf or standalone). Indented by `depth`. EVERY
   * card shows the pipeline #idx; a leaf ALSO shows a "Subtask # N of <Parent>"
   * label after its title. */
  const renderCard = (t: UnstartedTask, depth: number, badgeIdx: number, ordinal?: number, parentTitle?: string): JSX.Element => {
    const placement = state.placements.find((p) => p.itemId === t.id);
    const parts = placement?.parts ?? [];
    const first = parts[0];
    const last = parts[parts.length - 1];
    const isRemainder = t.remainderOf !== undefined;
    const start = t.anchorStart ?? first?.start;
    const end = t.anchorEnd ?? last?.end;
    const totals = isRemainder ? lineageTotals(state, t.remainderOf as string) : null;
    const spent = totals ? totals.spent : 0;
    const originalBudget = t.budget !== undefined ? t.budget + spent : undefined;
    return (
      <div
        key={t.id}
        className={`card${depth > 0 ? " subtask-leaf" : ""}`}
        data-state={TIMING_HUE[t.timing]}
        style={depth > 0 ? { marginLeft: depth * 18 } : undefined}
      >
        <div className="row">
          <span className="pipe-idx num">#{badgeIdx}</span>
          <span className="title">
            {t.title}
            {ordinal !== undefined && (
              <span className="subtask-suffix"> — Subtask # {ordinal} of {parentTitle}</span>
            )}
          </span>
          {!t.slideable && <LockIcon />}
          <span className="badge head-badge">
            {t.activityId ? `${t.activityId} · ${t.headId}` : t.headId}
          </span>
          {t.ommf && <span className="badge">ommf</span>}
          <span className="badge" data-timing={t.timing}>{TIMING_LABEL[t.timing]}</span>
          <Capsule
            label={isRemainder ? "Paused" : "Planned"}
            hue={isRemainder ? "paused" : TIMING_HUE[t.timing]}
          />
        </div>
        <div className="card-fields">
          <Field
            label={isRemainder ? "Restart" : "Start"}
            value={start !== undefined ? abs(start) : null}
            floating={start !== undefined && t.anchorStart === undefined}
          />
          <Field
            label="End"
            value={end !== undefined ? abs(end) : null}
            floating={end !== undefined && t.anchorEnd === undefined}
          />
          <Field label="Budget" value={originalBudget !== undefined ? fmtDur(originalBudget) : "open"} />
          <Field label="Spent" value={fmtDur(spent)} />
          <Field label="Remaining" value={t.budget !== undefined ? fmtDur(t.budget) : null} />
          {totals && totals.pausedAt > 0 && (
            <Field label="Paused" value={fmtDur(Math.max(0, state.now - totals.pausedAt))} />
          )}
        </div>
        {(first === undefined || parts.length > 1 || (placement && placement.squeezedDeficit > 0)) && (
          <div className="meta num">
            {first === undefined && "unplaced"}
            {parts.length > 1 && `${parts.length} parts`}
            {placement && placement.squeezedDeficit > 0 &&
              `${parts.length > 1 ? " · " : ""}squeezed ${placement.squeezedDeficit}m`}
          </div>
        )}
        <div className="actions">
          <button className="primary" onClick={() => dispatch({ type: "START_TASK", taskId: t.id })}>
            Start
          </button>
          <button className="cancel-accent" onClick={() => dispatch({ type: "CANCEL_TASK", taskId: t.id })}>Cancel</button>
        </div>
      </div>
    );
  };

  /** A parent bracket header: title, head, the spanned window, the zero-sum
   * budget (Σ leaves) and a Start (→ first leaf) / Cancel (whole tree). */
  const renderBracket = (t: UnstartedTask, depth: number): JSX.Element => {
    const placement = state.placements.find((p) => p.itemId === t.id);
    const span = placement?.parts[0];
    const kids = childrenOf(t.id);
    // Start-button label names the exact leaf it will start (§2.7 feedback):
    // "first", "2nd", "3rd", … "2nd last", "last". Remaining leaves are always
    // a suffix, so the next leaf's front ordinal k = subtaskCount − remaining+1.
    const n = t.subtaskCount ?? kids.length;
    const k = n - kids.length + 1;
    const startLabel =
      n <= 1 ? "Start"
      : k >= n ? "Start last"
      : k === 1 ? "Start first"
      : k === n - 1 ? "Start 2nd last"
      : `Start ${ordinalWord(k)}`;
    // A composed parent has no state of its own — it shows the state of its
    // active leaf: a running descendant → Running/Overrun; else a paused
    // remainder among the leaves → Paused; else Planned.
    const composed: { label: string; hue: string } = runningAncestors.has(t.id)
      ? rv?.overrun
        ? { label: "Overrun", hue: "overrun" }
        : { label: "Running", hue: "running" }
      : kids.some((c) => c.remainderOf !== undefined)
        ? { label: "Paused", hue: "paused" }
        : { label: "Planned", hue: "budgeted" };
    return (
      <div
        key={t.id}
        className="subtask-bracket-head"
        style={depth > 0 ? { marginLeft: depth * 18 } : undefined}
      >
        <div className="row">
          <span className="title">{t.title}</span>
          <span className="badge head-badge">{t.activityId ? `${t.activityId} · ${t.headId}` : t.headId}</span>
          <span className="badge composed-badge">Composed</span>
          <span className="badge" data-timing="budgeted">{kids.length} subtask{kids.length === 1 ? "" : "s"}</span>
          <Capsule label={composed.label} hue={composed.hue} />
        </div>
        <div className="card-fields">
          <Field label="Start" value={span ? abs(span.start) : null} />
          <Field label="End" value={span ? abs(span.end) : null} />
          <Field label="Budget" value={t.budget !== undefined ? fmtDur(t.budget) : "open"} />
        </div>
        <div className="actions">
          <button className="primary" onClick={() => dispatch({ type: "START_TASK", taskId: t.id })}>
            {startLabel}
          </button>
          <button className="cancel-accent" onClick={() => dispatch({ type: "CANCEL_TASK", taskId: t.id })}>Cancel</button>
        </div>
      </div>
    );
  };

  return (
    <div className="pipeline">
      <h2>Now</h2>
      {state.running && rv ? (
        <div className="card running" data-state={rv.overrun ? "overrun" : "running"}>
          <div className="row">
            <span className="pipe-idx num">
              <span className={`live-dot${rv.overrun ? " overrun" : ""}`} aria-label="Task is live" />
              #1
            </span>
            <span className="title">
              {state.running.title}
              {runSub && (
                <span className="subtask-suffix"> — Subtask # {runSub.ordinal} of {runSub.parentTitle}</span>
              )}
            </span>
            <span className="badge head-badge">
              {state.running.activityId ? `${state.running.activityId} · ${state.running.headId}` : state.running.headId}
            </span>
            {state.running.ommf && <span className="badge">ommf</span>}
            <span className="badge" data-timing={state.running.timing}>
              {TIMING_LABEL[state.running.timing]}
            </span>
            <Capsule
              label={rv.overrun ? "Overrun" : "Running"}
              hue={rv.overrun ? "overrun" : "running"}
            />
            {pv && (
              <span className="badge pomo-badge" data-phase={pv.phase} data-tip={`Pomodoro · interval ${pv.cycle + 1}`}>
                🍅 {pv.phase === "work" ? "Work" : pv.phase === "longBreak" ? "Long break" : "Break"} {pv.due ? "· due" : fmtDur(Math.max(0, pv.phaseLen - pv.phaseElapsed))}
              </span>
            )}
          </div>
          <div className="card-fields">
            <Field label="Started" value={abs(state.running.startedAt)} />
            {rv.mode === "countdown" ? (
              <>
                {/* Upright/~ is a property of the COORDINATE, not lifecycle:
                    a fixed/semi-tail runner's end is its anchor — an exact
                    fact (in overrun it rides `now`, still exact). Only a
                    budgeted runner's projected end is a presumption. */}
                <Field
                  label="Ends"
                  value={abs(rv.projectedEnd)}
                  floating={
                    state.running.timing !== "fixed" && state.running.timing !== "semi-tail"
                  }
                />
                <Field label="Budget" value={fmtDur(state.running.budget ?? 0)} />
                <Field label="Spent" value={fmtDur(state.running.channels.spent)} />
                {pv && <Field label="Breaks" value={fmtDur(state.running.channels.breaks)} />}
                <Field label="Remaining" value={fmtDur(rv.remaining)} />
              </>
            ) : (
              <>
                {/* open/stopwatch: the tail rides `now` — Spent IS the meter */}
                <Field label="Ends" value={null} />
                <Field label="Budget" value="open" />
                <Field label="Spent" value={fmtDur(state.running.channels.spent)} />
                <Field label="Remaining" value={null} />
              </>
            )}
          </div>
          <div className="actions">
            {state.running.channels.wasted > 0 && (
              <span className="wasted-badge">
                Wasted <strong className="num">{fmtDur(state.running.channels.wasted)}</strong>
              </span>
            )}
            <button onClick={() => dispatch({ type: "PAUSE_RUNNING" })}>Pause</button>
            <button className="primary" onClick={() => dispatch({ type: "COMPLETE_RUNNING" })}>
              Complete
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <span className="meta">nothing running — start a task below</span>
        </div>
      )}

      <h2>Up next</h2>
      {/* Cards follow TIME order (first placed part), mirroring the timeline.
          §2.7 (G24): a parent renders as a bracket header with its leaves
          nested one level deeper; only leaves/standalones carry an index.
          §3.11/§6: top-level standalone cards are drag+arrow reorderable. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={reorderIds} strategy={verticalListSortingStrategy}>
          {nodes.map((n) =>
            n.kind === "gap" ? (
              <div key={n.item.id} className="gap-spacer" title={`buffer ${n.item.budget}m`} />
            ) : n.kind === "bracket" ? (
              renderBracket(n.item, n.depth)
            ) : n.depth === 0 ? (
              <SortableCard
                key={n.item.id}
                id={n.item.id}
                canRaise={(rankPos.get(n.item.id) ?? 0) > 0}
                canLower={(rankPos.get(n.item.id) ?? 0) < rankOrder.length - 1}
                onRaise={() => raise(n.item.id)}
                onLower={() => lower(n.item.id)}
              >
                {renderCard(n.item, n.depth, n.idx, n.ordinal, n.parentTitle)}
              </SortableCard>
            ) : (
              renderCard(n.item, n.depth, n.idx, n.ordinal, n.parentTitle)
            ),
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
}
