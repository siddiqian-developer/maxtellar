/**
 * Task entry drawer (SPEC VI): tappable type chips with pre-fills (default:
 * budgeted @ 00:30), dynamic required/optional/not-used field labels, HH:MM
 * budget, searchable sub-head (activity) dropdown with auto-derived read-only
 * head (§2.1: Head/Activity hierarchy — "flat heads" = this two-level shape,
 * not a single flat field), all §2.5 behavior flags with the validity matrix
 * enforced live, Esc to close. Type derives from field presence (§3.6);
 * tapping a chip pre-fills its fields — the app never says no.
 */

import { useEffect, useMemo, useState } from "react";
import type { Event, PomodoroConfig, State, TimingType } from "@maxtellar/core";
import { useHeads } from "../heads";
import { headName } from "@maxtellar/core";
import { headLabels } from "../headDisplay";
import { useSettings } from "../settings";
import { matchPreset, resolvePreset, type PresetConfig } from "../presets";
import { parseCasualTime, parseCasualDuration, dayStartMin } from "../casualTime";
import { parseTitleGrammar, resolveHash } from "../titleGrammar";
import { fmtDayTime, fmtDurUnits } from "../time";
import { DatePicker } from "./DatePicker";
import { DurInput } from "./BudgetPanel";
import { StepperField } from "./StepperField";
import { TaskOptionsSection, RoleField } from "./TaskSpecFields";
import { useEscClose } from "../useEscClose";
import { useSubheadSuggestion } from "../ml/useSubheadSuggestion";
import { useHeadSuggestion } from "../ml/useHeadSuggestion";
import { recordTitleActivity } from "../ml/suggest";
import { useDecompositionSuggestion } from "../ml/useDecompositionSuggestion";
import { recordDecomposition, suggestDecomposition } from "../ml/decompose";
import { FuzzyDropdown } from "./FuzzyDropdown";

interface Props {
  state: State;
  now: number;
  minFragment: number;
  dispatch: (e: Event) => void;
  onClose: () => void;
}

/** All drawer fields a preset touches — snapshotted on activate so deselecting
 * a pill restores exactly what was there before (§2.9). */
interface FieldSnapshot {
  title: string;
  activity: string;
  subheadSource: "app" | "user";
  startStr: string;
  endStr: string;
  budgetStr: string;
  startMin: number | undefined;
  endMin: number | undefined;
  budgetMin: number | undefined;
  ommf: boolean;
  flags: { slideable?: boolean; breakable?: boolean };
  newHeadChoice: string;
  newHeadTouched: boolean;
}

const DEFAULT_BUDGET = 30;
const MIN_PER_DAY = 1440;

/** The creation table (§3.6), derived live from the day-aware epoch trio. */
function deriveTiming(start?: number, end?: number, budget?: number): TimingType {
  if (start !== undefined && (end !== undefined || budget !== undefined)) return "fixed";
  if (end !== undefined && budget !== undefined) return "fixed";
  if (start !== undefined) return "semi-head";
  if (end !== undefined) return "semi-tail";
  if (budget !== undefined) return "budgeted";
  return "unscheduled";
}

interface Adjustment {
  field: string;
  message: string;
}
interface DeriveResult {
  startMin: number | undefined;
  endMin: number | undefined;
  budgetMin: number | undefined;
  adjustments: Adjustment[];
  /** A one-click "did you mean tomorrow?" offer for a past-time anchor. */
  tomorrow: { field: "start" | "end"; toMin: number } | undefined;
  err: string | null;
}

/**
 * §3.6 field derivation over the day-aware epoch trio (values already absolute
 * epoch minutes / duration minutes). The changed field is authoritative; a
 * second present field derives the third. Collects §7.0.2 meaning-changes:
 * past-time snapped forward (+ a "tomorrow" offer), overnight wrap, and the
 * MIN_FRAGMENT budget floor. Pure — `now`/`hour12` only shape the messages.
 */
function deriveDayAware(
  changed: "start" | "end" | "budget",
  trio: { startMin: number | undefined; endMin: number | undefined; budgetMin: number | undefined },
  explicitDay: { start: boolean; end: boolean },
  now: number,
  minFragment: number,
  fmtT: (m: number) => string,
): DeriveResult {
  let { startMin: s, endMin: e, budgetMin: b } = trio;
  const adjustments: Adjustment[] = [];
  let tomorrow: DeriveResult["tomorrow"];
  let err: string | null = null;

  // Past-time on the CHANGED anchor with no explicit day: keep today, snap
  // forward to a legal instant, notify, and offer tomorrow (§7.0.2 decision).
  if (changed === "start" && s !== undefined && s < now && !explicitDay.start) {
    const orig = s;
    s = now;
    adjustments.push({ field: "start", message: `Start was in the past — moved to ${fmtT(s)} today` });
    tomorrow = { field: "start", toMin: orig + MIN_PER_DAY };
  }
  if (changed === "end" && e !== undefined && e < now && !explicitDay.end) {
    const orig = e;
    e = now + minFragment;
    adjustments.push({ field: "end", message: `End was in the past — moved to ${fmtT(e)} today` });
    tomorrow = { field: "end", toMin: orig + MIN_PER_DAY };
  }

  if (changed === "start" && s !== undefined) {
    if (b !== undefined) e = s + b;
    else if (e !== undefined) {
      if (e <= s && !explicitDay.end) {
        e += MIN_PER_DAY;
        adjustments.push({ field: "end", message: "End was before start — wrapped to the next day" });
      }
      b = e - s;
    }
  } else if (changed === "budget") {
    if (b !== undefined) {
      if (s !== undefined) e = s + b;
      else if (e !== undefined) s = e - b;
    } else if (s !== undefined && e !== undefined) {
      b = e - s;
    }
  } else if (changed === "end" && e !== undefined) {
    if (s !== undefined) {
      if (e <= s && !explicitDay.end) {
        e += MIN_PER_DAY;
        adjustments.push({ field: "end", message: "End was before start — wrapped to the next day" });
      }
      const nb = e - s;
      if (nb === 0) err = "Task duration cannot be zero";
      else b = nb;
    } else if (b !== undefined) {
      s = e - b;
    }
  }

  // MIN_FRAGMENT floor (§7.0.2 snap-at-entry)
  if (b !== undefined && b < minFragment) {
    b = minFragment;
    adjustments.push({ field: "budget", message: `Budget below the ${minFragment}-minute floor — raised to ${fmtDurUnits(minFragment)}` });
    if (s !== undefined) e = s + b; // keep the trio coherent
  }

  return { startMin: s, endMin: e, budgetMin: b, adjustments, tomorrow, err };
}

// The timing-type list lives in ONE place (§7.0.6) — `TIMINGS` in TaskSpecFields,
// rendered by the shared `TimingTypeChips`. It used to be re-declared here as
// `ALL_TIMINGS`, and the copy in TaskSpecFields had already drifted to a
// different order; that divergence is what this law exists to prevent.

// The per-type role table lives in ONE place (§7.0.6) — `FIELD_ROLES` in
// TaskSpecFields, rendered through the shared `RoleField`. It used to be
// duplicated here, and the two copies had drifted *semantically*: this one
// called a semi-head's budget "not used" while `useTaskSpec` demanded one. §3.9
// settles it — a semi-head/semi-tail budget is optional.

export function TaskDrawer({ state, now, minFragment, dispatch, onClose }: Props): JSX.Element {
  const { registry, plannableHeads, plannableActivities, headFor, addActivity } = useHeads();
  const { presetsConfig, timeFormat, aiLevels, showWeekday, pomodoroDefault } = useSettings();
  const hour12 = timeFormat === "12h";
  const fmtT = (m: number): string => fmtDayTime(m, now, hour12, showWeekday);
  // Head-suggester should only ever propose PLANNABLE heads (never the system
  // built-ins Wasted Time / Lost Hours). Feed it a registry filtered to those.
  const plannableRegistry = useMemo(
    () => Object.fromEntries(plannableHeads.map((h) => [h, registry[h] ?? []])),
    [plannableHeads, registry],
  );

  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  // Who SOURCED the sub-head in the field. "app" = autofilled by a suggestion and left
  // untouched. "user" = the user acted on it — typed it, explicitly picked it, or accepted
  // a suggestion via "Use this" (accepting is a user action → user intent). Only app-sourced
  // sub-heads are silently replaced on a later title edit; user-sourced ones carry intent, so
  // they're protected and get the keep-mine choice instead (§7.0.1).
  const [subheadSource, setSubheadSource] = useState<"app" | "user">("app");
  // Starts empty — no static default; only the ML suggestion or the user fills it.
  const [newHeadChoice, setNewHeadChoice] = useState("");
  const [newHeadTouched, setNewHeadTouched] = useState(false);
  // Time fields are day-aware: the epoch `Min` values are the source of truth
  // (§1.6), the *Str buffers are what the user types/sees (formatted per the
  // 12h/24h setting after a commit). default on open: budgeted @ 30m.
  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [budgetStr, setBudgetStr] = useState(fmtDurUnits(DEFAULT_BUDGET));
  const [startMin, setStartMin] = useState<number | undefined>(undefined);
  const [endMin, setEndMin] = useState<number | undefined>(undefined);
  const [budgetMin, setBudgetMin] = useState<number | undefined>(DEFAULT_BUDGET);
  const [ommf, setOmmf] = useState(false);
  const [flags, setFlags] = useState<{ slideable?: boolean; breakable?: boolean }>({});
  // §5.2: start this task as a pomodoro (only meaningful on "Add & start now").
  // Work/break override the global default at Start; long-break + cycles inherit.
  const [pomo, setPomo] = useState(false);
  const [pomoWork, setPomoWork] = useState<number>(pomodoroDefault.workMin);
  const [pomoBreak, setPomoBreak] = useState<number>(pomodoroDefault.breakMin);
  // §2.7 (G24) composition: optional subtasks entered at creation. Each leaf is
  // a title + casual budget; if any are present, the task is created then
  // decomposed (SET_SUBTASKS) so its budget becomes the zero-sum Σ of leaves.
  const [subtasks, setSubtasks] = useState<{ title: string; budgetStr: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  // §7.0.2 universal snap-notify: every meaning-changing adjustment made on a
  // commit (past-time moved, overnight wrap, budget floored) is listed here.
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  // A one-click "did you mean tomorrow?" offer for a past-time anchor (§1.6).
  const [tomorrowOffer, setTomorrowOffer] = useState<{ field: "start" | "end"; toMin: number } | null>(null);
  // Which field the far-date calendar (min = now+2) is open for, if any.
  const [calendarField, setCalendarField] = useState<"start" | "end" | null>(null);

  // Back-navigation stack (innermost first): Esc closes the calendar if open,
  // otherwise closes the drawer. One routed handler — never two stacked hooks.
  useEscClose(calendarField ? () => setCalendarField(null) : onClose);

  // §2.9 preset pills (Sleep / Nap / Food). activePreset locks a bundle of
  // fields; presetSnapshot restores them on deselect; presetTouched silences ML
  // auto-switch once the user has toggled a pill this session (intent wins);
  // presetAuto marks a pill that ML selected (so it can auto-deselect on a
  // no-longer-matching editable title, without clobbering what the user typed).
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [presetSnapshot, setPresetSnapshot] = useState<FieldSnapshot | null>(null);
  const [presetTouched, setPresetTouched] = useState(false);
  const [presetAuto, setPresetAuto] = useState(false);

  // §2.1: sub-head (activity) selection auto-derives its (uneditable) head.
  // Unknown activity → the user must assign a head (existing or new).
  const derivedHead = headFor(activity);
  const isNewActivity = activity.trim() !== "" && derivedHead === undefined;

  // §7.0.1 ML-assist: title → sub-head suggestion. The TITLE is the only trigger
  // (new title = new intent = new suggestion); never load-bearing (silent no-op if
  // the model fails or hasn't loaded — see ml/suggest.ts). A freshly-computed
  // suggestion autofills (replacing what's there) whenever the field is empty or its
  // content is app-authored; only a USER-authored sub-head is protected — it never
  // gets overwritten, and instead surfaces the keep-mine choice below. Editing/clearing
  // the sub-head is NOT a trigger — the effect keys off `suggestion` (which only changes
  // on a title edit), so `autofillSubhead` is a gate read at that moment, not a dependency.
  // Only PLANNABLE sub-heads are offered/suggested (system heads never appear).
  const allActivities = plannableActivities;
  // A preset locks the sub-head, so suppress the title→sub-head suggester while
  // one is active (its result would fight the locked value). §7.0.3: in
  // lightweight compute mode the ML suggesters are off (feed them an empty
  // title, which resolves to no suggestion) — deterministic entry still works.
  const suggestion = useSubheadSuggestion(activePreset || aiLevels.subhead === "deterministic" ? "" : title, allActivities);
  // §7.0.1 "new" namer: when nothing existing matches, the suggester's taxonomy
  // step may carry a proposed NAME (a universal category label, e.g. "Alumni
  // meetup" → "Socialization"); without one, echo the title.
  const proposedNew = (suggestion?.kind === "new" && suggestion.name) || title.trim();
  const autofillSubhead = subheadSource !== "user" || activity.trim() === "";
  useEffect(() => {
    if (!suggestion || !autofillSubhead) return;
    if (suggestion.kind === "existing") setActivity(suggestion.activity);
    else if (suggestion.kind === "new") setActivity(proposedNew);
    setSubheadSource("app"); // autofilled → app-sourced, replaceable on the next title edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  // The value a fresh title-driven suggestion proposes (existing pick, or the
  // title itself for a "new" sub-head). Used both for the autofill above and for
  // the keep-mine-vs-use-suggested choice offered when the user has hand-typed a
  // sub-head (§7.0.1): we never silently overwrite their entry, but we surface the
  // suggestion with a one-click "Use" so the choice is theirs.
  const suggestedSubhead =
    suggestion?.kind === "existing" ? suggestion.activity
    : suggestion?.kind === "new" ? proposedNew
    : null;
  // The head to show for the suggested sub-head. Existing sub-head → its assigned head.
  // Brand-new sub-head → also run the head-suggester on it (§7.0.1 Feature 2) and show a
  // confidently-matched EXISTING head as the suggestion (nothing when unconfident/"new").
  const newSubheadHead = useHeadSuggestion(
    suggestion?.kind === "new" ? (suggestedSubhead ?? "") : "",
    false,
    plannableRegistry,
  );
  const suggestedHead =
    suggestion?.kind === "existing" ? headFor(suggestion.activity)
    : suggestion?.kind === "new" && newSubheadHead?.kind === "existing" ? newSubheadHead.head
    : undefined;
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(null);
  const offerSubheadChoice =
    !autofillSubhead &&
    suggestedSubhead !== null &&
    suggestedSubhead !== activity.trim() &&
    suggestedSubhead !== dismissedSuggestion;

  // §7.0.1 ML-assist "same duality" clause: sub-head → head suggestion for a
  // brand-new sub-head. A confident match auto-fills (provisional, tagged);
  // "intent wins" — touching the field silences it for the session.
  const headSuggestion = useHeadSuggestion(isNewActivity && aiLevels.head !== "deterministic" ? activity : "", newHeadTouched, plannableRegistry);
  useEffect(() => {
    if (newHeadTouched || !headSuggestion) return;
    if (headSuggestion.kind === "existing") setNewHeadChoice(headSuggestion.head);
    // "new": seed with the sub-head name itself as the proposed new head
    // (same convention as the title→sub-head suggester) — editable, never empty.
    else if (headSuggestion.kind === "new") setNewHeadChoice(activity.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headSuggestion, newHeadTouched]);

  // §2.7 ML-assisted decomposition: offer the subtasks used for a similar past
  // task. Deterministic exact-match works in any mode; semantic match is
  // maximum-mode only (the hook is passed the live mode). Suppressed once the
  // user has started entering their own subtasks (their intent wins).
  const decompSuggestion = useDecompositionSuggestion(title, aiLevels.decompose);
  const showDecompOffer =
    decompSuggestion !== null && subtasks.every((s) => s.title.trim() === "");
  const useDecomposition = (): void => {
    if (!decompSuggestion) return;
    setSubtasks(decompSuggestion.children.map((c) => ({ title: c.title, budgetStr: fmtDurUnits(c.budget) })));
  };
  // Explicit on-demand "Suggest subtasks" — runs the suggester now (semantic
  // match infers a breakdown from SIMILAR past tasks, so it works for tasks
  // never composed before). Reports plainly when nothing similar is found.
  const [decompMsg, setDecompMsg] = useState<string | null>(null);
  const onSuggestSubtasks = (): void => {
    const t = title.trim();
    if (!t) { setDecompMsg("Enter a title first."); return; }
    setDecompMsg("Looking for a similar past task…");
    void suggestDecomposition(t, aiLevels.decompose)
      .then((s) => {
        if (s) {
          setSubtasks(s.children.map((c) => ({ title: c.title, budgetStr: fmtDurUnits(c.budget) })));
          setDecompMsg(`From a ${s.source === "exact" ? "past" : "similar"} task: “${s.fromTitle}”.`);
        } else {
          setDecompMsg("No similar past breakdown found yet — add subtasks manually and I'll learn it.");
        }
      })
      .catch(() => setDecompMsg(null));
  };

  const timing = useMemo(() => deriveTiming(startMin, endMin, budgetMin), [startMin, endMin, budgetMin]);

  // §2.5: flags derive from type; user overrides live in `flags`, clamped by the
  // validity matrix (fixed → never slideable; budgeted → always slideable;
  // breakable only for budgeted; ommf → never breakable).
  const slideable = timing === "fixed" ? false : timing === "budgeted" ? true : (flags.slideable ?? true);
  // §2.9: an active preset locks breakable OFF regardless of timing.
  const breakable = activePreset ? false : timing === "budgeted" && !ommf ? (flags.breakable ?? true) : false;

  /** Push a computed trio into state: set epoch truth + reformat the buffers per
   * the 12h/24h setting, and surface the §7.0.2 adjustments + tomorrow offer. */
  const commitTrio = (r: DeriveResult): void => {
    setStartMin(r.startMin);
    setEndMin(r.endMin);
    setBudgetMin(r.budgetMin);
    setStartStr(r.startMin !== undefined ? fmtT(r.startMin) : "");
    setEndStr(r.endMin !== undefined ? fmtT(r.endMin) : "");
    setBudgetStr(r.budgetMin !== undefined ? fmtDurUnits(r.budgetMin) : "");
    setAdjustments(r.adjustments);
    setTomorrowOffer(r.tomorrow ?? null);
    setError(r.err);
  };

  /** Flow (§1.6): casual-parse the changed buffer → §3.6 derive + snap-notify.
   * The changed field is authoritative; a second present field derives the third. */
  const commitField = (changed: "start" | "end" | "budget"): void => {
    let s = startMin;
    let e = endMin;
    let b = budgetMin;
    const explicitDay = { start: false, end: false };
    let parseFailed = false;

    if (changed === "start") {
      if (!startStr.trim()) s = undefined;
      else {
        const p = parseCasualTime(startStr, now);
        if (p.value === undefined) parseFailed = true;
        else { s = p.value; explicitDay.start = p.explicitDay; }
      }
    } else if (changed === "end") {
      if (!endStr.trim()) e = undefined;
      else {
        const p = parseCasualTime(endStr, now);
        if (p.value === undefined) parseFailed = true;
        else { e = p.value; explicitDay.end = p.explicitDay; }
      }
    } else {
      if (!budgetStr.trim()) b = undefined;
      else {
        const p = parseCasualDuration(budgetStr);
        if (p === undefined) parseFailed = true;
        else b = p;
      }
    }

    if (parseFailed) {
      // Never silently discard — keep the buffer, tell the user it wasn't read.
      setAdjustments([{ field: changed, message: `Couldn't read "${(changed === "budget" ? budgetStr : changed === "start" ? startStr : endStr).trim()}" — leaving it as typed` }]);
      return;
    }
    commitTrio(deriveDayAware(changed, { startMin: s, endMin: e, budgetMin: b }, explicitDay, now, minFragment, fmtT));
  };

  /** §06 title shorthand: on Title commit, pull `#head` / `@time` / `15:50-16:20`
   * / `1h30` tokens out of the title, strip them, and pre-fill the fields —
   * delegating time/duration VALUES to the same casualTime + §3.6 pipeline a
   * typed field uses (so snap-notify and the tomorrow-offer apply unchanged).
   * Grammar-filled sub-head/head is user-sourced so ML never overwrites it
   * (§7.0.1). Suppressed under an active preset (its locked bundle owns those
   * fields). Token wins over an already-filled field it names. */
  const commitTitle = (): void => {
    if (activePreset) return;
    const t = parseTitleGrammar(title);
    if (t.hash === undefined && t.start === undefined && t.end === undefined && t.budget === undefined) return;

    if (t.title !== title) setTitle(t.title);

    if (t.hash !== undefined) {
      const r = resolveHash(t.hash, plannableActivities, plannableHeads);
      if (r) {
        setActivity(r.subhead);
        setSubheadSource("user"); // grammar-filled = user intent, protected from ML (§7.0.1)
        if (!r.matchedExisting && r.head) { setNewHeadChoice(r.head); setNewHeadTouched(true); }
      }
    }

    if (t.start !== undefined || t.end !== undefined || t.budget !== undefined) {
      let s = startMin;
      let e = endMin;
      let b = budgetMin;
      const explicitDay = { start: false, end: false };
      let ok = true;
      if (t.start !== undefined) {
        const p = parseCasualTime(t.start, now);
        if (p.value === undefined) ok = false;
        else { s = p.value; explicitDay.start = p.explicitDay; }
      }
      if (t.end !== undefined) {
        const p = parseCasualTime(t.end, now);
        if (p.value === undefined) ok = false;
        else { e = p.value; explicitDay.end = p.explicitDay; }
      }
      if (t.budget !== undefined) {
        const p = parseCasualDuration(t.budget);
        if (p === undefined) ok = false;
        else b = p;
      }
      if (ok) {
        // Authoritative field mirrors typing order: an end anchor (or range)
        // derives budget/wrap; else a start anchor; else the bare duration.
        const changed = t.end !== undefined ? "end" : t.start !== undefined ? "start" : "budget";
        commitTrio(deriveDayAware(changed, { startMin: s, endMin: e, budgetMin: b }, explicitDay, now, minFragment, fmtT));
      }
    }
  };

  /** Tapping a chip pre-fills its fields (the app never says no — SPEC VI). */
  const shapeTo = (t: TimingType): void => {
    setError(null);
    setFlags({});
    setAdjustments([]);
    setTomorrowOffer(null);
    let s: number | undefined;
    let e: number | undefined;
    let b: number | undefined;
    if (t === "budgeted") b = DEFAULT_BUDGET;
    else if (t === "semi-head") s = now;
    else if (t === "semi-tail") e = now + DEFAULT_BUDGET;
    else if (t === "fixed") { s = now; e = now + DEFAULT_BUDGET; b = DEFAULT_BUDGET; }
    setStartMin(s);
    setEndMin(e);
    setBudgetMin(b);
    setStartStr(s !== undefined ? fmtT(s) : "");
    setEndStr(e !== undefined ? fmtT(e) : "");
    setBudgetStr(b !== undefined ? fmtDurUnits(b) : "");
  };

  /** ±5-min stepper on a clock or budget field; re-derives from the NEW value. */
  const step = (field: "start" | "end" | "budget", dir: 1 | -1): void => {
    let s = startMin;
    let e = endMin;
    let b = budgetMin;
    if (field === "budget") b = Math.max(minFragment, (budgetMin ?? 0) + dir * 5); // §7.0.2 floor
    else if (field === "start") s = (startMin ?? now) + dir * 5;
    else e = (endMin ?? now) + dir * 5;
    // A stepper edit carries the field's existing day, so treat it as explicit
    // (no past-time bump from nudging an already-placed value).
    commitTrio(deriveDayAware(field, { startMin: s, endMin: e, budgetMin: b }, { start: true, end: true }, now, minFragment, fmtT));
  };

  /** Apply the "did you mean tomorrow?" offer for a past-time anchor (§1.6). */
  const applyTomorrow = (): void => {
    if (!tomorrowOffer) return;
    const { field, toMin } = tomorrowOffer;
    const s = field === "start" ? toMin : startMin;
    const e = field === "end" ? toMin : endMin;
    commitTrio(deriveDayAware(field, { startMin: s, endMin: e, budgetMin }, { start: true, end: true }, now, minFragment, fmtT));
  };

  /** Far-date calendar pick (min = now+2): set that anchor to the chosen day,
   * keeping the current time-of-day. */
  const applyCalendar = (field: "start" | "end", dayMin: number): void => {
    const cur = field === "start" ? startMin : endMin;
    const tod = cur !== undefined ? ((cur % 1440) + 1440) % 1440 : 9 * 60; // keep time, default 09:00
    const chosen = dayMin + tod;
    const s = field === "start" ? chosen : startMin;
    const e = field === "end" ? chosen : endMin;
    setCalendarField(null);
    commitTrio(deriveDayAware(field, { startMin: s, endMin: e, budgetMin }, { start: true, end: true }, now, minFragment, fmtT));
  };

  /* ------------------------- §2.9 preset pills --------------------------- */

  const captureFields = (): FieldSnapshot => ({
    title, activity, subheadSource, startStr, endStr, budgetStr, startMin, endMin, budgetMin, ommf, flags, newHeadChoice, newHeadTouched,
  });
  const restoreFields = (snap: FieldSnapshot, keepTitle: boolean): void => {
    if (!keepTitle) setTitle(snap.title);
    setActivity(snap.activity);
    setSubheadSource(snap.subheadSource);
    setStartStr(snap.startStr);
    setEndStr(snap.endStr);
    setBudgetStr(snap.budgetStr);
    setStartMin(snap.startMin);
    setEndMin(snap.endMin);
    setBudgetMin(snap.budgetMin);
    setOmmf(snap.ommf);
    setFlags(snap.flags);
    setNewHeadChoice(snap.newHeadChoice);
    setNewHeadTouched(snap.newHeadTouched);
    setError(null);
    setAdjustments([]);
    setTomorrowOffer(null);
  };
  /** Fill the locked/seeded fields for a preset. Sleep/Nap force the title;
   * others (editable title) only seed it when empty, so a matching typed title
   * ("Lunch") is preserved. `newHeadChoice` carries the preset's own head —
   * every Food-pattern built-in (§11.1b) ships with NO seeded sub-head, so
   * `headFor(activity)` can't derive it; the preset supplies it directly
   * (mirrors §11.1a's "new sub-head's head" path, just pre-filled+hidden).
   * §2.10b: the preset's timing + its resolved budget/anchor (a fixed value,
   * or live-sourced from the week plan / Settings sleepMinutes) fill the
   * fields directly — NOT `shapeTo`'s generic per-timing defaults. */
  const applyPreset = (id: string): void => {
    const p = presetsConfig.find((c) => c.id === id);
    if (!p) return;
    const r = resolvePreset(p, state);
    if (!r.titleEditable) setTitle(r.title);
    else if (!title.trim()) setTitle(r.title);
    setActivity(r.subhead);
    setSubheadSource("user"); // locked value = user intent (protects from suggester)
    setOmmf(false);
    setNewHeadChoice(r.headId);
    setNewHeadTouched(false);
    setFlags({});
    // Preset anchors are time-of-day (§2.10b, the WeekTemplate convention) —
    // ground them in TODAY's absolute epoch before the trio math, which works
    // in absolute minutes throughout. A past time-of-day (e.g. Sleep's anchor
    // already gone by) legitimately snaps forward via deriveDayAware's own
    // past-time rule, same as any typed time would.
    const midnight = dayStartMin(now);
    const startAbs = r.startTod !== undefined ? midnight + r.startTod : undefined;
    const endAbs = r.endTod !== undefined ? midnight + r.endTod : undefined;
    commitTrio(deriveDayAware(
      startAbs !== undefined ? "start" : endAbs !== undefined ? "end" : "budget",
      { startMin: startAbs, endMin: endAbs, budgetMin: r.budget },
      { start: false, end: false },
      now, minFragment, fmtT,
    ));
  };
  /** Manual pill tap: toggles the preset and silences ML auto-switch for the session. */
  const togglePreset = (id: string): void => {
    setPresetTouched(true);
    if (activePreset === id) {
      if (presetSnapshot) restoreFields(presetSnapshot, false);
      setActivePreset(null);
      setPresetSnapshot(null);
      setPresetAuto(false);
    } else {
      if (activePreset === null) setPresetSnapshot(captureFields());
      setActivePreset(id);
      setPresetAuto(false);
      applyPreset(id);
    }
  };
  // §7.0.1 ML auto-switch: a matching title auto-selects a pill (tagged, undoable)
  // unless the user has toggled a pill this session (intent wins). An auto-selected
  // pill on an editable title (Food) auto-deselects when the title stops matching,
  // without clobbering what the user is typing.
  useEffect(() => {
    if (presetTouched) return;
    const m = matchPreset(title, presetsConfig);
    if (m && activePreset !== m.id) {
      if (activePreset === null) setPresetSnapshot(captureFields());
      setActivePreset(m.id);
      setPresetAuto(true);
      applyPreset(m.id);
    } else if (!m && activePreset !== null && presetAuto) {
      if (presetSnapshot) restoreFields(presetSnapshot, true);
      setActivePreset(null);
      setPresetSnapshot(null);
      setPresetAuto(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  const activePresetObj = activePreset ? presetsConfig.find((p) => p.id === activePreset) ?? null : null;
  const titleLocked = activePresetObj !== null && activePresetObj.titleLocked;

  const buildEvent = (): Event | null => {
    if (!title.trim()) { setError("Title is required"); return null; }
    const finalHead = derivedHead ?? (isNewActivity ? newHeadChoice.trim() : "");
    if (!activity.trim() || !finalHead) { setError("Pick or create a sub-head and its head"); return null; }
    let anchorStart = startMin;
    let anchorEnd = endMin;
    let bud = budgetMin;
    if (anchorStart !== undefined && anchorEnd !== undefined && anchorEnd <= anchorStart)
      anchorEnd += 1440;
    if (timing === "fixed") {
      if (anchorStart !== undefined && bud !== undefined && anchorEnd === undefined)
        anchorEnd = anchorStart + bud;
      if (anchorEnd !== undefined && bud !== undefined && anchorStart === undefined)
        anchorStart = anchorEnd - bud;
      if (anchorStart !== undefined && anchorEnd !== undefined) bud = anchorEnd - anchorStart;
      if (bud !== undefined && bud <= 0) { setError("Task duration cannot be zero"); return null; }
    }
    if (isNewActivity) addActivity(finalHead, activity.trim());
    // §7.0.1: grow the ML corpus regardless of whether this pairing came from
    // a suggestion or manual entry — fire-and-forget, never blocks creation.
    recordTitleActivity(title, activity.trim());
    return {
      type: "CREATE_TASK",
      task: {
        id: `t-${Date.now()}`,
        title: title.trim(),
        headId: finalHead,
        activityId: activity.trim(),
        tier: "normal",
        timing,
        ommf,
        slideable,
        breakable,
        ...(anchorStart !== undefined ? { anchorStart } : {}),
        ...(anchorEnd !== undefined ? { anchorEnd } : {}),
        ...(bud !== undefined ? { budget: bud } : {}),
      } as never,
    };
  };

  const add = (thenStart: boolean): void => {
    // §2.7: decompose right after creation. A leaf's budget defaults to the
    // standard 30m if its casual duration doesn't parse (never silently 0).
    const kids = subtasks
      .map((st) => ({ title: st.title.trim(), budget: Math.max(minFragment, parseCasualDuration(st.budgetStr) ?? DEFAULT_BUDGET) }))
      .filter((k) => k.title !== "");
    // A composition needs at least two subtasks — one "subtask" is just the task
    // itself. Block before creating anything (the app never half-commits).
    if (kids.length === 1) {
      setError("A composed task needs at least 2 subtasks — add another, or remove it to keep a single task.");
      return;
    }
    const ev = buildEvent();
    if (!ev || ev.type !== "CREATE_TASK") return;
    dispatch(ev);
    const parentId = (ev.task as { id: string }).id;
    if (kids.length >= 2) {
      dispatch({ type: "SET_SUBTASKS", parentId, children: kids });
      // §2.7: remember this breakdown so a similar future task can reuse it.
      recordDecomposition(title.trim(), kids);
    }
    if (thenStart) {
      const pomodoro: PomodoroConfig | undefined = pomo
        ? { ...pomodoroDefault, workMin: Math.max(1, pomoWork), breakMin: Math.max(1, pomoBreak) }
        : undefined;
      dispatch({ type: "START_TASK", taskId: parentId, ...(pomodoro ? { pomodoro } : {}) });
    }
    onClose();
  };

  /** §2.7 + §1.6: a subtask's budget is a first-class smart-input field — on
   * blur it runs the same casual-duration parse as the main Budget, snaps to the
   * MIN_FRAGMENT floor, and reformats to `Nd Nh Nm`. A meaning-change (floor
   * raise) or unreadable input surfaces in the universal snap-notify strip; a
   * pure reformat (`45` → `45m`) is silent. */
  const commitSubtaskBudget = (i: number): void => {
    const raw = (subtasks[i]?.budgetStr ?? "").trim();
    if (!raw) return;
    const parsed = parseCasualDuration(raw);
    if (parsed === undefined) {
      setAdjustments([{ field: "subtask", message: `Couldn't read "${raw}" for subtask ${i + 1} — leaving it as typed` }]);
      return;
    }
    const floored = Math.max(minFragment, parsed);
    const formatted = fmtDurUnits(floored);
    if (floored !== parsed) {
      setAdjustments([{ field: "subtask", message: `Subtask ${i + 1} budget below the ${minFragment}-minute floor — raised to ${formatted}` }]);
    }
    setSubtasks((xs) => xs.map((x, j) => (j === i ? { ...x, budgetStr: formatted } : x)));
  };

  const timeField = (
    name: string,
    field: "start" | "end" | "budget",
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ): JSX.Element => (
    <RoleField
      name={name}
      timing={timing}
      field={field}
      {...(field === "budget" ? {} : { hint: 'Type casually ("3pm", "tom 7am", "1500") — it formats on blur.' })}
    >
      <StepperField
        text={value}
        onText={set}
        onCommit={() => commitField(field)}
        onStep={(dir) => step(field, dir)}
        ariaLabel={name}
        placeholder={placeholder}
        calendar={field === "budget" ? undefined : {
          onOpen: () => setCalendarField(field),
          ariaLabel: `Pick a far date for ${name}`,
          tip: "Pick a date (day after tomorrow onward). Today & tomorrow: just type them.",
        }}
      />
    </RoleField>
  );

  // Scrim click does NOT close (2026-07-11) — half-typed tasks are too easy
  // to lose to a stray click. Close via Esc, ×, or Cancel only.
  return (
    <div className="drawer-overlay">
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-header">
          <h2 id="drawer-title">New task</h2>
          <button className="drawer-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          {/* The common block — timing types → flags — in ONE component (§7.0.6),
              so no surface can re-order or omit part of it. Drawer-EXCLUSIVE
              fields (Subtasks, Pomodoro…) come AFTER it, never interleaved. */}
          <TaskOptionsSection
            timing={timing}
            onTiming={shapeTo}
            preset={activePreset}
            onTogglePreset={togglePreset}
            presetAutoId={presetAuto ? activePreset : null}
            flags={{ ommf, slideable, breakable }}
            onFlags={(next) => {
              // Toggling OMMF resets the derived flags to their per-type
              // defaults — preserved from the drawer's own handler.
              if (next.ommf !== ommf) { setOmmf(next.ommf); setFlags({}); return; }
              setFlags({ slideable: next.slideable, breakable: next.breakable });
            }}
            title={
          <div className="field">
            <label>Title <span className="req-dot" aria-label="required">•</span></label>
            <div className="clearable-field">
              <input
                autoFocus
                value={title}
                readOnly={titleLocked}
                className={titleLocked ? "locked" : undefined}
                data-tip={titleLocked ? "Locked by the preset — tap the pill to unlock" : undefined}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTitle(); } }}
                placeholder="What are you doing?"
              />
              {title && !titleLocked && (
                <button type="button" className="clear-btn" tabIndex={-1} aria-label="Clear title" onClick={() => setTitle("")}>&times;</button>
              )}
            </div>
          </div>
            }
            subhead={
          <div className="field">
            <label data-tip={activePreset ? "Locked by the preset" : "Search existing sub-heads, or type a new one"}>
              Sub-head <span className="req-dot" aria-label="required">•</span>
              {!activePreset && autofillSubhead && suggestion?.kind === "existing" && (
                <span className="ml-tag ml-tag-existing" data-tip="Suggested from your past titles — still fully editable">suggested</span>
              )}
              {!activePreset && autofillSubhead && suggestion?.kind === "new" && (
                <span className="ml-tag ml-tag-new" data-tip="No close match — suggesting a NEW sub-head, not a pick from the existing list">suggested new</span>
              )}
            </label>
            {activePreset ? (
              <input value={activity} readOnly className="locked" aria-label="Sub-head" data-tip="Locked by the preset — tap the pill to unlock" />
            ) : (
              <FuzzyDropdown
                value={activity}
                onChange={(v) => { setActivity(v); setSubheadSource("user"); }}
                options={allActivities}
                placeholder="e.g. Project — AI Automation"
                clearable
                ariaLabel="Sub-head"
              />
            )}
            {!activePreset && offerSubheadChoice && (
              <div className="ml-choice" data-tip="Your new title suggests a different sub-head — click it to use the suggestion">
                <span className="ml-choice-text">
                  <span className="ml-choice-lead">
                    <span className={`ml-tag ${suggestion?.kind === "new" ? "ml-tag-new" : "ml-tag-existing"}`}>
                      {suggestion?.kind === "new" ? "suggested new" : "suggested"}
                    </span>
                    <button
                      type="button"
                      className="ml-choice-value"
                      onClick={() => { setActivity(suggestedSubhead!); setSubheadSource("user"); setDismissedSuggestion(null); }}
                      data-tip="Use this sub-head"
                    >{suggestedSubhead}</button>
                    {suggestedHead && <span className="ml-choice-in">in</span>}
                  </span>
                  {suggestedHead && (
                    <strong
                      className="ml-choice-headpill"
                      data-tip={suggestion?.kind === "new"
                        ? "Suggested head for this new sub-head"
                        : "The head this sub-head lives under"}
                    >
                      {headName(suggestedHead)}
                    </strong>
                  )}
                </span>
              </div>
            )}
            {(derivedHead ?? (activePresetObj ? activePresetObj.headId : undefined)) && (
              <div className="derived-head" data-tip="Derived from the sub-head — not editable here">
                Head: <strong>{headName(derivedHead ?? activePresetObj!.headId)}</strong>
              </div>
            )}
            {!activePreset && isNewActivity && (
              <div className="field" style={{ marginTop: 8 }}>
                <label data-tip="This sub-head is new — pick or type the head it belongs to">
                  New sub-head's head <span className="req-dot" aria-label="required">•</span>
                  {!newHeadTouched && headSuggestion?.kind === "existing" && (
                    <span className="ml-tag ml-tag-existing" data-tip="Suggested from your existing sub-heads — still fully editable">suggested</span>
                  )}
                  {!newHeadTouched && headSuggestion?.kind === "new" && (
                    <span className="ml-tag ml-tag-new" data-tip="No close match — suggesting you create a NEW head, not pick from the existing list">suggested new</span>
                  )}
                </label>
                <FuzzyDropdown
                  value={newHeadChoice}
                  onChange={(v) => { setNewHeadChoice(v); setNewHeadTouched(true); }}
                  options={plannableHeads}
                  labels={headLabels(plannableHeads)}
                  placeholder="Pick or create a head"
                  clearable
                  ariaLabel="New sub-head's head"
                />
              </div>
            )}
          </div>
            }
            start={timeField("Start", "start", startStr, setStartStr, "e.g. 3pm, tom 7am")}
            end={timeField("End", "end", endStr, setEndStr, "e.g. 16:20, tomorrow 9am")}
            budget={timeField("Budget", "budget", budgetStr, setBudgetStr, "e.g. 1h30, 45m")}
          />
          <div className="field">
            <div className="hint-row">
              <label data-tip="Break this task into subtasks — its budget becomes the sum of theirs (§2.7). Leaves run in order; completing the last completes the parent.">
                Subtasks
              </label>
              <span className="hint-glyph" tabIndex={0} aria-label="Subtasks help" data-tip="Optional. Each subtask is a title + budget. The parent becomes a bracket spanning its leaves; only leaves occupy the timeline.">ⓘ</span>
            </div>
            {showDecompOffer && decompSuggestion && (
              <div className="decomp-offer" data-tip="Reuse the subtasks from a similar task you broke down before">
                <span className="ml-tag ml-tag-existing">
                  {decompSuggestion.source === "exact" ? "AI · your past breakdown" : "AI · similar task"}
                </span>
                <span className="decomp-offer-text">{decompSuggestion.children.map((c) => c.title).join(" · ")}</span>
                <button type="button" className="ml-choice-value" onClick={useDecomposition}>
                  Use these {decompSuggestion.children.length} subtasks
                </button>
              </div>
            )}
            {subtasks.map((st, i) => (
              <div key={i} className="subtask-entry">
              <div className="subtask-row">
                <input
                  className="subtask-title"
                  value={st.title}
                  onChange={(e) => setSubtasks((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  placeholder="Subtask title"
                  aria-label={`Subtask ${i + 1} title`}
                />
                <input
                  value={st.budgetStr}
                  onChange={(e) => setSubtasks((xs) => xs.map((x, j) => (j === i ? { ...x, budgetStr: e.target.value } : x)))}
                  onBlur={() => commitSubtaskBudget(i)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitSubtaskBudget(i); } }}
                  placeholder="e.g. 45m, 1h30"
                  className="num subtask-budget"
                  aria-label={`Subtask ${i + 1} budget`}
                />
                <button type="button" className="subtask-remove" aria-label={`Remove subtask ${i + 1}`} onClick={() => setSubtasks((xs) => xs.filter((_, j) => j !== i))}>&times;</button>
              </div>
              <div className="subtask-preview">
                {st.title.trim() || "Subtask"} <span className="subtask-suffix">— Subtask # {i + 1} of {title.trim() || "this task"}</span>
              </div>
              </div>
            ))}
            <div className="subtask-actions">
              <button
                type="button"
                className="subtask-add"
                onClick={() => setSubtasks((xs) => [...xs, { title: "", budgetStr: fmtDurUnits(DEFAULT_BUDGET) }])}
              >
                + Add subtask
              </button>
              {aiLevels.decompose !== "deterministic" && (
                <button
                  type="button"
                  className="subtask-suggest"
                  onClick={onSuggestSubtasks}
                  data-tip="Suggest a breakdown from a similar task you've composed before (on-device AI). Works even for a task you've never broken down — it matches by meaning."
                >
                  ✨ Suggest subtasks (AI)
                </button>
              )}
            </div>
            {decompMsg && <div className="meta" style={{ marginTop: 4 }}>{decompMsg}</div>}
          </div>
          {adjustments.length > 0 && (
            <div className="form-warning" role="status">
              {adjustments.map((a, i) => (
                <div key={i}>{a.message}</div>
              ))}
              {tomorrowOffer && (
                <button type="button" className="ml-choice-value" onClick={applyTomorrow} data-tip="Move this to tomorrow instead">
                  Did you mean {fmtT(tomorrowOffer.toMin)}? →
                </button>
              )}
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>
        {calendarField && (
          <DatePicker
            now={now}
            onPick={(dayMin) => applyCalendar(calendarField, dayMin)}
            onClose={() => setCalendarField(null)}
          />
        )}
        <div className="pomo-row">
          <label className="pomo-toggle" data-tip="Run this task in pomodoro intervals (only when you start it now)">
            <input type="checkbox" checked={pomo} onChange={(e) => setPomo(e.target.checked)} />
            🍅 Start as pomodoro
          </label>
          {pomo && (
            <span className="pomo-fields">
              <label>Work <DurInput ariaLabel="Pomodoro work length" value={pomoWork} onCommit={(m) => { if (m !== null) setPomoWork(Math.max(1, m)); }} /></label>
              <label>Break <DurInput ariaLabel="Pomodoro break length" value={pomoBreak} onCommit={(m) => { if (m !== null) setPomoBreak(Math.max(1, m)); }} /></label>
              <span className="field-desc">then {fmtDurUnits(pomodoroDefault.longBreakMin)} long break every {pomodoroDefault.cyclesBeforeLong}</span>
            </span>
          )}
        </div>
        <div className="drawer-footer">
          <button className="primary" onClick={() => add(false)}>Add</button>
          <button className="start-accent" onClick={() => add(true)}>Add &amp; start now ⚡</button>
          <span style={{ flex: 1 }} />
          <button className="cancel-accent" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
