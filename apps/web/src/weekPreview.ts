/**
 * Week-grid placement (§4.4 / §4.6) — a VISUAL, DATE-AWARE preview of the plan.
 * Each column is a REAL calendar date of the displayed week; for that date we run
 * the SAME core `injectToday` used at SOD (so recurring templates fire on their
 * weekday, OFF days skip templates, and the date's dated overrides — skip /
 * anchor-move / one-off add, §4.6 — apply exactly as they will in real life),
 * then the SAME `settle`-pass lays them out. Pure + web-only: it does NOT touch
 * the spine; real instantiation still happens per-day at SOD injection.
 *
 * Conflicts (feedback 2026-07-15): a dated activity that collides with the
 * recurring plan (something gets squeezed/overflowed on a date that has dated
 * overrides) is surfaced so the UI can notify the user.
 */
import type { Dur, DatedEntry, PlanItem, WeekTemplate } from "@maxtellar/core";
import { initialState, injectTodayDetailed, rankAfter, settle } from "@maxtellar/core";

const MIN_PER_DAY = 1440;
/** Notional day-start the fill cursor uses when nothing is anchored earlier. */
export const WEEK_DAY_START = 6 * 60;

export interface WeekColumn {
  /** local-midnight epoch-minute of this column's calendar date. */
  date: number;
  /** 0=Sun … 6=Sat. */
  weekday: number;
}
export interface WeekBlock {
  /**
   * The id of the SOURCE this block came from — a `WeekTemplate.id`, or a
   * `DatedTask.id` when `dated` is true. This is what the UI looks the block back
   * up by (click→edit, §4.6 skip/move), so it must NOT be the injected task's own
   * id: injection mints a fresh one per task, which matches no template.
   */
  templateId: string;
  title: string;
  timing: string;
  headId: string;
  /** true when this block came from a §4.6 dated one-off add (not a template). */
  dated: boolean;
  /** minutes-into-day [0,1440+) */
  start: number;
  end: number;
  squeezed: Dur;
}
export interface WeekDayPreview {
  /** local-midnight epoch-minute of the column. */
  date: number;
  weekday: number;
  isOff: boolean;
  blocks: WeekBlock[];
  /** non-null when a dated override collides with the plan on this date. */
  conflict: string | null;
}
export interface WeekPreview {
  /** shared vertical window across all columns (minutes-into-day). */
  winStart: number;
  winEnd: number;
  days: WeekDayPreview[];
  /** flat list of conflict notices (one per conflicted day). */
  conflicts: string[];
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * @param full24 when true the vertical window is the whole day [0,1440); else it
 *   shrinks to the placed span (padded to the hour).
 */
export function weekPreview(
  templates: WeekTemplate[],
  dated: DatedEntry[],
  columns: WeekColumn[],
  offDays: number[],
  minFragment: Dur,
  openExtentCap: Dur,
  semiTailFloor: Dur,
  full24 = true,
): WeekPreview {
  const days: WeekDayPreview[] = [];
  const conflicts: string[] = [];
  let winStart = full24 ? 0 : WEEK_DAY_START;
  let winEnd = full24 ? MIN_PER_DAY : 22 * 60;

  // §4.4: a `once` template must preview on its FIRST matching date only — after
  // it "fires" on an earlier column it retires, exactly as real SOD injection
  // will. Columns run in date order, so retire fired once-templates in a working
  // copy as we advance (using the core's own firedOnceIds).
  let workTemplates = templates;

  for (const col of columns) {
    // A minimal State the pure injector reads (templates + offDays + dated layer).
    const base = {
      ...initialState(0),
      week: { ...initialState(0).week, startedAt: 0, offDays, templates: workTemplates },
      dated,
    };
    let n = 0;
    let lo: string | null = null;
    const rankBelow = (prev: string | null): string => {
      const r = rankAfter(prev ?? lo);
      lo = r;
      return r;
    };
    // Instantiate exactly as SOD will for this real date (absolute minutes).
    // injectToday appends the date's dated adds LAST (after the templates), so
    // the final `addsCount` tasks are the §4.6 one-offs (ids are reassigned).
    const entry = dated.find((e) => e.date === col.date);
    const addsCount = entry?.adds.length ?? 0;
    const injected = injectTodayDetailed(base, col.date, col.weekday, () => `pv-${col.date}-${++n}`, rankBelow);
    const tasks = injected.tasks;
    // Retire any `once` template that fired on this column so later columns skip it.
    if (injected.firedOnceIds.length > 0) {
      const fired = new Set(injected.firedOnceIds);
      workTemplates = workTemplates.map((t) =>
        fired.has(t.id) && t.validity?.kind === "once" ? { ...t, validity: { kind: "once" as const, firedOn: col.date } } : t,
      );
    }
    const datedIds = new Set(tasks.slice(tasks.length - addsCount).map((t) => t.id));
    const hasDated = addsCount > 0 || (entry?.skips.length ?? 0) > 0 || (entry?.overrides.length ?? 0) > 0;

    // Fill cursor = the day-start, lowered if something is anchored earlier.
    let earliest = col.date + WEEK_DAY_START;
    for (const t of tasks) {
      if (t.anchorStart !== undefined) earliest = Math.min(earliest, t.anchorStart);
      else if (t.anchorEnd !== undefined) earliest = Math.min(earliest, t.anchorEnd - (t.budget ?? minFragment));
    }
    const cursor = Math.max(col.date, Math.min(col.date + WEEK_DAY_START, earliest));

    const placements = settle({ plan: tasks as PlanItem[], cursor, minFragment, openExtentCap, semiTailFloor });

    const blocks: WeekBlock[] = [];
    let conflict: string | null = null;
    for (const p of placements) {
      const t = tasks.find((x) => x.id === p.itemId);
      if (!t || p.parts.length === 0) continue;
      const start = p.parts[0]!.start - col.date;
      const end = p.parts[p.parts.length - 1]!.end - col.date;
      const isDated = datedIds.has(t.id);
      // `t.id` is the injected task's MINTED id — map back to the template /
      // dated-task it was instantiated from, or the UI can never find it again.
      const sourceId = injected.sourceIds[t.id] ?? t.id;
      blocks.push({ templateId: sourceId, title: t.title, timing: t.timing, headId: t.headId, dated: isDated, start, end, squeezed: p.squeezedDeficit });
      if (!full24) {
        winStart = Math.min(winStart, start);
        winEnd = Math.max(winEnd, end);
      }
      // §4.6 conflict (squeeze/overflow — a slideable task that couldn't fit).
      if (conflict === null && hasDated && (p.squeezedDeficit > 0 || p.overflowDeficit > 0)) {
        conflict = `${WD[col.weekday]} — "${t.title}" collides with the plan (didn't fully fit).`;
      }
    }
    // §4.6 conflict (time overlap — two firm/fixed blocks landing on the same
    // slot don't squeeze, they collide). Only flagged on dated-override days.
    if (conflict === null && hasDated) {
      const sorted = blocks.slice().sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]!.start < sorted[i - 1]!.end) {
          const culprit = sorted[i]!.dated ? sorted[i]! : sorted[i - 1]!.dated ? sorted[i - 1]! : sorted[i]!;
          conflict = `${WD[col.weekday]} — "${culprit.title}" overlaps "${(sorted[i]!.templateId === culprit.templateId ? sorted[i - 1]! : sorted[i]!).title}".`;
          break;
        }
      }
    }
    if (conflict) conflicts.push(conflict);
    days.push({ date: col.date, weekday: col.weekday, isOff: offDays.includes(col.weekday), blocks, conflict });
  }

  winStart = Math.max(0, Math.floor(winStart / 60) * 60);
  winEnd = Math.min(MIN_PER_DAY, Math.ceil(winEnd / 60) * 60);
  if (winEnd <= winStart) winEnd = Math.min(MIN_PER_DAY, winStart + 60);
  return { winStart, winEnd, days, conflicts };
}
