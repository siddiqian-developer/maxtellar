/**
 * Heads & Sub-heads configuration — a full screen (SPEC VI), not a modal.
 * Add a new head, or a new sub-head (activity) under an existing head.
 *
 * Deletion guard (§2.1): a sub-head or head still referenced by any task
 * (plan, running, or history) cannot be deleted outright — it must first be
 * reassigned to another sub-head (existing, or a brand-new one, which
 * carries its own head) via REASSIGN_HEAD. Only once nothing references it
 * does the registry entry actually disappear. Usage is checked against the
 * real task data, not just the registry list, so it can't be fooled by a
 * registry already out of sync with actual references.
 */

import { useEffect, useState } from "react";
import type { Event, State } from "@maxtellar/core";
import { headName } from "@maxtellar/core";
import { useHeads, BUILT_IN_HEADS, BUILT_IN_HEAD_NOTES, isBuiltInActivity } from "../heads";
import { headLabel, headLabels } from "../headDisplay";
import { useEscClose } from "../useEscClose";
import { rehomeActivity } from "../ml/vectorStore";
import { FuzzyDropdown } from "./FuzzyDropdown";
import { useHeadSuggestion } from "../ml/useHeadSuggestion";

interface Props {
  state: State;
  dispatch: (e: Event) => void;
  onBack: () => void;
}

/** Every task (plan/running/history) with this exact (headId, activityId) pair. */
function activityInUse(state: State, headId: string, activityId: string): boolean {
  if (state.plan.some((p) => p.kind === "task" && p.headId === headId && p.activityId === activityId)) return true;
  if (state.running && state.running.headId === headId && state.running.activityId === activityId) return true;
  return state.history.some((h) => h.headId === headId && h.activityId === activityId);
}

/** Any task at all under this headId, regardless of which activity. */
function headInUse(state: State, headId: string): boolean {
  if (state.plan.some((p) => p.kind === "task" && p.headId === headId)) return true;
  if (state.running && state.running.headId === headId) return true;
  return state.history.some((h) => h.headId === headId);
}

/** Distinct activityIds actually referenced under this headId across all
 * task data — may include activities no longer in the registry. */
function usedActivitiesUnderHead(state: State, headId: string): string[] {
  const set = new Set<string>();
  for (const p of state.plan) if (p.kind === "task" && p.headId === headId) set.add(p.activityId);
  if (state.running && state.running.headId === headId) set.add(state.running.activityId);
  for (const h of state.history) if (h.headId === headId) set.add(h.activityId);
  return [...set];
}

/** What's being reassigned: one specific sub-head, or an entire head (every
 * sub-head used under it, moved to the same target). */
type ReassignTarget = { headId: string; activityId: string } | { headId: string; activityId: null };

export function HeadsConfigScreen({ state, dispatch, onBack }: Props): JSX.Element {
  const { registry, heads, categories, addHead, addActivity, deleteActivity, deleteHead, headFor, categoryFor, moveHead } = useHeads();
  const [newHead, setNewHead] = useState("");
  const [activityHead, setActivityHead] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [headTouched, setHeadTouched] = useState(false);

  const [reassign, setReassign] = useState<ReassignTarget | null>(null);
  const [reassignValue, setReassignValue] = useState("");
  const [reassignNewHead, setReassignNewHead] = useState(heads[0] ?? "");

  // Correct the sub-head form's head field only if it holds a now-STALE
  // selection (a head picked, then deleted elsewhere) — never touch it while
  // empty, empty means "not chosen yet", not "invalid". Only reacts to
  // `heads` itself changing, never to `activityHead` changing, or every
  // keystroke of a freshly-typed NEW head name would get stomped mid-type.
  useEffect(() => {
    if (activityHead !== "" && !heads.includes(activityHead) && heads.length > 0) {
      setActivityHead(heads[0] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heads]);

  // §7.0.1 ML-assist "same duality" clause: sub-head → head suggestion.
  // A confident match auto-fills the Head field (provisional, tagged) — the
  // field starts EMPTY (no static heads[0] default; only the model or the
  // user ever fills it). Never fires once the user has touched the head
  // field this session ("intent wins"); never load-bearing (silent no-op if
  // the model fails/hasn't loaded).
  const headSuggestion = useHeadSuggestion(newActivity, headTouched, registry);
  useEffect(() => {
    if (headTouched || !headSuggestion) return;
    if (headSuggestion.kind === "existing") setActivityHead(headSuggestion.head);
    // "new": seed the field with the sub-head name itself as the proposed new
    // head (same convention as the title→sub-head suggester) — editable, never empty.
    else if (headSuggestion.kind === "new") setActivityHead(newActivity.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headSuggestion, headTouched]);

  const submitHead = (): void => {
    if (!newHead.trim()) return;
    addHead(newHead);
    setNewHead("");
  };

  const submitActivity = (): void => {
    if (!newActivity.trim() || !activityHead.trim()) return;
    addActivity(activityHead, newActivity);
    setNewActivity("");
    setActivityHead("");
    setHeadTouched(false);
  };

  const requestDeleteActivity = (headId: string, activityId: string): void => {
    if (activityInUse(state, headId, activityId)) {
      setReassign({ headId, activityId });
      setReassignValue("");
    } else {
      deleteActivity(headId, activityId);
    }
  };

  const requestDeleteHead = (headId: string): void => {
    if (headInUse(state, headId)) {
      setReassign({ headId, activityId: null });
      setReassignValue("");
    } else {
      deleteHead(headId);
    }
  };

  const cancelReassign = (): void => setReassign(null);

  // Esc navigates one level back — to Settings (the screen this was opened from),
  // same as the ‹ back button. But if the reassign panel is open, Esc closes THAT
  // first (one level at a time), matching the general back-navigation pattern.
  useEscClose(reassign ? cancelReassign : onBack);

  const confirmReassign = (): void => {
    if (!reassign || !reassignValue.trim()) return;
    const targetActivity = reassignValue.trim();
    const existingHead = headFor(targetActivity);
    const targetHead = existingHead ?? reassignNewHead.trim();
    if (!targetHead) return; // new activity but no head chosen yet
    if (!existingHead) addActivity(targetHead, targetActivity);

    if (reassign.activityId !== null) {
      // Reassigning one specific sub-head.
      dispatch({
        type: "REASSIGN_HEAD",
        fromHeadId: reassign.headId,
        fromActivityId: reassign.activityId,
        toHeadId: targetHead,
        toActivityId: targetActivity,
      });
      // This is a MOVE, not a plain delete — carry the ML training to the target
      // BEFORE deleting (which would otherwise forget it). §7.0.1.
      rehomeActivity(reassign.activityId, targetActivity);
      deleteActivity(reassign.headId, reassign.activityId);
    } else {
      // Reassigning an entire head: every distinct sub-head actually used
      // under it moves to the same target.
      for (const fromActivityId of usedActivitiesUnderHead(state, reassign.headId)) {
        dispatch({
          type: "REASSIGN_HEAD",
          fromHeadId: reassign.headId,
          fromActivityId,
          toHeadId: targetHead,
          toActivityId: targetActivity,
        });
        rehomeActivity(fromActivityId, targetActivity); // move the training too
      }
      deleteHead(reassign.headId);
    }
    setReassign(null);
  };

  const isNewReassignTarget = reassignValue.trim() !== "" && headFor(reassignValue) === undefined;

  return (
    <div className="config-screen">
      <div className="config-header">
        <button className="theme-toggle" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>Heads &amp; Sub-heads</h2>
      </div>

      <div className="config-body">
        <section className="config-section">
          <h3>Add a sub-head</h3>
          <div className="config-form-row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 11, marginBottom: 4 }}>Sub-head</label>
              <input
                value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitActivity(); }}
                placeholder="e.g. Project — AI Automation"
              />
            </div>
            <div className="field" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 11, marginBottom: 4 }} data-tip="Pick an existing head, or type a new one">
                Head
                {newActivity.trim().length >= 3 && <span className="req-dot" aria-label="required"> •</span>}
                {!headTouched && headSuggestion?.kind === "existing" && (
                  <span className="ml-tag ml-tag-existing" data-tip="Suggested from your existing sub-heads — still fully editable">suggested</span>
                )}
                {!headTouched && headSuggestion?.kind === "new" && (
                  <span className="ml-tag ml-tag-new" data-tip="No close match — suggesting you create a NEW head, not pick from the existing list">suggested new</span>
                )}
              </label>
              <FuzzyDropdown
                value={activityHead}
                onChange={(v) => { setActivityHead(v); setHeadTouched(true); }}
                options={heads}
                labels={headLabels(heads)}
                placeholder="Pick or create a head"
                clearable
                ariaLabel="Head for new sub-head"
              />
            </div>
            <button
              className="primary"
              onClick={submitActivity}
              disabled={!newActivity.trim() || !activityHead.trim()}
            >
              Add sub-head
            </button>
          </div>
        </section>

        <section className="config-section">
          <h3>Add a head</h3>
          <p className="config-empty" style={{ marginBottom: 8 }}>
            Only needed for a head with no sub-heads yet — adding a sub-head above creates
            its head automatically (existing or newly typed).
          </p>
          <div className="config-form-row">
            <input
              value={newHead}
              onChange={(e) => setNewHead(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitHead(); }}
              placeholder="e.g. Labor Work"
            />
            <button className="primary" onClick={submitHead}>Add head</button>
          </div>
        </section>

        {reassign && (
          <section className="config-section reassign-panel">
            <h3>
              {reassign.activityId !== null
                ? "Reassign sub-head before deleting"
                : "Reassign head before deleting"}
            </h3>
            <p className="config-empty" style={{ marginBottom: 8 }}>
              {reassign.activityId !== null
                ? `"${reassign.activityId}" is used by at least one task — pick a sub-head to move those tasks to (existing, or a new one).`
                : `"${headName(reassign.headId)}" has tasks under it — pick a sub-head to move all of them to (existing, or a new one).`}
            </p>
            <div className="config-form-row">
              <FuzzyDropdown
                value={reassignValue}
                onChange={setReassignValue}
                options={heads.flatMap((h) => registry[h] ?? [])}
                placeholder="Existing or new sub-head"
                clearable
                ariaLabel="Reassign to sub-head"
              />
              {isNewReassignTarget && (
                <FuzzyDropdown
                  value={reassignNewHead}
                  onChange={setReassignNewHead}
                  options={heads}
                  labels={headLabels(heads)}
                  placeholder="Head for the new sub-head"
                  ariaLabel="Head for new sub-head"
                />
              )}
              <button className="primary" onClick={confirmReassign}>Reassign &amp; delete</button>
              <button className="cancel-accent" onClick={cancelReassign}>Cancel</button>
            </div>
          </section>
        )}

        <section className="config-section">
          <h3>Registry</h3>
          {[...heads].sort((a, b) => {
            const aBuiltIn = BUILT_IN_HEADS.includes(a);
            const bBuiltIn = BUILT_IN_HEADS.includes(b);
            if (aBuiltIn !== bBuiltIn) return aBuiltIn ? -1 : 1;
            return 0; // stable: preserves existing relative order within each group
          }).map((h) => (
            <div key={h} className="config-head-row">
              <div className="config-head-title">
                <span className="config-head-name">{headLabel(h, heads)}</span>
                {BUILT_IN_HEADS.includes(h) && (
                  <span className="built-in-dot" aria-label="Built-in head" data-tip="Built-in — can't be deleted" />
                )}
                {BUILT_IN_HEAD_NOTES[h] && (
                  <span className="config-head-note">{BUILT_IN_HEAD_NOTES[h]}</span>
                )}
                {/* §11.1 Category tier — every head lives under one Category. Built-ins
                    keep a fixed category (§11.1a) — no picker for them. */}
                {!BUILT_IN_HEADS.includes(h) && (
                  <select
                    className="config-cat-select"
                    aria-label={`Category for ${headName(h)}`}
                    data-tip="Category (§11) — drives budgeting roll-ups and the netCore math"
                    value={categoryFor(h)}
                    onChange={(e) => moveHead(h, e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
                {!BUILT_IN_HEADS.includes(h) && (
                  <button
                    type="button"
                    className="chip-delete"
                    aria-label={`Delete head ${headName(h)}`}
                    data-tip={
                      headInUse(state, h)
                        ? "In use by a task — deleting will ask you to reassign first"
                        : (registry[h] ?? []).length > 0
                          ? `Deletes this head and its ${(registry[h] ?? []).length} sub-head(s) from the registry`
                          : "Removes this head from the registry"
                    }
                    onClick={() => requestDeleteHead(h)}
                  >
                    &times;
                  </button>
                )}
              </div>
              <div className="config-activities">
                {(registry[h] ?? []).length === 0 && <span className="config-empty">no sub-heads yet</span>}
                {(registry[h] ?? []).map((a) =>
                  isBuiltInActivity(h, a) ? (
                    <span key={a} className="type-chip">
                      {a}
                      <span className="built-in-dot" aria-label="Built-in sub-head" data-tip="Built-in preset — can't be deleted" />
                    </span>
                  ) : (
                    <span key={a} className="type-chip chip-deletable">
                      {a}
                      <button
                        type="button"
                        className="chip-delete"
                        aria-label={`Delete sub-head ${a}`}
                        data-tip={
                          activityInUse(state, h, a)
                            ? "In use by a task — deleting will ask you to reassign first"
                            : "Remove this sub-head from the registry"
                        }
                        onClick={() => requestDeleteActivity(h, a)}
                      >
                        &times;
                      </button>
                    </span>
                  ),
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
