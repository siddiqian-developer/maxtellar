/**
 * Week-grid placement (§4.4) — a VISUAL preview of the weekly plan: for each
 * weekday, instantiate that day's templates and run the SAME core settle-pass
 * used for the live day, so anchored tasks pin at their time and budgeted/
 * unscheduled tasks fill by rank order (exactly as a daily task lands in the
 * timeline). Pure + web-only: this does NOT touch the spine — real instantiation
 * still happens per-day at SOD injection (the sleep-cycle-day law is unchanged).
 */
import type { Dur, PlanItem, WeekTemplate } from "@maxtellar/core";
import { settle, templateToTask } from "@maxtellar/core";

const MIN_PER_DAY = 1440;
/** Notional day-start the fill cursor uses when nothing is anchored earlier. */
export const WEEK_DAY_START = 6 * 60;

export interface WeekBlock {
  templateId: string;
  title: string;
  timing: string;
  headId: string;
  /** minutes-into-day [0,1440+) */
  start: number;
  end: number;
  squeezed: Dur;
}
export interface WeekDayPreview {
  weekday: number; // 0=Sun … 6=Sat
  blocks: WeekBlock[];
}
export interface WeekPreview {
  /** shared vertical window across all columns (minutes-into-day). */
  winStart: number;
  winEnd: number;
  days: WeekDayPreview[];
}

const byRank = (a: { rank: string }, b: { rank: string }): number =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;

export function weekPreview(
  templates: WeekTemplate[],
  minFragment: Dur,
  openExtentCap: Dur,
  semiTailFloor: Dur,
): WeekPreview {
  const days: WeekDayPreview[] = [];
  let winStart = WEEK_DAY_START;
  let winEnd = 22 * 60;

  for (let d = 0; d < 7; d++) {
    const due = templates.filter((t) => t.weekdays.includes(d)).slice().sort(byRank);
    // Instantiate onto a day whose midnight is 0 (day-relative preview).
    const tasks = due.map((t) => templateToTask(t, 0, t.id, t.rank));

    // Fill cursor = the day-start, lowered if something is anchored earlier so
    // no anchored task is clipped by the cursor floor.
    let earliest = WEEK_DAY_START;
    for (const t of tasks) {
      if (t.anchorStart !== undefined) earliest = Math.min(earliest, t.anchorStart);
      else if (t.anchorEnd !== undefined)
        earliest = Math.min(earliest, t.anchorEnd - (t.budget ?? minFragment));
    }
    const cursor = Math.max(0, Math.min(WEEK_DAY_START, earliest));

    const placements = settle({
      plan: tasks as PlanItem[],
      cursor,
      minFragment,
      openExtentCap,
      semiTailFloor,
    });

    const blocks: WeekBlock[] = [];
    for (const p of placements) {
      const t = tasks.find((x) => x.id === p.itemId);
      if (!t || p.parts.length === 0) continue;
      const start = p.parts[0]!.start;
      const end = p.parts[p.parts.length - 1]!.end;
      blocks.push({ templateId: t.id, title: t.title, timing: t.timing, headId: t.headId, start, end, squeezed: p.squeezedDeficit });
      winStart = Math.min(winStart, start);
      winEnd = Math.max(winEnd, end);
    }
    days.push({ weekday: d, blocks });
  }

  winStart = Math.max(0, Math.floor(winStart / 60) * 60);
  winEnd = Math.min(MIN_PER_DAY, Math.ceil(winEnd / 60) * 60);
  if (winEnd <= winStart) winEnd = Math.min(MIN_PER_DAY, winStart + 60);
  return { winStart, winEnd, days };
}
