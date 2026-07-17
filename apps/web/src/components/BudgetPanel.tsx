/**
 * Time budgeting — the §11 two-pane view inside Weekly Planning:
 *  - LEFT: collapsible Category ▸ Head outliner. Sleep is the pinned day-head
 *    row; each budgeted head is daily-absolute, %-of-netCore (Core Work only)
 *    or weekly-quota (at-least / at-most / exact). Rank = list order (drag
 *    handle AND ▲▼ arrows); collapse-all in the pane header.
 *  - RIGHT: the live 24h stacked bar (conservation gauge) for the selected
 *    weekday, plus netCore, the core %-fit and per-Category roll-ups/targets.
 *
 * Snap discipline (§11.2/§11.6/§11.10): an entry that pushes any planned day
 * OVER 24h — or a Category over its explicit target, or the core %s over the
 * envelope — snaps back at the boundary to the value that restores the fit,
 * with a toast naming head + rule and a flash on the offending row/segment.
 * UNDER never snaps: it is the live "needs X more" indicator (the gate blocks
 * Start Week until every planned day is exactly 24h).
 * Smart-input parity (§7.0.2) on every duration field. Esc: expanded row
 * collapses first, else one level back.
 */
import { useMemo, useRef, useState } from "react";
import type { Event, HeadBudget, QuotaType, State } from "@maxtellar/core";
import {
  budgetEntries,
  CORE_WORK,
  MIN_PER_DAY,
  SELF_MANAGEMENT_ID,
  SLEEP_ID,
  SLEEP_TEMPLATE_ID,
  headName,
  weekBudgetValidity,
  weekDayShape,
  weeklyShare,
  snapPctToCoreFit,
  snapTo24h,
  fixedShare,
} from "@maxtellar/core";
import type { TimingType, EndDayOffset } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { useHeads } from "../heads";
import { useSettings } from "../settings";
import { parseCasualDuration } from "../casualTime";
import { fmtDurUnits } from "../time";
import { SnapToast, useSnapToast } from "../SnapToast";
import { StepperField } from "./StepperField";
import { AddCircleButton } from "./AddCircleButton";
import { HoverInsertRows } from "./HoverInsertRows";
import { SleepTrioFields } from "./SleepTrioFields";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const QUOTA_LABEL: Record<QuotaType, string> = { atLeast: "at least", atMost: "at most", exact: "exact" };
const EPS = 1e-6;

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  locked: boolean;
  urgent: boolean;
  todayWeekday: number;
  onBack: () => void;
  /** False while the host screen has an overlay up — that overlay owns Esc. */
  escActive: boolean;
  /** §11.8a (revised 2026-07-20, HoverInsertRows): opens the Add Template
   * drawer seeded with this category (a brand-new head it creates is pinned
   * there), inserting the resulting budget line at `atIndex` WITHIN that
   * category's own head list (0 = first). Triggered by hovering the empty
   * "no X budgets" row (index always 0) or a budgeted row's top/bottom edge. */
  onAddForCategory: (categoryId: string, atIndex: number) => void;
}

export function BudgetPanel({ state, dispatch, locked, urgent, todayWeekday, onBack, escActive, onAddForCategory }: Props): JSX.Element {
  const { plannableHeads, categories, categoryFor, registry, addActivity } = useHeads();
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const [addingSubhead, setAddingSubhead] = useState<string | null>(null);
  const [newSubhead, setNewSubhead] = useState("");
  const week = state.week;
  const sleepTpl = week.templates.find((t) => t.id === SLEEP_TEMPLATE_ID);
  const plannedDays = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].filter((d) => !week.offDays.includes(d)),
    [week.offDays],
  );
  const [selWd, setSelWd] = useState<number>(plannedDays.includes(todayWeekday) ? todayWeekday : (plannedDays[0] ?? 1));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Sleep's pinned trio starts collapsed (the practical default is rarely edited).
  const [sleepOpen, setSleepOpen] = useState(false);
  const { toast, notify: showToast } = useSnapToast();
  const [flash, setFlash] = useState<{ headId: string; seq: number } | null>(null);
  const dragId = useRef<string | null>(null);

  useEscClose(!escActive ? () => {} : expanded ? () => setExpanded(null) : onBack);

  const notify = (text: string, headId: string): void => {
    showToast(text);
    setFlash((f) => ({ headId, seq: (f?.seq ?? 0) + 1 }));
  };

  const commit = (budgets: HeadBudget[], targets?: Record<string, number>): void => {
    dispatch({ type: "SET_BUDGETS", budgets, categoryTargets: targets ?? week.categoryTargets, weekday: todayWeekday, urgent });
  };

  /* ---------- snap helpers: over → snap to the restoring value ---------- */

  /** Days (non-OFF) that go over 24h under `budgets`; per day the allowed
   * value for `headId`'s line that would restore exactly 24h. */
  const overDayAllowance = (budgets: HeadBudget[], headId: string): number | null => {
    const probe = { ...week, budgets };
    let allowed: number | null = null;
    for (const wd of plannedDays) {
      const shape = weekDayShape(probe, wd);
      if (shape.delta < 0 && shape.lines.some((l) => l.headId === headId)) {
        const a = snapTo24h(budgetEntries(probe), wd, headId);
        if (a !== null) allowed = allowed === null ? a : Math.min(allowed, a);
      }
    }
    return allowed;
  };

  /** Category explicit-target check: if `headId`'s category is over its target
   * on any planned day, the value that restores the fit (min across days). */
  const overCategoryAllowance = (budgets: HeadBudget[], headId: string): { allowed: number; target: number; category: string } | null => {
    const entry = budgets.find((b) => b.headId === headId);
    if (!entry) return null;
    const target = week.categoryTargets[entry.categoryId];
    if (target === undefined) return null;
    const probe = { ...week, budgets };
    let allowed: number | null = null;
    for (const wd of plannedDays) {
      const shape = weekDayShape(probe, wd);
      const cat = shape.categories.find((c) => c.categoryId === entry.categoryId);
      const line = shape.lines.find((l) => l.headId === headId);
      if (!cat || !line || cat.minutes <= target) continue;
      const a = Math.max(0, line.minutes + (target - cat.minutes));
      allowed = allowed === null ? a : Math.min(allowed, a);
    }
    return allowed === null ? null : { allowed, target, category: entry.categoryId };
  };

  /* --------------------------- edit handlers ---------------------------- */

  /** §11.4 (revised 2026-07-21): the trio's budget edit, with the same
   * snap-to-24h chain every absolute head gets — probes against `week.budgets`
   * with Sleep's REAL entry swapped in (no more `sleepMinutes`-only probe;
   * that field stopped being what the day-shape math reads). */
  const setSleep = (minutes: number, timing?: TimingType, anchors?: { start: number | undefined; end: number | undefined; dayOffset: EndDayOffset | undefined }): void => {
    let val = Math.max(0, Math.min(1440, minutes));
    const withVal = (v: number): HeadBudget[] =>
      week.budgets.map((b) => (b.headId === SLEEP_ID ? { ...b, minutes: v } : b));
    for (const wd of plannedDays) {
      const shape = weekDayShape({ ...week, budgets: withVal(val) }, wd);
      if (shape.delta < 0) {
        const a = snapTo24h(budgetEntries({ ...week, budgets: withVal(val) }), wd, SLEEP_ID);
        if (a !== null && a < val) val = a;
      }
    }
    if (val !== minutes) notify(`Snapped Sleep to ${fmtDurUnits(val)} — a day must equal exactly 24h`, SLEEP_ID);
    dispatch({
      type: "SET_SLEEP_BUDGET",
      minutes: val,
      ...(timing !== undefined ? { timing } : {}),
      ...(anchors?.start !== undefined ? { anchorStartTod: anchors.start } : {}),
      ...(anchors?.end !== undefined ? { anchorEndTod: anchors.end } : {}),
      ...(anchors?.dayOffset !== undefined ? { anchorEndDayOffset: anchors.dayOffset } : {}),
    });
  };

  /** Absolute minutes (or weekly quota) edit with the full snap chain. */
  const setHeadValue = (headId: string, raw: number): void => {
    const idx = week.budgets.findIndex((b) => b.headId === headId);
    if (idx < 0) return;
    const b = week.budgets[idx]!;
    let val = Math.max(0, Math.round(raw));
    const withVal = (v: number): HeadBudget[] =>
      week.budgets.map((x) =>
        x.headId !== headId ? x : x.kind === "weekly" ? { ...x, quotaMinutes: v } : { ...x, minutes: v },
      );

    if (b.kind === "weekly") {
      // Reducing the quota shrinks every share; iterate the worst-day overshoot
      // (≤7 rounds — one per weekday) until every planned day fits again.
      for (let i = 0; i < 8; i++) {
        const probe = { ...week, budgets: withVal(val) };
        const entries = budgetEntries(probe);
        const eb = entries.find((x) => x.headId === headId)!;
        let worst = 0;
        let worstShareAllowed: number | null = null;
        for (const wd of plannedDays) {
          const shape = weekDayShape(probe, wd);
          if (shape.delta < 0 && shape.lines.some((l) => l.headId === headId)) {
            if (-shape.delta > worst) {
              worst = -shape.delta;
              worstShareAllowed = snapTo24h(entries, wd, headId);
            }
          }
        }
        if (worst === 0 || worstShareAllowed === null) break;
        const share = weeklyShare(eb, selWd);
        const cut = Math.max(1, (share - worstShareAllowed) * Math.max(1, b.weekdays.length));
        val = Math.max(0, val - cut);
        if (val === 0) break;
      }
      const before = Math.max(0, Math.round(raw));
      if (val !== before) notify(`Snapped ${headName(headId)} to ${fmtDurUnits(val)}/wk — a day must equal exactly 24h`, headId);
    } else {
      const a24 = overDayAllowance(withVal(val), headId);
      if (a24 !== null && a24 < val) {
        val = a24;
        notify(`Snapped ${headName(headId)} to ${fmtDurUnits(val)} — day must equal exactly 24h`, headId);
      }
      const cat = overCategoryAllowance(withVal(val), headId);
      if (cat && cat.allowed < val) {
        val = cat.allowed;
        notify(`Snapped ${headName(headId)} to ${fmtDurUnits(val)} — ${cat.category} must total ${fmtDurUnits(cat.target)}`, headId);
      }
    }
    commit(withVal(val));
  };

  /** Percent edit — over the core envelope on any planned day → snap (§11.3). */
  const setHeadPct = (headId: string, raw: number): void => {
    let val = Math.max(0, Math.min(100, raw));
    const withVal = (v: number): HeadBudget[] => week.budgets.map((x) => (x.headId === headId ? { ...x, pct: v } : x));
    const probe = { ...week, budgets: withVal(val) };
    let allowed: number | null = null;
    for (const wd of plannedDays) {
      const shape = weekDayShape(probe, wd);
      if (shape.coreFit.pctSum > shape.coreFit.requiredPctSum + EPS) {
        const a = snapPctToCoreFit(budgetEntries(probe), wd, headId);
        if (a !== null) allowed = allowed === null ? a : Math.min(allowed, a);
      }
    }
    if (allowed !== null && allowed < val) {
      val = Math.round(allowed * 10) / 10;
      notify(`Snapped ${headName(headId)} to ${val}% — core %s must exactly fill netCore`, headId);
    }
    commit(withVal(val));
  };

  /** Per-selected-weekday override (absolute perDay / weekly share). */
  const setDayOverride = (headId: string, minutes: number | null): void => {
    const b = week.budgets.find((x) => x.headId === headId);
    if (!b) return;
    const apply = (v: number | null): HeadBudget[] =>
      week.budgets.map((x) => {
        if (x.headId !== headId) return x;
        if (x.kind === "weekly") {
          const shares = { ...(x.shares ?? {}) };
          if (v === null) delete shares[selWd];
          else shares[selWd] = v;
          return { ...x, shares };
        }
        const perDay = { ...(x.perDay ?? {}) };
        if (v === null) delete perDay[selWd];
        else perDay[selWd] = v;
        return { ...x, perDay };
      });
    if (minutes === null) return commit(apply(null));
    let val = Math.max(0, Math.round(minutes));
    const a24 = overDayAllowance(apply(val), headId);
    if (a24 !== null && a24 < val) {
      val = a24;
      notify(`Snapped ${headName(headId)} (${WD[selWd]}) to ${fmtDurUnits(val)} — day must equal exactly 24h`, headId);
    }
    commit(apply(val));
  };

  const setKind = (headId: string, kind: HeadBudget["kind"]): void => {
    commit(
      week.budgets.map((x) => {
        if (x.headId !== headId) return x;
        if (kind === "percent") return { headId: x.headId, categoryId: x.categoryId, kind, pct: 0, weekdays: x.weekdays };
        if (kind === "weekly")
          return { headId: x.headId, categoryId: x.categoryId, kind, quotaMinutes: x.minutes !== undefined ? x.minutes * x.weekdays.length : 0, quotaType: "atLeast" as const, weekdays: x.weekdays };
        return { headId: x.headId, categoryId: x.categoryId, kind, minutes: x.quotaMinutes !== undefined ? Math.round(x.quotaMinutes / Math.max(1, x.weekdays.length)) : (x.minutes ?? 0), weekdays: x.weekdays };
      }),
    );
  };

  const setQuotaType = (headId: string, quotaType: QuotaType): void => {
    commit(week.budgets.map((x) => (x.headId === headId ? { ...x, quotaType } : x)));
  };

  const toggleWeekday = (headId: string, wd: number): void => {
    commit(
      week.budgets.map((x) => {
        if (x.headId !== headId) return x;
        const weekdays = x.weekdays.includes(wd) ? x.weekdays.filter((d) => d !== wd) : [...x.weekdays, wd].sort((a, b) => a - b);
        return { ...x, weekdays };
      }),
    );
  };

  const setTarget = (categoryId: string, minutes: number | null): void => {
    const targets = { ...week.categoryTargets };
    if (minutes === null) delete targets[categoryId];
    else targets[categoryId] = Math.max(0, Math.round(minutes));
    commit(week.budgets, targets);
  };

  const addHead = (head: string): void => {
    if (week.budgets.some((b) => b.headId === head)) return;
    commit([
      ...week.budgets,
      { headId: head, categoryId: categoryFor(head), kind: "absolute", minutes: 60, weekdays: plannedDays },
    ]);
  };

  const removeHead = (headId: string): void => {
    setExpanded(null);
    commit(week.budgets.filter((b) => b.headId !== headId));
  };

  const move = (headId: string, dir: -1 | 1): void => {
    const list = [...week.budgets];
    const i = list.findIndex((b) => b.headId === headId);
    // Rank order is global (§11.5) but the outliner groups by Category — move
    // to the previous/next slot WITHIN the same category so the visible order
    // is what changes.
    const cat = list[i]!.categoryId;
    let j = i + dir;
    while (j >= 0 && j < list.length && list[j]!.categoryId !== cat) j += dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const [it] = list.splice(i, 1);
    list.splice(j, 0, it!);
    commit(list);
  };

  const dropOn = (targetId: string): void => {
    const src = dragId.current;
    dragId.current = null;
    if (!src || src === targetId) return;
    const list = [...week.budgets];
    const i = list.findIndex((b) => b.headId === src);
    const j = list.findIndex((b) => b.headId === targetId);
    if (i < 0 || j < 0) return;
    const [it] = list.splice(i, 1);
    list.splice(j, 0, it!);
    commit(list);
  };

  /* ------------------------------ derived ------------------------------- */

  const shape = useMemo(() => weekDayShape(week, selWd), [week, selWd]);
  const validity = useMemo(() => weekBudgetValidity(week), [week]);
  const unbudgeted = plannableHeads.filter((h) => !week.budgets.some((b) => b.headId === h));
  const lineFor = (headId: string) => shape.lines.find((l) => l.headId === headId);
  const catShape = (categoryId: string) => shape.categories.find((c) => c.categoryId === categoryId);
  const allCollapsed = collapsed.size >= categories.length;
  const toggleAll = (): void => setCollapsed(allCollapsed ? new Set() : new Set(categories));
  const toggleCat = (c: string): void =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const flashCls = (headId: string): string => (flash?.headId === headId ? " bp-flash" : "");
  // §11.4 revised 2026-07-21: Sleep now has a real categoryId (Recharging) in
  // week.budgets like any other head — no more special-case null here.
  const catOfFlash = flash ? week.budgets.find((b) => b.headId === flash.headId)?.categoryId : null;

  const badDays = validity.days.filter((d) => !d.ok || !d.coreFit.ok || d.categories.some((c) => !c.ok)).map((d) => d.weekday);

  return (
    <div className="config-section bp-root">
      <div className="bp-toolbar">
        <div className="type-chips" role="radiogroup" aria-label="Weekday">
          {WD.map((w, d) => {
            const off = week.offDays.includes(d);
            return (
              <button key={d} type="button" disabled={off}
                className={`type-chip${d === selWd ? " active" : ""}${badDays.includes(d) ? " bp-bad" : ""}`}
                data-status="budgeted"
                data-tip={off ? "OFF day — no shape to budget" : badDays.includes(d) ? `${w} does not balance to 24h yet` : `Show ${w}'s shape`}
                onClick={() => setSelWd(d)}>
                {w}
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
        <button className="link-btn" onClick={toggleAll}>{allCollapsed ? "Expand all" : "Collapse all"}</button>
      </div>

      <div className="bp-gauge">
        <h4 className="bp-gauge-title">{WD[selWd]} — the 24h wall</h4>
        <div className={`bp-bar${shape.delta < 0 ? " over" : ""}`} role="img" aria-label={`24 hour allocation bar for ${WD[selWd]}`}>
          {shape.lines.filter((l) => l.minutes > 0).map((l) => (
            <div key={l.headId} className={`bp-seg${flashCls(l.headId)}`} data-cat={l.categoryId}
              style={{ width: `${(Math.min(l.minutes, MIN_PER_DAY) / MIN_PER_DAY) * 100}%` }}
              data-tip={`${headName(l.headId)} · ${fmtDurUnits(l.minutes)}${l.pct !== undefined ? ` (${l.pct}%)` : ""}`} />
          ))}
        </div>
        <div className={`bp-delta num${shape.ok ? " ok" : ""}`}>
          {shape.ok
            ? `Balanced — exactly 24h ✓`
            : shape.delta > 0
              ? `needs ${fmtDurUnits(shape.delta)} more`
              : `over by ${fmtDurUnits(-shape.delta)}`}
        </div>
        <div className="bp-facts">
          <div className="bp-fact"><span>netCore</span><span className="num">{fmtDurUnits(shape.netCore)}</span></div>
          {shape.lines.some((l) => l.pct !== undefined) && (
            <div className="bp-fact">
              <span>core %s</span>
              <span className={`num${shape.coreFit.ok ? "" : " bp-fit-warn"}`}>
                {Math.round(shape.coreFit.pctSum * 10) / 10}% / {Math.round(shape.coreFit.requiredPctSum * 10) / 10}%{shape.coreFit.ok ? " ✓" : ""}
              </span>
            </div>
          )}
          {shape.categories.map((c) => (
            <div key={c.categoryId} className="bp-fact">
              <span><i className="bp-dot" data-cat={c.categoryId} />{c.categoryId}</span>
              <span className="num">
                {fmtDurUnits(c.minutes)}
                {c.target !== undefined && <span className={c.ok ? "bp-fit-ok" : "bp-fit-warn"}> / {fmtDurUnits(c.target)}{c.ok ? " ✓" : " ✗"}</span>}
              </span>
            </div>
          ))}
        </div>
        {badDays.length > 0 && (
          <div className="form-warning" role="status">
            {badDays.map((d) => WD[d]).join(", ")} {badDays.length === 1 ? "does" : "do"} not balance to exactly 24h — Start Week stays gated until every planned day does.
          </div>
        )}
      </div>

      <div className="bp-panes">
        <div className="bp-outliner">
          {/* Sleep — the head of the day (pinned, §11.4; revised 2026-07-21: a
           * real WeekTemplate now, so the trio — not just a budget — lives
           * here. Settings-grade: editable even under the mid-week lock, same
           * as before. */}
          <div
            className={`bp-row bp-pinned bp-pinned-trio bp-pinned-trio-toggle${sleepOpen ? " bp-pinned-trio-open" : " bp-pinned-trio-collapsed"}${flashCls(SLEEP_ID)}`}
            role="button"
            tabIndex={0}
            aria-expanded={sleepOpen}
            aria-label={sleepOpen ? "Collapse Sleep" : "Expand Sleep"}
            onClick={(e: React.MouseEvent) => {
              // The WHOLE row toggles — but a click that lands ON an actual
              // control (input / chip / button / stepper) is an EDIT, not a
              // collapse: let it through. Empty space (incl. field labels and
              // the caret/header) collapses. When collapsed there are no
              // controls, so any click expands.
              // NB: scope the control search to controls INSIDE the row — the
              // row itself is role="button", so an unscoped .closest([role=button])
              // would match the row and wrongly block every collapse.
              const hit = (e.target as HTMLElement).closest("input, button, [role=button], .type-chip, .time-stepper");
              if (sleepOpen && hit && hit !== e.currentTarget) return;
              setSleepOpen(!sleepOpen);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              // Only the row itself (not a focused inner control) answers Enter/Space.
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSleepOpen(!sleepOpen); }
            }}
          >
            {/* The WHOLE row is the collapse/expand toggle in BOTH states.
             * Clicks that hit a real control are treated as edits (guarded in
             * onClick above), so the fields stay usable while empty-space
             * clicks — including the field labels — collapse the row. */}
            <span className="bp-trio-header">
              <span className="bp-caret" aria-hidden>{sleepOpen ? "▾" : "▸"}</span>
              <span className="bp-pin" data-tip="Pinned — Sleep is the head of the day (synced with Settings and the Calendar)">◆</span>
              <span className="bp-name">Sleep</span>
            </span>
            <SleepTrioFields
              hour12={hour12}
              minFragment={state.minFragment}
              collapsible
              open={sleepOpen}
              onOpenChange={setSleepOpen}
              value={{
                timing: sleepTpl?.timing ?? "budgeted",
                budget: sleepTpl?.budget,
                anchorStartTod: sleepTpl?.anchorStartTod,
                anchorEndTod: sleepTpl?.anchorEndTod,
                anchorEndDayOffset: sleepTpl?.anchorEndDayOffset,
              }}
              onChange={(next) => setSleep(next.budget ?? sleepTpl?.budget ?? 0, next.timing, {
                start: next.anchorStartTod, end: next.anchorEndTod, dayOffset: next.anchorEndDayOffset,
              })}
            />
          </div>

          {categories.map((cat) => {
            const heads = week.budgets.filter((b) => b.categoryId === cat);
            const cs = catShape(cat);
            const target = week.categoryTargets[cat];
            const isCollapsed = collapsed.has(cat);
            return (
              <div key={cat} className="bp-cat">
                <div className={`bp-row bp-cat-row${catOfFlash === cat ? " bp-flash" : ""}`}>
                  <button className="bp-caret" aria-label={isCollapsed ? `Expand ${cat}` : `Collapse ${cat}`} onClick={() => toggleCat(cat)}>
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                  <span className="bp-name bp-cat-name" data-cat={cat}>{cat}</span>
                  <span className="bp-rollup num" data-tip={`Roll-up of ${cat} on ${WD[selWd]}`}>{fmtDurUnits(cs?.minutes ?? 0)}</span>
                  <DurInput ariaLabel={`${cat} target`} value={target} placeholder="target" allowEmpty disabled={locked}
                    onCommit={(m) => setTarget(cat, m)} />
                  {target !== undefined && cs && cs.minutes !== target && (
                    <span className="bp-fit-warn" data-tip={`Hard fit: heads must total exactly ${fmtDurUnits(target)} (now ${fmtDurUnits(cs.minutes)})`}>✗</span>
                  )}
                </div>
                {!isCollapsed && (
                  <HoverInsertRows
                    items={heads}
                    keyFor={(b) => b.headId}
                    addLabel={`Add a head to ${cat}`}
                    emptyLabel={`no ${cat} budgets`}
                    disabled={locked}
                    onInsert={(atIndex) => onAddForCategory(cat, atIndex)}
                    renderRow={(b) => {
                      const line = lineFor(b.headId);
                      const pinned = b.headId === SELF_MANAGEMENT_ID;
                      const onDay = b.weekdays.includes(selWd);
                      return (
                        <div key={b.headId} className={`bp-head${flashCls(b.headId)}`}>
                          <div className={`bp-row bp-head-row hir-line${onDay ? "" : " bp-offday"}`}
                            draggable={!locked && !pinned}
                            onDragStart={() => { dragId.current = b.headId; }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => dropOn(b.headId)}>
                            {pinned
                              ? <span className="bp-pin" data-tip="Pinned — Self-Management is protected overhead (subtracted before the residual)">◆</span>
                              : <span className="bp-drag" data-tip="Drag to re-rank (fill order at SOD)">⋮⋮</span>}
                            {!pinned && (
                              <span className="bp-arrows">
                                <button aria-label={`Move ${headName(b.headId)} up`} disabled={locked} onClick={() => move(b.headId, -1)}>▲</button>
                                <button aria-label={`Move ${headName(b.headId)} down`} disabled={locked} onClick={() => move(b.headId, 1)}>▼</button>
                              </span>
                            )}
                            <button className="bp-name bp-head-name" onClick={() => setExpanded(expanded === b.headId ? null : b.headId)}>
                              {headName(b.headId)}
                            </button>
                            {b.kind === "percent" && (
                              <>
                                <PctInput ariaLabel={`${headName(b.headId)} percent`} value={b.pct ?? 0} disabled={locked} onCommit={(p) => setHeadPct(b.headId, p)} />
                                <span className="bp-badge num" data-tip="Live-elastic: % of netCore, reflows as overhead changes">
                                  → {fmtDurUnits(line?.minutes ?? 0)}
                                </span>
                              </>
                            )}
                            {b.kind === "absolute" && (
                              <DurInput ariaLabel={`${headName(b.headId)} daily budget`} value={fixedShare(b, selWd) || (b.minutes ?? 0)} disabled={locked} onCommit={(m) => { if (m !== null) setHeadValue(b.headId, m); }} />
                            )}
                            {b.kind === "weekly" && (
                              <>
                                <DurInput ariaLabel={`${headName(b.headId)} weekly quota`} value={b.quotaMinutes ?? 0} disabled={locked} onCommit={(m) => { if (m !== null) setHeadValue(b.headId, m); }} />
                                <span className="bp-badge num" data-tip={`Weekly quota (${QUOTA_LABEL[b.quotaType ?? "atLeast"]}) — ${WD[selWd]}'s share`}>
                                  /wk · {fmtDurUnits(onDay ? weeklyShare(b, selWd) : 0)}
                                </span>
                              </>
                            )}
                            {!onDay && <span className="bp-badge">not {WD[selWd]}</span>}
                          </div>
                          {/* §11.8a: read-only sub-heads under the head, plus its own
                           * `+` to grow the registry only (no template/task made). */}
                          <div className="bp-subheads">
                            {(registry[b.headId] ?? []).map((sub) => (
                              <span key={sub} className="bp-subhead-chip">{sub}</span>
                            ))}
                            {addingSubhead === b.headId ? (
                              <input
                                className="bp-subhead-input"
                                autoFocus
                                aria-label={`New sub-head for ${headName(b.headId)}`}
                                value={newSubhead}
                                placeholder="Sub-head name…"
                                onChange={(e) => setNewSubhead(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") { e.stopPropagation(); setAddingSubhead(null); setNewSubhead(""); }
                                }}
                                onBlur={() => {
                                  if (newSubhead.trim()) addActivity(b.headId, newSubhead.trim());
                                  setAddingSubhead(null);
                                  setNewSubhead("");
                                }}
                              />
                            ) : (
                              <AddCircleButton label={`Add a sub-head to ${headName(b.headId)}`} tip="Add a sub-head to this head" size={18}
                                onClick={() => setAddingSubhead(b.headId)} />
                            )}
                          </div>
                          {expanded === b.headId && (
                            <div className="bp-editor">
                              <div className="field">
                                <label>Budget kind</label>
                                <div className="type-chips" role="radiogroup" aria-label="Budget kind">
                                  <button type="button" className={`type-chip${b.kind === "absolute" ? " active" : ""}`} data-status="budgeted" disabled={locked} onClick={() => setKind(b.headId, "absolute")}>Daily hours</button>
                                  {b.categoryId === CORE_WORK && !pinned && (
                                    <button type="button" className={`type-chip${b.kind === "percent" ? " active" : ""}`} data-status="budgeted" disabled={locked} onClick={() => setKind(b.headId, "percent")} data-tip="% of netCore — only Core Work heads get this">% of core</button>
                                  )}
                                  <button type="button" className={`type-chip${b.kind === "weekly" ? " active" : ""}`} data-status="budgeted" disabled={locked} onClick={() => setKind(b.headId, "weekly")}>Weekly quota</button>
                                </div>
                              </div>
                              {b.kind === "weekly" && (
                                <div className="field">
                                  <label>Quota type</label>
                                  <div className="type-chips" role="radiogroup" aria-label="Quota type">
                                    {(["atLeast", "atMost", "exact"] as QuotaType[]).map((q) => (
                                      <button key={q} type="button" className={`type-chip${(b.quotaType ?? "atLeast") === q ? " active" : ""}`} data-status="semi-head" disabled={locked} onClick={() => setQuotaType(b.headId, q)}>
                                        {QUOTA_LABEL[q]}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="field">
                                <label>Planned on</label>
                                <div className="type-chips" role="group" aria-label={`${headName(b.headId)} weekdays`}>
                                  {WD.map((w, d) => (
                                    <button key={d} type="button" className={`type-chip${b.weekdays.includes(d) ? " active" : ""}`} data-status="budgeted" disabled={locked} onClick={() => toggleWeekday(b.headId, d)}>
                                      {w}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {b.kind !== "percent" && onDay && (
                                <div className="field">
                                  <label>{WD[selWd]} override <span className="field-desc">(this weekday only — blank = default)</span></label>
                                  <DurInput ariaLabel={`${headName(b.headId)} ${WD[selWd]} override`}
                                    value={b.kind === "weekly" ? b.shares?.[selWd] : b.perDay?.[selWd]}
                                    placeholder={fmtDurUnits(fixedShare(b, selWd))} allowEmpty disabled={locked}
                                    onCommit={(m) => setDayOverride(b.headId, m)} />
                                </div>
                              )}
                              <div className="bp-editor-foot">
                                <button className="cancel-accent delete-btn" disabled={locked} onClick={() => removeHead(b.headId)}>Remove budget</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                )}
              </div>
            );
          })}

          <div className="bp-add">
            <select aria-label="Add a head budget" disabled={locked || unbudgeted.length === 0} value=""
              onChange={(e) => { if (e.target.value) addHead(e.target.value); }}>
              <option value="">+ Budget a head…</option>
              {unbudgeted.map((h) => (
                <option key={h} value={h}>{headName(h)} ({categoryFor(h)})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <SnapToast text={toast} />
    </div>
  );
}

/** Smart duration input (§7.0.2 parity): casual parse, reformat on blur/Enter.
 * `allowEmpty` maps a cleared field to null (remove the value). Exported —
 * every duration field app-wide must ride this (smart-input parity law). */
/** The shared smart DURATION field (§7.0.2 smart-input + §7.0.5 symmetry):
 * casual parse → snap → reformat on blur, PLUS the ±5-min stepper every
 * time/duration input carries (ruled 2026-07-16 — steppers on every surface,
 * not just the drawer). Reuses the `.time-stepper` chrome (tab-skipped chevrons).
 * `step` is the nudge granularity (default 5); `min` floors the stepped value. */
export function DurInput({ value, onCommit, disabled, ariaLabel, placeholder, allowEmpty, step = 5, min = 0 }: {
  value: number | undefined;
  onCommit: (minutes: number | null) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  allowEmpty?: boolean;
  step?: number;
  min?: number;
}): JSX.Element {
  const [str, setStr] = useState(value !== undefined ? fmtDurUnits(value) : "");
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setStr(value !== undefined ? fmtDurUnits(value) : "");
  }
  const commit = (): void => {
    const t = str.trim();
    if (t === "" && allowEmpty) return onCommit(null);
    const m = parseCasualDuration(t);
    if (m === undefined || m < 0) {
      setStr(value !== undefined ? fmtDurUnits(value) : "");
      return;
    }
    setStr(fmtDurUnits(m));
    onCommit(m);
  };
  const nudge = (dir: 1 | -1): void => {
    if (disabled) return;
    const base = parseCasualDuration(str.trim()) ?? value ?? 0;
    const next = Math.max(min, base + dir * step);
    setStr(fmtDurUnits(next));
    onCommit(next);
  };
  // A duration has no date → no calendar (§7.0.5 exemption).
  return (
    <StepperField
      text={str}
      onText={setStr}
      onCommit={commit}
      onStep={nudge}
      ariaLabel={ariaLabel}
      disabled={disabled}
      placeholder={placeholder ?? "e.g. 1h 30m"}
    />
  );
}

/** Percent input with the same commit-on-blur discipline; % text stays shown. */
function PctInput({ value, onCommit, disabled, ariaLabel }: {
  value: number;
  onCommit: (pct: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}): JSX.Element {
  const [str, setStr] = useState(`${value}%`);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setStr(`${value}%`);
  }
  const commit = (): void => {
    const p = parseFloat(str.replace("%", "").trim());
    if (!Number.isFinite(p)) {
      setStr(`${value}%`);
      return;
    }
    onCommit(p);
  };
  return (
    <input className="num bp-input bp-pct" value={str} aria-label={ariaLabel} disabled={disabled}
      onChange={(e) => setStr(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
  );
}
