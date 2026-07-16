/**
 * Analytics — the 24h zero-sum ledger (SPEC VI.3), first slice: a full screen.
 * Today: hero Accounted / Wasted / Lost (elapsed wall = accounted + lost) +
 * per-head achieved table. This week: per-head × last-7-days achieved grid.
 * Time-blind: durations only, never start/end times. Target/Remaining columns
 * arrive with quotas (§5.1); days are calendar days until §4 sleep-cycles.
 */

import type { Dur, Min, State } from "@maxtellar/core";
import { LOST_HOURS, SLEEP_HEAD, budgetEntries, trimDeficit, weekDayShape } from "@maxtellar/core";
import { useEscClose } from "../useEscClose";
import { fmtDur, toDate } from "../time";

interface Props {
  state: State;
  onBack: () => void;
}

/** Local-midnight Min stamp for the calendar day containing `min`. */
function dayStart(min: Min): Min {
  const d = toDate(min);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 60000);
}

const DAY = 24 * 60;

/** Minutes of [start,end) falling inside the [winStart,winEnd) window. */
function overlap(start: Min, end: Min, winStart: Min, winEnd: Min): Dur {
  return Math.max(0, Math.min(end, winEnd) - Math.max(start, winStart));
}

/** Achieved minutes per head inside a window: occupancy history clipped to it,
 * plus the running task's live spend (it is real elapsed work too). Lost Hours
 * (§4.2 SOD-booked gutter) is excluded — it is not achieved work, it's reported
 * as its own Lost figure so the zero-sum identity wall = accounted + lost holds. */
function achievedByHead(state: State, winStart: Min, winEnd: Min): Map<string, Dur> {
  const byHead = new Map<string, Dur>();
  const add = (head: string, mins: Dur): void => {
    if (mins <= 0) return;
    byHead.set(head, (byHead.get(head) ?? 0) + mins);
  };
  for (const h of state.history) {
    if (h.kind !== "occupancy" || h.headId === LOST_HOURS) continue;
    add(h.headId, overlap(h.start, h.end, winStart, winEnd));
  }
  if (state.running) {
    add(state.running.headId, overlap(state.running.startedAt, state.now, winStart, winEnd));
  }
  return byHead;
}

/** §11 Stage 5 — budget vs achieved. Today's day-shape lines against today's
 * achieved (Sleep matched by sleepKind — its occupancy books under Recharge),
 * plus weekly-quota fulfillment with the §5.1 type semantics: at-least "to go",
 * at-most warn-on-over (track, never block), exact both ways. Redistributed
 * shares (the SOD ledger) are shown so a moved share is never a silent change. */
function BudgetSection({ state, todayStart, todayByHead }: {
  state: State;
  todayStart: Min;
  todayByHead: Map<string, Dur>;
}): JSX.Element | null {
  const week = state.week;
  if (week.budgets.length === 0) return null;
  const weekday = toDate(state.now).getDay();
  const isOff = week.offDays.includes(weekday);
  const shape = weekDayShape(week, weekday);
  const entries = budgetEntries(week); // quotaAdjust folded into shares

  const sleepToday = state.history
    .filter((h) => h.kind === "occupancy" && h.sleepKind === "sleep")
    .reduce((a, h) => a + overlap(h.start, h.end, todayStart, todayStart + DAY), 0);
  const achievedFor = (headId: string): Dur => (headId === SLEEP_HEAD ? sleepToday : todayByHead.get(headId) ?? 0);

  // Weekly quotas: achieved since the week started (or the last 7 days when no
  // week is running — degrade gracefully, §4.4 reality 3).
  const winStart = week.startedAt ?? todayStart - 6 * DAY;
  const weekAchieved = (headId: string): Dur =>
    state.history
      .filter((h) => h.kind === "occupancy" && h.headId === headId && h.headId !== LOST_HOURS)
      .reduce((a, h) => a + overlap(h.start, h.end, winStart, state.now), 0) +
    (state.running?.headId === headId ? overlap(state.running.startedAt, state.now, winStart, state.now) : 0);

  const weeklies = entries.filter((b) => b.kind === "weekly");

  return (
    <div className="config-section">
      <h3>Budgets</h3>
      {isOff ? (
        <span className="config-empty">today is an OFF day — no day-shape to compare against</span>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Head</th>
              <th className="num-col">Budget today</th>
              <th className="num-col">Achieved</th>
              <th className="num-col">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {shape.lines.filter((l) => l.minutes > 0).map((l) => {
              const ach = achievedFor(l.headId);
              const rem = l.minutes - ach;
              return (
                <tr key={l.headId}>
                  <td>{l.headId}{l.pct !== undefined ? ` (${l.pct}%)` : ""}</td>
                  <td className="num num-col">{fmtDur(l.minutes)}</td>
                  <td className="num num-col">{ach > 0 ? fmtDur(ach) : "—"}</td>
                  <td className={`num num-col${rem < 0 ? " is-danger" : ""}`}>{rem >= 0 ? fmtDur(rem) : `over ${fmtDur(-rem)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {weeklies.length > 0 && (
        <>
          <h4 className="ledger-subhead">Weekly quotas</h4>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Head</th>
                <th>Type</th>
                <th className="num-col">Quota</th>
                <th className="num-col">Achieved</th>
                <th className="num-col">Standing</th>
              </tr>
            </thead>
            <tbody>
              {weeklies.map((b) => {
                const quota = b.quotaMinutes ?? 0;
                const ach = weekAchieved(b.headId);
                const type = b.quotaType ?? "atLeast";
                const diff = quota - ach;
                const label = type === "atLeast" ? "at least" : type === "atMost" ? "at most" : "exact";
                const standing =
                  type === "atMost"
                    ? diff >= 0
                      ? `${fmtDur(diff)} headroom`
                      : `over by ${fmtDur(-diff)}`
                    : diff > 0
                      ? `${fmtDur(diff)} to go`
                      : type === "exact" && diff < 0
                        ? `over by ${fmtDur(-diff)}`
                        : "met ✓";
                const danger = (type === "atMost" && diff < 0) || (type === "exact" && diff !== 0 && ach > quota);
                const moved = week.quotaAdjust.filter((q) => q.headId === b.headId && q.kind !== "trim").reduce((a, q) => a + Math.abs(q.delta), 0);
                const trimmed = trimDeficit(week, b.headId);
                return (
                  <tr key={b.headId}>
                    <td>
                      {b.headId}
                      {moved > 0 && <span className="ledger-note" data-tip="Shares were redistributed at SOD (§5.1) — shortfall moved to later days">{" "}· redistributed</span>}
                      {trimmed > 0 && <span className="ledger-note is-danger" data-tip="Trimmed during Pruning (§5.1) — the cut never redistributes; it stays reported until week's end">{" "}· trimmed, {fmtDur(trimmed)} deficit</span>}
                    </td>
                    <td>{label}</td>
                    <td className="num num-col">{fmtDur(quota)}</td>
                    <td className="num num-col">{ach > 0 ? fmtDur(ach) : "—"}</td>
                    <td className={`num num-col${danger ? " is-danger" : ""}`}>{standing}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="field-desc">Nothing carries beyond the week — unmet quota is reported as shortfall at week's end (§5.1). Today's shares include any SOD redistribution.</p>
        </>
      )}
    </div>
  );
}

export function AnalyticsScreen({ state, onBack }: Props): JSX.Element {
  useEscClose(onBack);

  const todayStart = dayStart(state.now);
  const wall = state.now - todayStart; // elapsed wall today

  const todayByHead = achievedByHead(state, todayStart, todayStart + DAY);
  const accounted = [...todayByHead.values()].reduce((a, b) => a + b, 0);
  const lost = Math.max(0, wall - accounted); // zero-sum: wall = accounted + lost

  // Wasted is a channel within accounted work, reported alongside (§2.6).
  const wasted =
    state.history
      .filter((h) => h.kind === "occupancy" && h.start >= todayStart)
      .reduce((a, h) => a + h.channels.wasted, 0) + (state.running?.channels.wasted ?? 0);

  // This week: today and the 6 days before it, oldest → newest.
  const weekDays: Min[] = Array.from({ length: 7 }, (_, i) => todayStart - (6 - i) * DAY);
  const weekByDay = weekDays.map((ws) => achievedByHead(state, ws, ws + DAY));
  const weekHeads = [...new Set(weekByDay.flatMap((m) => [...m.keys()]))].sort();
  const dayLabel = (ws: Min): string => toDate(ws).toLocaleDateString(undefined, { weekday: "short" });

  return (
    <div className="config-screen">
      <div className="config-header">
        <button className="theme-toggle" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>Analytics</h2>
      </div>
      <div className="config-body analytics-body">
        <div className="config-section">
          <h3>Today</h3>
          <div className="ledger-hero">
            <div className="stat">
              <span className="stat-label">Accounted</span>
              <span className="stat-value num">{fmtDur(accounted)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Wasted</span>
              <span className={`stat-value num${wasted > 0 ? " is-danger" : ""}`}>{fmtDur(wasted)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Lost</span>
              <span className={`stat-value num${lost > 0 ? " is-danger" : ""}`}>{fmtDur(lost)}</span>
            </div>
          </div>
          {todayByHead.size === 0 ? (
            <span className="config-empty">no work accounted yet today</span>
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Head</th>
                  <th className="num-col">Achieved</th>
                </tr>
              </thead>
              <tbody>
                {[...todayByHead.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([head, mins]) => (
                    <tr key={head}>
                      <td>{head}</td>
                      <td className="num num-col">{fmtDur(mins)}</td>
                    </tr>
                  ))}
                <tr className="totals">
                  <td>Accounted</td>
                  <td className="num num-col">{fmtDur(accounted)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <BudgetSection state={state} todayStart={todayStart} todayByHead={todayByHead} />

        <div className="config-section">
          <h3>This week</h3>
          {weekHeads.length === 0 ? (
            <span className="config-empty">no work accounted this week</span>
          ) : (
            <div className="ledger-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Head</th>
                    {weekDays.map((ws) => (
                      <th key={ws} className="num-col">{dayLabel(ws)}</th>
                    ))}
                    <th className="num-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weekHeads.map((head) => {
                    const cells = weekByDay.map((m) => m.get(head) ?? 0);
                    const total = cells.reduce((a, b) => a + b, 0);
                    return (
                      <tr key={head}>
                        <td>{head}</td>
                        {cells.map((mins, i) => (
                          <td key={i} className="num num-col">{mins > 0 ? fmtDur(mins) : "—"}</td>
                        ))}
                        <td className="num num-col">{fmtDur(total)}</td>
                      </tr>
                    );
                  })}
                  <tr className="totals">
                    <td>Accounted</td>
                    {weekByDay.map((m, i) => {
                      const t = [...m.values()].reduce((a, b) => a + b, 0);
                      return (
                        <td key={i} className="num num-col">{t > 0 ? fmtDur(t) : "—"}</td>
                      );
                    })}
                    <td className="num num-col">
                      {fmtDur(weekByDay.reduce((a, m) => a + [...m.values()].reduce((x, y) => x + y, 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
