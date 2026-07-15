/**
 * §11 + §5.1 budgeting math. Covers: netCore chain, % of netCore literal + the
 * core-envelope fit (incl. the spec's worked example), the 24h gate, weekly
 * quota shares (even split + overrides) in the sum, Category roll-up + explicit
 * hard-fit targets, snap-target computation, balance-by-construction under
 * overhead change, and §5.1 redistribution (shortfall + exact overshoot).
 */
import { describe, it, expect } from "vitest";
import {
  MIN_PER_DAY,
  CORE_WORK,
  MAINTENANCE,
  NOT_WORK,
  SELF_MANAGEMENT,
  evenShares,
  weeklyShare,
  netCore,
  resolveDay,
  snapTo24h,
  snapPctToCoreFit,
  snapToCategoryTarget,
  redistributeShortfall,
  redistributeOvershoot,
  type HeadBudget,
} from "../src/index.js";

const H = 60;
const ALL = [0, 1, 2, 3, 4, 5, 6];
const MON = 1;

const abs = (headId: string, categoryId: string, hours: number, weekdays = ALL): HeadBudget => ({
  headId,
  categoryId,
  kind: "absolute",
  minutes: hours * H,
  weekdays,
});
const pct = (headId: string, p: number, weekdays = ALL): HeadBudget => ({
  headId,
  categoryId: CORE_WORK,
  kind: "percent",
  pct: p,
  weekdays,
});
const weekly = (
  headId: string,
  categoryId: string,
  hours: number,
  weekdays: number[],
  over?: Partial<HeadBudget>,
): HeadBudget => ({
  headId,
  categoryId,
  kind: "weekly",
  quotaMinutes: hours * H,
  quotaType: "atLeast",
  weekdays,
  ...over,
});

/** Overhead fixture: Sleep 8h + Maintenance 4h + Self-Management 2h → netCore 10h. */
const overhead: HeadBudget[] = [
  abs("Sleep", MAINTENANCE, 8),
  abs("Cleaning", MAINTENANCE, 4),
  abs(SELF_MANAGEMENT, CORE_WORK, 2),
];

describe("netCore subtraction chain (§11.3)", () => {
  it("subtracts non-core fixed shares and Self-Management; abs core does NOT subtract", () => {
    expect(netCore(overhead, MON)).toBe(10 * H);
    // an absolute CORE head leaves netCore untouched (claims from it instead)
    expect(netCore([...overhead, abs("Job", CORE_WORK, 2)], MON)).toBe(10 * H);
  });

  it("weekly non-core shares subtract like absolutes", () => {
    const gym = weekly("Gym", MAINTENANCE, 5, [1, 2, 3, 4, 5]); // 1h/day share
    expect(netCore([...overhead, gym], MON)).toBe(9 * H);
  });

  it("clamps at 0 when overhead exceeds the day", () => {
    expect(netCore([abs("Sleep", MAINTENANCE, 30)], MON)).toBe(0);
  });
});

describe("the spec's worked example (§11.3): netCore 10h, Job(abs core) 2h", () => {
  const entries = [...overhead, abs("Job", CORE_WORK, 2), pct("Deep Work", 50), pct("Learning", 30)];

  it("% is literally % of netCore: 50% → 5h, 30% → 3h", () => {
    const shape = resolveDay(entries, MON);
    const mins = Object.fromEntries(shape.lines.map((l) => [l.headId, l.minutes]));
    expect(mins["Deep Work"]).toBe(5 * H);
    expect(mins["Learning"]).toBe(3 * H);
  });

  it("core fit holds (Σpct forced to 80) and the day balances to exactly 24h", () => {
    const shape = resolveDay(entries, MON);
    expect(shape.coreFit.requiredPctSum).toBeCloseTo(80);
    expect(shape.coreFit.ok).toBe(true);
    expect(shape.total).toBe(MIN_PER_DAY);
    expect(shape.ok).toBe(true);
    expect(shape.delta).toBe(0);
  });

  it("breaching the fit is caught and the snap names the culprit's restoring pct", () => {
    const broken = [...overhead, abs("Job", CORE_WORK, 2), pct("Deep Work", 50), pct("Learning", 40)];
    const shape = resolveDay(broken, MON);
    expect(shape.coreFit.ok).toBe(false);
    expect(snapPctToCoreFit(broken, MON, "Learning")).toBeCloseTo(30);
  });
});

describe("balance by construction (§11.3)", () => {
  it("overhead change reflows % hours; the day stays exactly 24h with Σpct=100", () => {
    const mk = (cleanHrs: number): HeadBudget[] => [
      abs("Sleep", MAINTENANCE, 8),
      abs("Cleaning", MAINTENANCE, cleanHrs),
      abs(SELF_MANAGEMENT, CORE_WORK, 2),
      pct("Deep Work", 60),
      pct("Learning", 40),
    ];
    for (const cleanHrs of [1, 3, 5.5]) {
      const shape = resolveDay(mk(cleanHrs), MON);
      expect(shape.total).toBe(MIN_PER_DAY);
      expect(shape.ok).toBe(true);
      expect(shape.coreFit.ok).toBe(true);
    }
  });

  it("odd netCore: largest-remainder keeps integer minutes conserved", () => {
    const entries: HeadBudget[] = [
      abs("Sleep", MAINTENANCE, 8),
      { headId: "Errand", categoryId: MAINTENANCE, kind: "absolute", minutes: 7, weekdays: ALL },
      abs(SELF_MANAGEMENT, CORE_WORK, 2),
      pct("A", 33.3),
      pct("B", 33.3),
      pct("C", 33.4),
    ];
    const shape = resolveDay(entries, MON);
    expect(shape.coreFit.ok).toBe(true);
    expect(shape.total).toBe(MIN_PER_DAY); // no lost/phantom minute
  });
});

describe("the 24h gate (§11.2)", () => {
  it("under → delta positive (needs X more), blocked", () => {
    const shape = resolveDay([abs("Sleep", MAINTENANCE, 8)], MON);
    expect(shape.ok).toBe(false);
    expect(shape.delta).toBe(16 * H);
  });

  it("over → delta negative; snapTo24h returns the restoring value", () => {
    const entries = [...overhead, abs("Job", CORE_WORK, 12)]; // 8+4+2+12 = 26h
    const shape = resolveDay(entries, MON);
    expect(shape.delta).toBe(-2 * H);
    expect(snapTo24h(entries, MON, "Job")).toBe(10 * H);
  });

  it("snapTo24h clamps at 0 when even removal can't restore", () => {
    const entries = [abs("Sleep", MAINTENANCE, 30), abs("Cleaning", MAINTENANCE, 2)];
    expect(snapTo24h(entries, MON, "Cleaning")).toBe(0);
  });
});

describe("weekly quotas in the day shape (§5.1)", () => {
  it("even split: first weekdays carry the remainder minute", () => {
    expect(evenShares(10 * H, [1, 2, 3])).toEqual({ 1: 200, 2: 200, 3: 200 });
    expect(evenShares(100, [1, 2, 3])).toEqual({ 1: 34, 2: 33, 3: 33 });
  });

  it("explicit share overrides win; other days keep the even split", () => {
    const b = weekly("Job Search", CORE_WORK, 10, [1, 2, 3, 4, 5], { shares: { 1: 4 * H } });
    expect(weeklyShare(b, 1)).toBe(4 * H);
    expect(weeklyShare(b, 2)).toBe(2 * H); // even split of the FULL quota (shape, not remainder)
    expect(weeklyShare(b, 0)).toBe(0); // not planned that day
  });

  it("weekly CORE shares claim from netCore like absolute core (fit + gate hold)", () => {
    const entries = [
      ...overhead,
      weekly("Job Search", CORE_WORK, 10, [1, 2, 3, 4, 5]), // 2h/day
      pct("Deep Work", 80), // 8h of 10h netCore
    ];
    const shape = resolveDay(entries, MON);
    expect(shape.netCore).toBe(10 * H);
    expect(shape.coreFit.absCore).toBe(2 * H);
    expect(shape.coreFit.ok).toBe(true);
    expect(shape.total).toBe(MIN_PER_DAY);
  });
});

describe("Category roll-up + explicit hard fit (§11.6)", () => {
  const entries = [...overhead, abs("Job", CORE_WORK, 2), pct("Deep Work", 80)];

  it("rolls up resolved minutes per Category (no target → ok)", () => {
    const shape = resolveDay(entries, MON);
    const maint = shape.categories.find((c) => c.categoryId === MAINTENANCE)!;
    const core = shape.categories.find((c) => c.categoryId === CORE_WORK)!;
    expect(maint.minutes).toBe(12 * H);
    expect(core.minutes).toBe(12 * H); // SM 2 + Job 2 + Deep Work 8
    expect(maint.ok && core.ok).toBe(true);
  });

  it("explicit target becomes a hard fit; snap restores it", () => {
    const shape = resolveDay(entries, MON, { [MAINTENANCE]: 11 * H });
    const maint = shape.categories.find((c) => c.categoryId === MAINTENANCE)!;
    expect(maint.ok).toBe(false);
    expect(snapToCategoryTarget(entries, MON, "Cleaning", 11 * H)).toBe(3 * H);
  });
});

describe("redistribution (§5.1)", () => {
  it("shortfall goes availability-weighted, capped by the elastic residual", () => {
    const r = redistributeShortfall(3 * H, [
      { weekday: 4, share: 2 * H, netCore: 10 * H }, // avail 8h
      { weekday: 5, share: 2 * H, netCore: 6 * H }, // avail 4h
    ]);
    expect(r.unplaced).toBe(0);
    expect(r.deltas).toEqual([
      { weekday: 4, delta: 2 * H },
      { weekday: 5, delta: 1 * H },
    ]);
  });

  it("equal availability → original shape tiebreak", () => {
    const r = redistributeShortfall(90, [
      { weekday: 4, share: 2 * H, netCore: 8 * H }, // avail 6h
      { weekday: 5, share: 1 * H, netCore: 7 * H }, // avail 6h
    ]);
    expect(r.deltas).toEqual([
      { weekday: 4, delta: 60 },
      { weekday: 5, delta: 30 },
    ]);
  });

  it("caps at capacity; the rest is reported unplaced, never dropped", () => {
    const r = redistributeShortfall(5 * H, [{ weekday: 5, share: 2 * H, netCore: 3 * H }]);
    expect(r.deltas).toEqual([{ weekday: 5, delta: 1 * H }]);
    expect(r.unplaced).toBe(4 * H);
  });

  it("no remaining days → everything unplaced", () => {
    expect(redistributeShortfall(2 * H, [])).toEqual({ deltas: [], unplaced: 2 * H });
  });

  it("exact overshoot trims future shares proportionally, clamped ≥ 0", () => {
    const r = redistributeOvershoot(90, [
      { weekday: 4, share: 2 * H, netCore: 10 * H },
      { weekday: 5, share: 1 * H, netCore: 10 * H },
    ]);
    expect(r.deltas).toEqual([
      { weekday: 4, delta: -60 },
      { weekday: 5, delta: -30 },
    ]);
    expect(r.unplaced).toBe(0);
    const over = redistributeOvershoot(4 * H, [{ weekday: 5, share: 1 * H, netCore: 10 * H }]);
    expect(over.deltas).toEqual([{ weekday: 5, delta: -60 }]);
    expect(over.unplaced).toBe(3 * H);
  });

  it("conservation: Σdeltas + unplaced === shortfall (property sweep)", () => {
    for (let s = 0; s <= 500; s += 37) {
      const r = redistributeShortfall(s, [
        { weekday: 2, share: 45, netCore: 300 },
        { weekday: 3, share: 120, netCore: 200 },
        { weekday: 4, share: 0, netCore: 90 },
      ]);
      const placed = r.deltas.reduce((a, d) => a + d.delta, 0);
      expect(placed + r.unplaced).toBe(s);
      for (const d of r.deltas) expect(d.delta).toBeGreaterThan(0);
    }
  });
});
