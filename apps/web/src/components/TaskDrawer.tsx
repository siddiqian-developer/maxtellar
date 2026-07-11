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
import type { Event, TimingType } from "@maxtellar/core";
import { useHeads } from "../heads";
import { useEscClose } from "../useEscClose";
import { useSubheadSuggestion } from "../ml/useSubheadSuggestion";
import { useHeadSuggestion } from "../ml/useHeadSuggestion";
import { recordTitleActivity } from "../ml/suggest";
import { FuzzyDropdown } from "./FuzzyDropdown";

interface Props {
  now: number;
  dispatch: (e: Event) => void;
  onClose: () => void;
}

const DEFAULT_BUDGET = 30;

/** HH:mm today → epoch minutes (local). */
function parseClock(v: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return Math.floor(d.getTime() / 60000);
}

/** epoch minutes → HH:mm (local). */
function fmtClock(m: number): string {
  const d = new Date(m * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "H:MM" or bare minutes → minutes. */
function parseBudget(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+$/.test(t)) return Number(t);
  return undefined;
}

/** minutes → "HH:MM". */
function fmtBudget(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The creation table (§3.6), derived live. */
function deriveTiming(start?: number, end?: number, budget?: number): TimingType {
  if (start !== undefined && (end !== undefined || budget !== undefined)) return "fixed";
  if (end !== undefined && budget !== undefined) return "fixed";
  if (start !== undefined) return "semi-head";
  if (end !== undefined) return "semi-tail";
  if (budget !== undefined) return "budgeted";
  return "unscheduled";
}

/** Pure §3.6 field derivation. Given the three field strings and which one the
 * user just changed, return the new trio (+ any hard-block error). The changed
 * field is authoritative and never overwritten; overnight end wraps +1 day.
 * All-three rules: Start→End, Budget→End, End→Budget (start outranks budget). */
function derive(
  changed: "start" | "end" | "budget",
  sStr: string,
  eStr: string,
  bStr: string,
): { start: string; end: string; budget: string; err: string | null } {
  const s = sStr ? parseClock(sStr) : undefined;
  let e = eStr ? parseClock(eStr) : undefined;
  const b = bStr ? parseBudget(bStr) : undefined;
  if (s !== undefined && e !== undefined && e <= s) e += 1440;

  const out = {
    start: sStr,
    end: eStr,
    budget: b !== undefined ? fmtBudget(b) : bStr, // normalize bare minutes
    err: null as string | null,
  };

  if (changed === "start" && s !== undefined) {
    if (b !== undefined) out.end = fmtClock(s + b);
    else if (e !== undefined) out.budget = fmtBudget(e - s);
  } else if (changed === "budget") {
    if (b !== undefined) {
      if (s !== undefined) out.end = fmtClock(s + b);
      else if (e !== undefined) out.start = fmtClock(e - b);
    } else if (s !== undefined && e !== undefined) {
      out.budget = fmtBudget(e - s); // cleared with both anchors: re-derive
    }
  } else if (changed === "end" && e !== undefined) {
    if (s !== undefined) {
      const nb = e - s;
      if (nb === 0) out.err = "Task duration cannot be zero";
      else out.budget = fmtBudget(nb); // start outranks budget
    } else if (b !== undefined) {
      out.start = fmtClock(e - b);
    }
  }
  return out;
}

const ALL_TIMINGS: TimingType[] = ["unscheduled", "budgeted", "semi-head", "semi-tail", "fixed"];

type FieldRole = "required" | "optional" | "not used";

/** Per-type role of each time field (drives the dynamic labels). Fixed needs
 * all three, entered as any two with the third derived — all required. */
const FIELD_ROLES: Record<TimingType, { start: FieldRole; end: FieldRole; budget: FieldRole }> = {
  unscheduled: { start: "not used", end: "not used", budget: "not used" },
  budgeted: { start: "not used", end: "not used", budget: "required" },
  "semi-head": { start: "required", end: "not used", budget: "not used" },
  "semi-tail": { start: "not used", end: "required", budget: "not used" },
  fixed: { start: "required", end: "required", budget: "required" },
};

export function TaskDrawer({ now, dispatch, onClose }: Props): JSX.Element {
  const { heads, registry, headFor, addActivity } = useHeads();
  useEscClose(onClose);

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
  // default on open: budgeted @ 00:30 (SPEC VI pre-fills)
  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");
  const [budgetStr, setBudgetStr] = useState(fmtBudget(DEFAULT_BUDGET));
  const [ommf, setOmmf] = useState(false);
  const [flags, setFlags] = useState<{ slideable?: boolean; breakable?: boolean }>({});
  const [error, setError] = useState<string | null>(null);

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
  const allActivities = useMemo(() => heads.flatMap((h) => registry[h] ?? []), [heads, registry]);
  const suggestion = useSubheadSuggestion(title, allActivities);
  const autofillSubhead = subheadSource !== "user" || activity.trim() === "";
  useEffect(() => {
    if (!suggestion || !autofillSubhead) return;
    if (suggestion.kind === "existing") setActivity(suggestion.activity);
    else if (suggestion.kind === "new") setActivity(title.trim());
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
    : suggestion?.kind === "new" ? title.trim()
    : null;
  // The head to show for the suggested sub-head. Existing sub-head → its assigned head.
  // Brand-new sub-head → also run the head-suggester on it (§7.0.1 Feature 2) and show a
  // confidently-matched EXISTING head as the suggestion (nothing when unconfident/"new").
  const newSubheadHead = useHeadSuggestion(
    suggestion?.kind === "new" ? (suggestedSubhead ?? "") : "",
    false,
    registry,
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
  const headSuggestion = useHeadSuggestion(isNewActivity ? activity : "", newHeadTouched, registry);
  useEffect(() => {
    if (newHeadTouched || !headSuggestion) return;
    if (headSuggestion.kind === "existing") setNewHeadChoice(headSuggestion.head);
    // "new": seed with the sub-head name itself as the proposed new head
    // (same convention as the title→sub-head suggester) — editable, never empty.
    else if (headSuggestion.kind === "new") setNewHeadChoice(activity.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headSuggestion, newHeadTouched]);

  const start = startStr ? parseClock(startStr) : undefined;
  const end = endStr ? parseClock(endStr) : undefined;
  const budget = budgetStr ? parseBudget(budgetStr) : undefined;
  const timing = useMemo(() => deriveTiming(start, end, budget), [start, end, budget]);

  // §2.5: flags derive from type; user overrides live in `flags`, clamped by the
  // validity matrix (fixed → never slideable; budgeted → always slideable;
  // breakable only for budgeted; ommf → never breakable).
  const slideable = timing === "fixed" ? false : timing === "budgeted" ? true : (flags.slideable ?? true);
  const breakable = timing === "budgeted" && !ommf ? (flags.breakable ?? true) : false;

  /** §3.6 derivation applied to explicit field strings (no stale closure): the
   * changed field is authoritative; a second present field derives the third;
   * all three present → edit Start→End, Budget→End, End→Budget. */
  const applyDerive = (
    changed: "start" | "end" | "budget",
    sStr: string,
    eStr: string,
    bStr: string,
  ): void => {
    const r = derive(changed, sStr, eStr, bStr);
    setStartStr(r.start);
    setEndStr(r.end);
    setBudgetStr(r.budget);
    setError(r.err);
  };

  /** Tapping a chip pre-fills its fields (the app never says no — SPEC VI). */
  const shapeTo = (t: TimingType): void => {
    setError(null);
    setFlags({});
    if (t === "unscheduled") { setStartStr(""); setEndStr(""); setBudgetStr(""); }
    else if (t === "budgeted") { setStartStr(""); setEndStr(""); setBudgetStr(fmtBudget(DEFAULT_BUDGET)); }
    else if (t === "semi-head") { setStartStr(fmtClock(now)); setEndStr(""); setBudgetStr(""); }
    else if (t === "semi-tail") { setStartStr(""); setEndStr(fmtClock(now + DEFAULT_BUDGET)); setBudgetStr(""); }
    else { setStartStr(fmtClock(now)); setEndStr(fmtClock(now + DEFAULT_BUDGET)); setBudgetStr(fmtBudget(DEFAULT_BUDGET)); }
  };

  /** ±5-min stepper on a clock or budget field; derives from the NEW value. */
  const step = (field: "start" | "end" | "budget", dir: 1 | -1): void => {
    let sStr = startStr;
    let eStr = endStr;
    let bStr = budgetStr;
    if (field === "budget") {
      const cur = budgetStr ? parseBudget(budgetStr) ?? 0 : 0;
      bStr = fmtBudget(Math.max(5, cur + dir * 5));
    } else {
      const str = field === "start" ? startStr : endStr;
      const cur = str ? parseClock(str) : undefined;
      const nv = fmtClock((cur ?? now) + dir * 5);
      if (field === "start") sStr = nv; else eStr = nv;
    }
    applyDerive(field, sStr, eStr, bStr);
  };

  const buildEvent = (): Event | null => {
    if (!title.trim()) { setError("Title is required"); return null; }
    const finalHead = derivedHead ?? (isNewActivity ? newHeadChoice.trim() : "");
    if (!activity.trim() || !finalHead) { setError("Pick or create a sub-head and its head"); return null; }
    let anchorStart = start;
    let anchorEnd = end;
    let bud = budget;
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
    const ev = buildEvent();
    if (!ev) return;
    dispatch(ev);
    if (thenStart && ev.type === "CREATE_TASK") {
      dispatch({ type: "START_TASK", taskId: (ev.task as { id: string }).id });
    }
    onClose();
  };

  const roles = FIELD_ROLES[timing];

  const timeField = (
    name: string,
    field: "start" | "end" | "budget",
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ): JSX.Element => (
    <div className={`field role-${roles[field].replace(" ", "-")}`}>
      <label data-tip={`For the ${timing} type this field is ${roles[field]}`}>
        {name}
        {roles[field] === "required" && <span className="req-dot" aria-label="required">•</span>}
      </label>
      <div className="time-stepper">
        <input
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={() => applyDerive(field, startStr, endStr, budgetStr)}
          placeholder={placeholder}
          className="num"
        />
        <div className="time-stepper-btns">
          <button type="button" tabIndex={-1} aria-label={`Increase ${name}`} onClick={() => step(field, 1)}>▴</button>
          <button type="button" tabIndex={-1} aria-label={`Decrease ${name}`} onClick={() => step(field, -1)}>▾</button>
        </div>
      </div>
    </div>
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
          <div className="field">
            <div className="hint-row">
              <div className="type-chips" role="radiogroup" aria-label="Timing type">
                {ALL_TIMINGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`type-chip${t === timing ? " active" : ""}`}
                    data-status={t}
                    onClick={() => shapeTo(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <span className="hint-glyph" tabIndex={0} aria-label="Timing type help" data-tip="Tap a type to pre-fill its fields, or just fill the time fields and the type derives itself">ⓘ</span>
            </div>
          </div>
          <div className="field">
            <label>Title <span className="req-dot" aria-label="required">•</span></label>
            <div className="clearable-field">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you doing?" />
              {title && (
                <button type="button" className="clear-btn" tabIndex={-1} aria-label="Clear title" onClick={() => setTitle("")}>&times;</button>
              )}
            </div>
          </div>
          <div className="field">
            <label data-tip="Search existing sub-heads, or type a new one">
              Sub-head <span className="req-dot" aria-label="required">•</span>
              {autofillSubhead && suggestion?.kind === "existing" && (
                <span className="ml-tag ml-tag-existing" data-tip="Suggested from your past titles — still fully editable">suggested</span>
              )}
              {autofillSubhead && suggestion?.kind === "new" && (
                <span className="ml-tag ml-tag-new" data-tip="No close match — suggesting a NEW sub-head, not a pick from the existing list">suggested new</span>
              )}
            </label>
            <FuzzyDropdown
              value={activity}
              onChange={(v) => { setActivity(v); setSubheadSource("user"); }}
              options={allActivities}
              placeholder="e.g. Project — AI Automation"
              clearable
              ariaLabel="Sub-head"
            />
            {offerSubheadChoice && (
              <div className="ml-choice" data-tip="Your new title suggests a different sub-head — keep yours or use the suggestion">
                <span className="ml-choice-text">
                  <span className="ml-choice-lead">
                    <span className={`ml-tag ${suggestion?.kind === "new" ? "ml-tag-new" : "ml-tag-existing"}`}>
                      {suggestion?.kind === "new" ? "suggested new" : "suggested"}
                    </span>
                    <span className="ml-choice-value">{suggestedSubhead}</span>
                    {suggestedHead && <span className="ml-choice-in">in</span>}
                  </span>
                  {suggestedHead && (
                    <strong
                      className="ml-choice-headpill"
                      data-tip={suggestion?.kind === "new"
                        ? "Suggested head for this new sub-head"
                        : "The head this sub-head lives under"}
                    >
                      {suggestedHead}
                    </strong>
                  )}
                </span>
                <span className="ml-choice-actions">
                  <button
                    type="button"
                    className="ml-choice-use"
                    onClick={() => { setActivity(suggestedSubhead!); setSubheadSource("user"); setDismissedSuggestion(null); }}
                  >Use this</button>
                  <button
                    type="button"
                    className="ml-choice-keep"
                    onClick={() => setDismissedSuggestion(suggestedSubhead)}
                  >Keep mine</button>
                </span>
              </div>
            )}
            {derivedHead && (
              <div className="derived-head" data-tip="Derived from the sub-head — not editable here">
                Head: <strong>{derivedHead}</strong>
              </div>
            )}
            {isNewActivity && (
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
                  options={heads}
                  placeholder="Pick or create a head"
                  clearable
                  ariaLabel="New sub-head's head"
                />
              </div>
            )}
          </div>
          {timeField("Start", "start", startStr, setStartStr, "15:50")}
          {timeField("End", "end", endStr, setEndStr, "16:20")}
          {timeField("Budget", "budget", budgetStr, setBudgetStr, "00:30")}
          <div className="field">
            <div className="hint-row">
              <div className="flag-row">
              <label className="flag" data-tip="Once missed, missed forever — the task perishes if its moment passes">
                <input type="checkbox" checked={ommf} onChange={(e) => { setOmmf(e.target.checked); setFlags({}); }} />
                OMMF
              </label>
              <label
                className="flag"
                data-tip={timing === "fixed" ? "Fixed tasks never slide" : timing === "budgeted" ? "Budgeted tasks always slide" : "The scheduler may move this task later"}
              >
                <input
                  type="checkbox"
                  checked={slideable}
                  disabled={timing === "fixed" || timing === "budgeted"}
                  onChange={(e) => setFlags((f) => ({ ...f, slideable: e.target.checked }))}
                />
                slideable
              </label>
              <label
                className="flag"
                data-tip={ommf ? "OMMF tasks can never be split" : timing !== "budgeted" ? "Only budgeted tasks can be split" : "The scheduler may split this task into segments"}
              >
                <input
                  type="checkbox"
                  checked={breakable}
                  disabled={timing !== "budgeted" || ommf}
                  onChange={(e) => setFlags((f) => ({ ...f, breakable: e.target.checked }))}
                />
                breakable
              </label>
              </div>
              <span className="hint-glyph" tabIndex={0} aria-label="Flags help" data-tip="Flags derive from the timing type; editable within the validity rules">ⓘ</span>
            </div>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
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
