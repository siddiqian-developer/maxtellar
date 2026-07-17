/**
 * The Week Plan / Calendar 7-column grid (§4.4/§4.6), rendered by react-big-calendar
 * (adopted 2026-07-16 — see the §7.0.4 named-decisions table).
 *
 * RBC ONLY RENDERS. Placement authority stays with core `settle` via `weekPreview`;
 * nothing here computes a time.
 *
 * Week Plan mode ADDS gcal-style authoring gestures (2026-07-17) — but they do not
 * bend that rule. A gesture is an INPUT: this file reports the raw observed values
 * (weekday, minutes-into-day) and dispatches nothing; the caller authors an anchor,
 * core re-settles, and the block re-renders from the new `events`. A block may
 * therefore land somewhere other than where the mouse was released (squeezed, or the
 * 24h wall) — that snap is correct, and the caller notifies. RBC's addon is safe here
 * precisely because it drops its own drag state (`reset()`) BEFORE firing `onEnd`, so
 * it never holds a competing opinion about placement.
 * Calendar mode keeps every gesture off.
 *
 * Two things this file must get right, both from §4.1 (day = Sleep-start → Sleep-start):
 *  1. The grid is WALL-CLOCK truth with our sleep-cycle days laid OVER it. A head sleep
 *     starts on the previous calendar column and runs into the day it heads, so a block
 *     crossing midnight legitimately SPANS two columns (`showMultiDayTimes`), and one
 *     column legitimately shows two cycles' material (last night's tail in the morning,
 *     tomorrow's head at night — they never overlap). RBC's default all-day banner row is
 *     forbidden (`allDayAccessor={() => false}`): it would strip the day's head sleep off
 *     the time axis entirely.
 *  2. The working-day number (§4.4b) sits on the column where the user WAKES.
 */
import { useEffect, useRef, useState } from "react";
import { Calendar, dayjsLocalizer, type Event } from "react-big-calendar";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import dayjs from "dayjs";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { fmtTod } from "../time";
import { weekendRun, workingDayLabel, workingDayNumber } from "../workingDays";
import type { WeekBlock, WeekPreview } from "../weekPreview";

// RBC cannot run without a localizer built on a date library; the app has none by
// design (it speaks epoch minutes, §7.0.2). dayjs is the lightest of the five RBC
// supports and is already one of its dependencies. It is used ONLY for RBC's own
// chrome — never for the app's parsing/formatting, which stays `casualTime`/`time.ts`.
const localizer = dayjsLocalizer(dayjs);

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface BlockEvent extends Event {
  start: Date;
  end: Date;
  block: WeekBlock;
  /** local-midnight epoch-minute of the column this block BELONGS to (§4.6 edits
   * target the owning column, which is not always the column it draws in). */
  date: number;
}

// Wrapped ONCE at module scope: doing this inside the component would remount the
// whole calendar on every render (losing scroll and any in-flight drag).
const DnDCalendar = withDragAndDrop<BlockEvent>(Calendar as never);

/**
 * weekPreview blocks → RBC events. Each block's minutes-into-day are relative to the
 * column that OWNS it; `end` may exceed 1440 (a head sleep running past midnight), and
 * that is exactly what produces the correct cross-column span.
 */
export function toEvents(preview: WeekPreview): BlockEvent[] {
  const out: BlockEvent[] = [];
  for (const day of preview.days) {
    for (const b of day.blocks) {
      out.push({
        title: b.title,
        start: new Date((day.date + b.start) * 60000),
        end: new Date((day.date + b.end) * 60000),
        block: b,
        date: day.date,
      });
    }
  }
  return out;
}

interface Props {
  preview: WeekPreview;
  /** local-midnight epoch-minute of the first column. */
  weekStart: number;
  weekendDays: number[];
  offDays: number[];
  hour12: boolean;
  /** local-midnight epoch-minute of today, for the today marker. */
  today: number;
  mode: "week" | "calendar";
  height: number;
  /** §4.4 mid-week structural lock — gestures render but stay inert (Stage 4). */
  locked?: boolean;
  onBlockClick: (date: number, block: WeekBlock) => void;
  onAddDated: (date: number) => void;
  /** Week Plan authoring gestures. All three report RAW observed values — the grid
   * never snaps, clamps, or judges legality; that is the caller's + core's job. */
  onSlotSelect?: (weekdays: number[], startTod: number, endTod: number, isClick: boolean) => void;
  onBlockResize?: (date: number, block: WeekBlock, endTod: number) => void;
  onBlockMove?: (date: number, block: WeekBlock, startTod: number, toWeekday: number) => void;
  /** Horizontal edge-resize (§4.4): the block was dragged to cover `addDays` extra
   * weekdays. A template block extends its `weekdays`; a DATED block is PROMOTED to a
   * template on its own day + `addDays`. The caller notifies for OFF-day adds and gates
   * on the lock (via Urgent). `fromWeekday` is the block's own day. */
  onBlockExtendDays?: (block: WeekBlock, fromWeekday: number, addDays: number[]) => void;
  /** While the Add-template drawer is open on a fresh slot-select, the caller feeds the
   * drawer's LIVE values back here so the on-calendar selection mark tracks the edits
   * (weekdays, time, title). Null when no such drawer is open. */
  selection?: { weekdays: number[]; startTod: number; endTod: number; title?: string } | null;
}

export function WeekGridRBC({
  preview, weekStart, weekendDays, offDays, hour12, today, mode, height, locked = false,
  onBlockClick, onAddDated, onSlotSelect, onBlockResize, onBlockMove, onBlockExtendDays, selection,
}: Props): JSX.Element {
  const events = toEvents(preview);
  // §4.4a: the weekend RUN (weekendDays grown through adjacent OFF days) is what
  // "weekend" means everywhere below — tint included.
  const run = weekendRun(weekendDays, offDays);

  // Which weekdays each template already fires on (derived from the preview: it places
  // a block on every weekday the template recurs). Drives the horizontal edge-resize
  // feasibility — a block may be extended onto an adjacent weekday only if that day is
  // not already in the set and not an OFF day (a template never fires on OFF).
  const templateWeekdays = new Map<string, Set<number>>();
  for (const day of preview.days) {
    for (const bl of day.blocks) {
      if (bl.dated) continue;
      (templateWeekdays.get(bl.templateId) ?? templateWeekdays.set(bl.templateId, new Set()).get(bl.templateId)!).add(day.weekday);
    }
  }
  /** The neighbour weekday on `side` of `wd` this block can be extended onto, or null
   * only when REALISTICALLY IMPOSSIBLE (§1.4 "input is sacred; never say no unless
   * impossible"). The only impossibilities: the edge of the week, or the neighbour is
   * already occupied by THIS template. An OFF-day neighbour is allowed (added + notify,
   * stays dormant while OFF); a locked week is allowed (routes via Urgent) — neither
   * hides the handle. For a DATED block, occupancy of its own template doesn't apply;
   * only edge-of-week blocks it (extending promotes it to a template). */
  const addableNeighbor = (block: WeekBlock, wd: number, side: "left" | "right"): number | null => {
    if (mode !== "week") return null;
    const next = side === "left" ? wd - 1 : wd + 1;
    if (next < 0 || next > 6) return null; // edge of the week — genuinely impossible
    if (!block.dated && templateWeekdays.get(block.templateId)?.has(next)) return null; // already there
    return next;
  };
  const dayMin = (d: Date): number => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 60000);

  // The vertical window (§4.6) — RBC reads only the TIME off these Dates.
  const at = (min: number): Date => new Date(2000, 0, 1, Math.floor(min / 60), min % 60);
  const min = at(preview.winStart);
  const max = preview.winEnd >= 1440 ? new Date(2000, 0, 1, 23, 59, 59) : at(preview.winEnd);

  /** Column head: weekday · date · the FULL working-day label (§4.4b) · + add. */
  const Header = ({ date }: { date: Date }): JSX.Element => {
    const d = dayMin(date);
    const wd = date.getDay();
    const n = workingDayNumber(wd, weekendDays, offDays);
    const label = workingDayLabel(n);
    // §4.4a: an OFF day adjacent to the weekend IS weekend — so the tint follows the
    // RUN, not the raw `weekendDays` setting ("count them as weekend", incl. styling).
    const isWeekend = run.has(wd);
    const isOff = offDays.includes(wd);
    return (
      <div className={`wk-col-head${d === today ? " today" : ""}${isWeekend ? " weekend" : ""}${isOff ? " off" : ""}`}>
        <span className="wk-col-wd">{WD[wd]}</span>
        <span className="wk-col-date num">
          {date.getDate() === 1 || wd === 0 ? `${MONTHS[date.getMonth()]} ` : ""}{date.getDate()}
        </span>
        {/* §4.4b: written in full, never abbreviated. Off/weekend columns carry none. */}
        <span className="wk-col-wdn">{label ?? ""}</span>
        {mode === "calendar" && (
          <button className="wk-col-add" aria-label={`Add activity on ${WD[wd]}`}
            data-tip="Add a one-off activity on this day"
            onClick={(e) => { e.stopPropagation(); onAddDated(d); }}>+</button>
        )}
      </div>
    );
  };

  const gesturesOn = mode === "week" && !locked;
  const wrapRef = useRef<HTMLDivElement>(null);
  /** The live drag-selection (§4.4 feature 2), fully hand-rolled — this owns BOTH axes
   * across ALL swept columns and computes its own times, rather than mirroring RBC's
   * transient drag-ghost (which can't persist past mouseup or reflect drawer edits).
   * `weekdays` are the columns; start/endTod the span. */
  const [sweep, setSweep] = useState<{ weekdays: number[]; startTod: number; endTod: number } | null>(null);
  // The live drag-direction cursor (↔ / ↕ / ⤢ ⤡). Inline so it beats CSS hover rules.
  const [sweepCursor, setSweepCursor] = useState<string | null>(null);
  const sweepRef = useRef<{ x0: number; y0: number; anchorTod: number } | null>(null);
  // Horizontal edge-resize in flight: the grabbed block + which side, and the live set
  // of extra weekdays the pointer has crossed onto. Separate from the empty-slot sweep.
  const hResizeRef = useRef<{ block: WeekBlock; fromWd: number; side: "left" | "right" } | null>(null);
  const [hAddDays, setHAddDays] = useState<number[]>([]);
  // Once the drawer owns the mark (`selection` set), drop the transient drag `sweep`.
  useEffect(() => { if (selection) setSweep(null); }, [selection]);

  /** Which day columns the sweep's x-range covers, as weekdays. RBC's own select is
   * per-DayColumn (its `_selectSlot` lives there) and can never report a column SET —
   * that gap is the only reason this hand-rolled layer exists (§7.0.4). */
  const weekdaysBetween = (xa: number, xb: number): number[] => {
    const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    const out: number[] = [];
    wrapRef.current?.querySelectorAll<HTMLElement>(".rbc-day-slot").forEach((col, i) => {
      const r = col.getBoundingClientRect();
      // Columns are always Sun…Sat from a Sunday (`columnsFrom`), so index IS weekday.
      // Overlap, not containment: clipping either edge still counts that day in.
      if (r.right > lo && r.left < hi) out.push(i);
    });
    return out;
  };
  /** Minutes-into-day of `d` RELATIVE to the column that owns the block (`ownerDate`).
   * Not `getHours()*60`: a block dragged onto the next calendar column (or a head sleep
   * past midnight) must read as >1440 against its owner, which is what core anchors on. */
  const todFor = (d: Date, ownerDate: number): number => Math.round(d.getTime() / 60000) - ownerDate;

  /** A client-Y → grid slot boundary. `dir:"near"` snaps to the nearest slot (the
   * selection's START); `dir:"far"` snaps to the next boundary below the pointer (the
   * END is inclusive of the pointer's slot). Clamped to the window. */
  const yToTod = (clientY: number, dir: "near" | "far"): number => {
    const slot = wrapRef.current?.querySelector<HTMLElement>(".rbc-day-slot")?.getBoundingClientRect();
    if (!slot) return preview.winStart;
    const span = preview.winEnd - preview.winStart;
    const frac = Math.min(1, Math.max(0, (clientY - slot.top) / slot.height));
    const snap = dir === "near" ? Math.round : Math.ceil;
    return preview.winStart + snap((frac * span) / 60) * 60;
  };

  /** The weekday (column index) under `clientX`, or null if outside the grid columns. */
  const columnAt = (clientX: number): number | null => {
    const cols = [...(wrapRef.current?.querySelectorAll<HTMLElement>(".rbc-day-slot") ?? [])];
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i]!.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return i;
    }
    return null;
  };

  /** The block on `weekday` belonging to `templateId` (dated blocks store the DatedTask
   * id in templateId, §weekPreview). Used to recover the grabbed block from the handle. */
  const eventFor = (templateId: string, weekday: number): WeekBlock | null => {
    for (const day of preview.days) {
      if (day.weekday !== weekday) continue;
      const hit = day.blocks.find((bl) => bl.templateId === templateId);
      if (hit) return hit;
    }
    return null;
  };

  // The overlay owns EVERY empty-slot gesture (RBC's own select is off). Press records
  // the anchor; move grows the mark; up hands it to the drawer.
  const onGridPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    // Horizontal edge-resize grab — checked FIRST and NOT gated on `!locked` (a locked
    // week is overridable, not impossible; the write routes through Urgent downstream).
    const grab = (e.target as HTMLElement).closest<HTMLElement>(".wk-ev-hgrab");
    if (grab && mode === "week") {
      const found = eventFor(grab.dataset.tpl!, Number(grab.dataset.wd));
      if (found) {
        hResizeRef.current = { block: found, fromWd: Number(grab.dataset.wd), side: grab.dataset.side as "left" | "right" };
        setHAddDays([]);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
    if (!gesturesOn) return;
    if ((e.target as HTMLElement).closest(".rbc-event")) return; // blocks are move/resize
    if (!(e.target as HTMLElement).closest(".rbc-day-slot")) return;
    sweepRef.current = { x0: e.clientX, y0: e.clientY, anchorTod: yToTod(e.clientY, "near") };
  };

  const DRAG_INTENT = 4; // px in any direction before a press becomes a drag

  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    // Horizontal edge-resize in flight: the extra weekdays are every column strictly
    // BETWEEN the block's own day and the pointer's column, on the grabbed side.
    const h = hResizeRef.current;
    if (h) {
      const col = columnAt(e.clientX);
      if (col === null) return;
      const lo = Math.min(h.fromWd, col), hi = Math.max(h.fromWd, col);
      const add: number[] = [];
      for (let d = lo; d <= hi; d++) if (d !== h.fromWd) add.push(d);
      setHAddDays(add);
      return;
    }
    const s = sweepRef.current;
    if (!s) return;
    if (!sweep && Math.abs(e.clientX - s.x0) < DRAG_INTENT && Math.abs(e.clientY - s.y0) < DRAG_INTENT) return;
    // Weekdays = every column the x-range touches (1 for a vertical drag, N for a sweep).
    // Span: press anchors one edge (near), pointer drives the other (far/inclusive),
    // ordered so an upward drag still yields start<end, one-slot minimum.
    const weekdays = weekdaysBetween(s.x0, e.clientX);
    const a = Math.min(s.anchorTod, yToTod(e.clientY, "near"));
    const b = Math.max(s.anchorTod + 60, yToTod(e.clientY, "far"));
    setSweep({ weekdays, startTod: a, endTod: b });
    // Cursor reflects what the selection ACTUALLY spans, not raw pixel drift: across =
    // more than one column swept; down = more than one slot of time. (Pixel deltas made
    // a straight-down drag read "diagonal" on the tiniest x-jitter.) Only a genuine
    // multi-column AND multi-slot selection is diagonal; the corner follows the sweep's
    // real x-direction and whether time grows down or up from the anchor row.
    const across = weekdays.length > 1;
    const down = b - a > 60;
    const rightward = e.clientX >= s.x0;
    const growingDown = yToTod(e.clientY, "near") >= s.anchorTod;
    setSweepCursor(
      across && down ? (rightward === growingDown ? "nwse-resize" : "nesw-resize")
      : across ? "ew-resize"
      : "ns-resize",
    );
  };

  const onGridPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    // Finish a horizontal edge-resize: hand the extra weekdays to the caller (which
    // extends the template or promotes a dated one-off, notifies for OFF days, and gates
    // the lock via Urgent). No columns crossed → a no-op.
    const h = hResizeRef.current;
    if (h) {
      hResizeRef.current = null;
      const add = hAddDays;
      setHAddDays([]);
      if (add.length) onBlockExtendDays?.(h.block, h.fromWd, add);
      return;
    }
    const s = sweepRef.current;
    sweepRef.current = null;
    setSweepCursor(null);
    if (!s) return;
    // A drag (armed → `sweep` set) hands its swept weekdays+span to the drawer. A plain
    // click (never armed) opens the drawer on that one column with a default span, which
    // the caller floors to 30m. Either way the drawer then OWNS the on-calendar mark
    // (via `selection`), so it live-updates on edit and clears on close.
    if (sweep) {
      if (sweep.weekdays.length) onSlotSelect?.(sweep.weekdays, sweep.startTod, sweep.endTod, false);
      else setSweep(null);
    } else {
      const wds = weekdaysBetween(e.clientX, e.clientX);
      if (wds.length) onSlotSelect?.(wds, s.anchorTod, s.anchorTod + 60, true);
    }
  };

  const handleResize = ({ event, end }: EventInteractionArgs<BlockEvent>): void => {
    onBlockResize?.(event.date, event.block, todFor(new Date(end), event.date));
  };

  const handleDrop = ({ event, start }: EventInteractionArgs<BlockEvent>): void => {
    const s = new Date(start);
    // The two axes are reported INDEPENDENTLY, which means `startTod` must be measured
    // against the column the block LANDED in — not its original owner. Measured against
    // the owner, a same-time Wed→Thu drop would read as +1440 and be indistinguishable
    // from "24h later", and the caller would retime a block that only changed weekday.
    onBlockMove?.(event.date, event.block, todFor(s, dayMin(s)), s.getDay());
  };

  const EventCell = ({ event }: { event: BlockEvent }): JSX.Element => {
    const b = event.block;
    const tod = (m: number): string => fmtTod(((m % 1440) + 1440) % 1440, hour12);
    const tip = `${b.dated ? "◆ " : ""}${b.title} · ${tod(b.start)}–${tod(b.end)}`
      + `${b.squeezed > 0 ? " · squeezed" : ""}`
      + `${mode === "calendar" && !b.dated ? " · click to skip/move" : ""}`;
    // Horizontal edge-resize (Week Plan): a handle shows on a side whenever extending
    // there is realistically possible — only edge-of-week or an already-occupied
    // neighbour hides it (§1.4). A template block extends its weekdays; a DATED block
    // promotes to a template. OFF-day and locked-week are allowed (handled on drop).
    const wd = new Date(event.date * 60000).getDay();
    const canLeft = addableNeighbor(b, wd, "left") !== null;
    const canRight = addableNeighbor(b, wd, "right") !== null;
    return (
      <div className="wk-ev-in" data-tip={tip}>
        <span className="wk-block-title">{b.dated ? "◆ " : ""}{b.title}</span>
        <span className="wk-block-time num">{tod(b.start)}</span>
        {canLeft && <span className="wk-ev-hgrab left" data-side="left" data-tpl={b.templateId} data-wd={wd} />}
        {canRight && <span className="wk-ev-hgrab right" data-side="right" data-tpl={b.templateId} data-wd={wd} />}
      </div>
    );
  };

  return (
    <div
      ref={wrapRef}
      className={`wk-rbc${mode === "week" && locked ? " locked" : ""}${gesturesOn ? " gestures" : ""}${sweep ? " sweeping" : ""}`}
      style={{ height, ...(sweepCursor ? { cursor: sweepCursor } : {}) }}
      onPointerDown={onGridPointerDown}
      onPointerMove={onGridPointerMove}
      onPointerUp={onGridPointerUp}
      onPointerCancel={() => { sweepRef.current = null; setSweep(null); setSweepCursor(null); }}
    >
      {/* The hand-rolled selection mark. Source is the live drag (`sweep`) OR, once the
          drawer is open, its LIVE values (`selection`) — so the mark tracks edits and
          persists until the drawer closes. One rect PER weekday column (weekdays may be
          non-contiguous), each showing the block's details, all owning both axes. While
          it's up the `.sweeping` shield makes RBC decline (elementFromPoint hits the
          overlay), so no competing RBC ghost. */}
      {(selection ?? sweep) && (() => {
        // `selection` (drawer-owned, live) wins once the drawer is open; `sweep` drives
        // the mark only during the drag itself, before onSlotSelect lifts it up.
        const sel: { weekdays: number[]; startTod: number; endTod: number; title?: string } = selection ?? sweep!;
        const wrap = wrapRef.current?.getBoundingClientRect();
        const slots = [...(wrapRef.current?.querySelectorAll<HTMLElement>(".rbc-day-slot") ?? [])];
        if (!wrap || !slots.length || !sel.weekdays.length) return null;
        const span = preview.winEnd - preview.winStart;
        const tod = (m: number): string => fmtTod(((m % 1440) + 1440) % 1440, hour12);
        // Group the weekdays into CONTIGUOUS runs — one block per run, so gapped days
        // (Mon+Wed+Fri) draw separate blocks and never mark the skipped days between.
        const days = [...sel.weekdays].sort((a, b) => a - b);
        const runs: number[][] = [];
        for (const d of days) {
          const last = runs[runs.length - 1];
          if (last && d === last[last.length - 1]! + 1) last.push(d);
          else runs.push([d]);
        }
        return runs.flatMap((run) => {
          const first = slots[run[0]!]?.getBoundingClientRect();
          const last = slots[run[run.length - 1]!]?.getBoundingClientRect();
          if (!first || !last) return [];
          const top = first.top - wrap.top + ((sel.startTod - preview.winStart) / span) * first.height;
          const height = Math.max(((sel.endTod - sel.startTod) / span) * first.height, 6);
          return [(
            <div key={run[0]} className="wk-sel" style={{ left: first.left - wrap.left, width: last.right - first.left, top, height }}>
              <span className="wk-sel-title">{sel.title || "New template"}</span>
              <span className="wk-sel-time num">{tod(sel.startTod)}–{tod(sel.endTod)}</span>
            </div>
          )];
        });
      })()}
      {/* Horizontal edge-resize preview: ghost blocks over the days being ADDED, at the
          grabbed block's own time — so you see where the template will now also fire. */}
      {hResizeRef.current && hAddDays.length > 0 && (() => {
        const h = hResizeRef.current;
        const wrap = wrapRef.current?.getBoundingClientRect();
        const slots = [...(wrapRef.current?.querySelectorAll<HTMLElement>(".rbc-day-slot") ?? [])];
        if (!wrap) return null;
        const winSpan = preview.winEnd - preview.winStart;
        return hAddDays.map((d) => {
          const slot = slots[d]?.getBoundingClientRect();
          if (!slot) return null;
          const top = slot.top - wrap.top + ((h.block.start - preview.winStart) / winSpan) * slot.height;
          const height = Math.max(((h.block.end - h.block.start) / winSpan) * slot.height, 6);
          return <div key={d} className="wk-sel wk-sel-ext" style={{ left: slot.left - wrap.left, width: slot.width, top, height }}>
            <span className="wk-sel-title">{h.block.title}</span>
          </div>;
        });
      })()}
      <DnDCalendar
        localizer={localizer}
        events={events}
        view="week"
        views={["week"]}
        onView={() => undefined}
        date={new Date(weekStart * 60000)}
        onNavigate={() => undefined}
        toolbar={false}
        // §4.1: a cycle's head sleep crosses midnight — keep it ON the time axis,
        // spanning its true span, instead of RBC's all-day banner row.
        showMultiDayTimes
        allDayAccessor={() => false}
        min={min}
        max={max}
        step={60}
        timeslots={1}
        components={{ header: Header as never, event: EventCell as never }}
        // RBC's OWN slot-selection is OFF: the hand-rolled overlay (onGridPointer*)
        // owns every empty-slot gesture — click, vertical drag, and column sweep — so
        // there is no competing ghost. Block move/resize still ride RBC's addon.
        selectable={false}
        resizable={gesturesOn}
        draggableAccessor={(e) => gesturesOn && !e.block.dated}
        resizableAccessor={(e) => gesturesOn && !e.block.dated}
        onEventResize={handleResize}
        onEventDrop={handleDrop}
        // Week is the only view, so a header drill-down goes nowhere. Disabling it
        // also stops RBC wrapping the column head in its own <button> — which our
        // header's "+" button would then nest inside (invalid DOM).
        getDrilldownView={() => null}
        onSelectEvent={(e) => onBlockClick((e as BlockEvent).date, (e as BlockEvent).block)}
        eventPropGetter={(e) => {
          const b = (e as BlockEvent).block;
          return { className: `wk-ev wk-ev--${b.timing}${b.dated ? " dated" : ""}${b.squeezed > 0 ? " squeezed" : ""}` };
        }}
        dayPropGetter={(d) => {
          const wd = d.getDay();
          const isOff = offDays.includes(wd);
          // An OFF column with nothing placed says so, as the hand-rolled grid did.
          // (Dated one-offs still fire on OFF days, §4.4a — so it must be per-column.)
          const empty = isOff && (preview.days.find((p) => p.date === dayMin(d))?.blocks.length ?? 0) === 0;
          return {
            className: `${run.has(wd) ? "wk-day-weekend " : ""}${isOff ? "wk-day-off " : ""}${empty ? "wk-day-off-empty" : ""}`.trim(),
          };
        }}
        formats={{
          timeGutterFormat: (d: Date) => fmtTod(d.getHours() * 60 + d.getMinutes(), hour12),
        }}
      />
    </div>
  );
}
