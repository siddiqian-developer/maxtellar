/**
 * §4.4 one-time/ranged template validity (ruled in-scope 2026-07-16).
 *  - `once`   fires on its next matching-weekday occurrence, then RETIRES
 *             (firedOn set at injection; never fires again).
 *  - `ranged` fires only within [from, to] (inclusive local-midnight epochs).
 */
import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  injectToday,
  templateValidOn,
  rankAfter,
  type State,
  type WeekTemplate,
} from "../src/index.js";

const H = 60;
const DAY = 1440;
const DAY0 = 0;
const MON = 1;
const SUN = 0;

function tpl(over: Partial<WeekTemplate> & { title: string; weekdays: number[] }): WeekTemplate {
  return {
    id: over.id ?? over.title,
    rank: over.rank ?? "m",
    headId: "Work",
    activityId: "Coding",
    timing: "budgeted",
    tier: "normal",
    ommf: false,
    slideable: true,
    breakable: true,
    budget: 30,
    ...over,
  } as WeekTemplate;
}

const titlesInjected = (s: State, midnight: number, weekday: number): string[] => {
  let n = 0;
  return injectToday(s, midnight, weekday, () => `i-${++n}`, (p) => rankAfter(p)).map((t) => t.title);
};

describe("templateValidOn (§4.4)", () => {
  it("always (no validity) fires on its weekday", () => {
    expect(templateValidOn(tpl({ title: "T", weekdays: [MON] }), DAY0)).toBe(true);
  });
  it("once fires until it has a firedOn, then never again", () => {
    expect(templateValidOn(tpl({ title: "T", weekdays: [MON], validity: { kind: "once" } }), DAY0)).toBe(true);
    expect(templateValidOn(tpl({ title: "T", weekdays: [MON], validity: { kind: "once", firedOn: DAY0 } }), DAY0 + DAY)).toBe(false);
  });
  it("ranged fires only inside [from, to] (either edge open)", () => {
    const t = tpl({ title: "T", weekdays: [MON], validity: { kind: "ranged", from: DAY, to: 3 * DAY } });
    expect(templateValidOn(t, 0)).toBe(false); // before from
    expect(templateValidOn(t, DAY)).toBe(true); // at from
    expect(templateValidOn(t, 3 * DAY)).toBe(true); // at to
    expect(templateValidOn(t, 4 * DAY)).toBe(false); // after to
    const openTo = tpl({ title: "T", weekdays: [MON], validity: { kind: "ranged", from: DAY } });
    expect(templateValidOn(openTo, 10 * DAY)).toBe(true);
  });
});

describe("injection respects validity", () => {
  const withWeek = (templates: WeekTemplate[]): State => ({
    ...initialState(DAY0),
    week: { ...initialState(DAY0).week, startedAt: DAY0, firstWeekday: MON, offDays: [SUN], templates },
  });

  it("a ranged template outside its window does not inject", () => {
    const s = withWeek([
      tpl({ title: "Recur", weekdays: [MON], rank: "a" }),
      tpl({ title: "Windowed", weekdays: [MON], rank: "b", validity: { kind: "ranged", from: DAY } }),
    ]);
    expect(titlesInjected(s, DAY0, MON)).toEqual(["Recur"]); // DAY0 < from
    expect(titlesInjected(s, 7 * DAY, MON)).toEqual(["Recur", "Windowed"]); // inside window
  });

  it("a fired once template does not inject; an un-fired one does", () => {
    const s = withWeek([tpl({ title: "OneOff", weekdays: [MON], validity: { kind: "once" } })]);
    expect(titlesInjected(s, DAY0, MON)).toEqual(["OneOff"]);
    const fired = withWeek([tpl({ title: "OneOff", weekdays: [MON], validity: { kind: "once", firedOn: DAY0 } })]);
    expect(titlesInjected(fired, 7 * DAY, MON)).toEqual([]);
  });
});

describe("PRUNING_DONE retires a once template that fired", () => {
  it("marks firedOn so the next SOD does not re-inject it", () => {
    let s: State = {
      ...initialState(9 * H),
      ceremony: { phase: "pruning" },
      week: {
        ...initialState(DAY0).week,
        startedAt: DAY0,
        firstWeekday: MON,
        offDays: [SUN],
        templates: [tpl({ title: "OneOff", weekdays: [MON], validity: { kind: "once" } })],
      },
    };
    s = reduce(s, { type: "PRUNING_DONE", inject: { midnight: DAY0, weekday: MON } });
    // it injected once…
    expect(s.plan.some((i) => i.kind === "task" && i.title === "OneOff")).toBe(true);
    // …and the template is now retired (firedOn set).
    const t = s.week.templates.find((x) => x.title === "OneOff");
    expect(t?.validity).toEqual({ kind: "once", firedOn: DAY0 });
    // a later SOD injects nothing more from it.
    expect(titlesInjected(s, 7 * DAY, MON)).toEqual([]);
  });
});
