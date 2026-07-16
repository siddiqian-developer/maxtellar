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
import { useRef, useState } from "react";
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
}

export function WeekGridRBC({
  preview, weekStart, weekendDays, offDays, hour12, today, mode, height, locked = false,
  onBlockClick, onAddDated, onSlotSelect, onBlockResize, onBlockMove,
}: Props): JSX.Element {
  const events = toEvents(preview);
  // §4.4a: the weekend RUN (weekendDays grown through adjacent OFF days) is what
  // "weekend" means everywhere below — tint included.
  const run = weekendRun(weekendDays, offDays);
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
  /** The live weekday-sweep (§4.4 feature 2), or null when idle. */
  const [sweep, setSweep] = useState<{ x0: number; x1: number; startTod: number } | null>(null);
  const sweepRef = useRef<{ x0: number; y0: number; startTod: number } | null>(null);

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

  /** Arms the weekday-sweep, but ONLY once the pointer has travelled further across
   * than down (`H_INTENT`). Until then this layer stays out of the way and RBC keeps
   * the gestures it already handles correctly — a click, and a vertical drag-select.
   * RBC yields automatically while the overlay is up: its Selection bails via
   * `isOverContainer` → `document.elementFromPoint`, which hits the overlay, not the
   * grid. No patching, no stopPropagation race — its own logic declines. */
  const onGridPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!gesturesOn || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".rbc-event")) return; // blocks are move/resize
    const col = (e.target as HTMLElement).closest<HTMLElement>(".rbc-day-slot");
    if (!col) return;
    const r = col.getBoundingClientRect();
    // Pixel → time-of-day against the visible window, snapped to the hour the grid
    // actually draws (`step=60`). A sweep sets WEEKDAYS; its time is the row grabbed.
    const frac = (e.clientY - r.top) / r.height;
    const startTod = preview.winStart + Math.round((frac * (preview.winEnd - preview.winStart)) / 60) * 60;
    sweepRef.current = { x0: e.clientX, y0: e.clientY, startTod };
  };

  const H_INTENT = 8; // px across before this layer claims the gesture (RBC's own is 5)

  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const s = sweepRef.current;
    if (!s) return;
    const dx = Math.abs(e.clientX - s.x0), dy = Math.abs(e.clientY - s.y0);
    if (!sweep && (dx < H_INTENT || dx <= dy)) return; // vertical/idle → leave it to RBC
    setSweep({ x0: s.x0, x1: e.clientX, startTod: s.startTod });
  };

  const onGridPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const s = sweepRef.current;
    sweepRef.current = null;
    if (!s || !sweep) { setSweep(null); return; } // never armed → RBC already handled it
    setSweep(null);
    const wds = weekdaysBetween(s.x0, e.clientX);
    if (wds.length) onSlotSelect?.(wds, s.startTod, s.startTod + 60, false);
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
    return (
      <div className="wk-ev-in" data-tip={tip}>
        <span className="wk-block-title">{b.dated ? "◆ " : ""}{b.title}</span>
        <span className="wk-block-time num">{tod(b.start)}</span>
      </div>
    );
  };

  return (
    <div
      ref={wrapRef}
      className={`wk-rbc${mode === "week" && locked ? " locked" : ""}${sweep ? " sweeping" : ""}`}
      style={{ height }}
      onPointerDown={onGridPointerDown}
      onPointerMove={onGridPointerMove}
      onPointerUp={onGridPointerUp}
      onPointerCancel={() => { sweepRef.current = null; setSweep(null); }}
    >
      {/* Only mounted mid-sweep. Its presence is what makes RBC's Selection decline
          the gesture (elementFromPoint hits this, not the grid) — so it is both the
          visual and the mechanism. */}
      {sweep && (() => {
        // Band = the block you're about to make: swept columns wide, ONE ROW tall at
        // the grabbed hour. Vertical geometry comes from a real .rbc-day-slot so it
        // lines up with how RBC draws blocks (top/height as a fraction of the window).
        const wrap = wrapRef.current?.getBoundingClientRect();
        const slot = wrapRef.current?.querySelector<HTMLElement>(".rbc-day-slot")?.getBoundingClientRect();
        if (!wrap || !slot) return null;
        const span = preview.winEnd - preview.winStart;
        const top = slot.top - wrap.top + ((sweep.startTod - preview.winStart) / span) * slot.height;
        const height = (60 / span) * slot.height;
        return <div className="wk-sweep" style={{ left: Math.min(sweep.x0, sweep.x1) - wrap.left, width: Math.abs(sweep.x1 - sweep.x0), top, height }} />;
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
        // Week Plan authors; Calendar mode never does. These only ARM the gestures —
        // RBC still computes no final placement (see the file header).
        selectable={gesturesOn}
        resizable={gesturesOn}
        draggableAccessor={(e) => gesturesOn && !e.block.dated}
        resizableAccessor={(e) => gesturesOn && !e.block.dated}
        onSelectSlot={(s) => {
          if (!gesturesOn) return;
          const wds = [...new Set((s.slots ?? []).map((d) => new Date(d).getDay()))];
          const startD = new Date(s.start);
          const owner = dayMin(startD);
          onSlotSelect?.(wds, todFor(startD, owner), todFor(new Date(s.end), owner), s.action === "click");
        }}
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
