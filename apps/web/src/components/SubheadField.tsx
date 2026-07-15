/**
 * Sub-head picker (§2.1 Head/Activity) — the SHARED sub-head input used by the
 * history editor, gap-fill flow, week-plan templates, and any future surface.
 * A searchable sub-head dropdown with the head DERIVED read-only from the
 * registry, plus a compact "new sub-head's head" picker when the typed sub-head
 * isn't known yet.
 *
 * §7.0.5 UI symmetry: when a `title` is supplied it also carries the §7.0.1
 * ML assist — the title → sub-head suggestion (autofill when the field is empty
 * or app-sourced; a one-click "Use this" when the user has typed something else;
 * intent-protected so an accepted/typed value is never overwritten) and, for a
 * brand-new sub-head, the sub-head → head suggestion. ML is never load-bearing:
 * with no title, or the model off, this is a plain picker and deterministic
 * entry always works.
 *
 * The resolved head is reported upward via `onHead`; the parent persists a new
 * (head, sub-head) pair with `useHeads().addActivity` on commit (idempotent).
 */
import { useEffect, useState } from "react";
import { useHeads } from "../heads";
import { useSubheadSuggestion } from "../ml/useSubheadSuggestion";
import { useHeadSuggestion } from "../ml/useHeadSuggestion";
import { FuzzyDropdown } from "./FuzzyDropdown";

interface Props {
  activity: string;
  onActivity: (v: string) => void;
  /** The head resolved from the sub-head (registry-derived or newly picked). */
  onHead: (head: string | undefined) => void;
  /** §7.0.5/§7.0.1: when provided, drives the title→sub-head ML suggestion.
   * Omit for a plain (no-ML) picker. */
  title?: string;
}

export function SubheadField({ activity, onActivity, onHead, title }: Props): JSX.Element {
  const { plannableActivities, plannableHeads, registry, headFor } = useHeads();
  const derived = headFor(activity);
  const isNew = activity.trim() !== "" && !derived;
  const [newHead, setNewHead] = useState("");
  const [newHeadTouched, setNewHeadTouched] = useState(false);
  const head = derived ?? (isNew ? newHead.trim() || undefined : undefined);

  // Who sourced the sub-head: "app" (ML autofill — replaceable on the next title
  // edit) vs "user" (hand-typed or "Use this"-accepted — protected, §7.0.1).
  const [source, setSource] = useState<"app" | "user">("app");

  // §7.0.1 title → sub-head suggestion (only when a title is supplied).
  const suggestion = useSubheadSuggestion(title ?? "", plannableActivities);
  const proposedNew = (suggestion?.kind === "new" && suggestion.name) || (title ?? "").trim();
  const suggestedSubhead =
    suggestion?.kind === "existing" ? suggestion.activity
    : suggestion?.kind === "new" ? proposedNew
    : undefined;
  const autofill = source !== "user" || activity.trim() === "";

  useEffect(() => {
    onHead(head);
  }, [head, onHead]);

  // Autofill on a fresh title-driven suggestion when the field isn't user-owned.
  useEffect(() => {
    if (!suggestion || !autofill || !suggestedSubhead) return;
    onActivity(suggestedSubhead);
    setSource("app");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  // "Use this" offer: user has typed something and the suggestion differs.
  const offer = !!suggestion && !autofill && suggestedSubhead !== undefined && suggestedSubhead !== activity;

  // §7.0.1 sub-head → head suggestion for a brand-new sub-head (prefills the
  // new-head picker until the user touches it).
  const headSuggestion = useHeadSuggestion(isNew ? activity : "", newHeadTouched, registry);
  useEffect(() => {
    if (isNew && !newHeadTouched && headSuggestion?.kind === "existing") setNewHead(headSuggestion.head);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headSuggestion, isNew]);

  const suggestedHead =
    suggestion?.kind === "existing" ? headFor(suggestion.activity)
    : suggestion?.kind === "new" && headSuggestion?.kind === "existing" ? headSuggestion.head
    : undefined;

  return (
    <>
      {suggestion && autofill && suggestedSubhead === activity && activity !== "" && (
        <span className={`ml-tag ${suggestion.kind === "new" ? "ml-tag-new" : "ml-tag-existing"}`}
          data-tip="Suggested from your past titles — still fully editable">
          {suggestion.kind === "new" ? "suggested new" : "suggested"}
        </span>
      )}
      <FuzzyDropdown
        value={activity}
        onChange={(v) => { onActivity(v); setSource("user"); }}
        options={plannableActivities}
        placeholder="e.g. Reading, Sleep, Errands"
        clearable
        ariaLabel="Sub-head"
      />
      {offer && (
        <div className="ml-choice" data-tip="Your title suggests a different sub-head — click to use it">
          <span className="ml-choice-text">
            <span className="ml-choice-lead">
              <span className={`ml-tag ${suggestion?.kind === "new" ? "ml-tag-new" : "ml-tag-existing"}`}>
                {suggestion?.kind === "new" ? "suggested new" : "suggested"}
              </span>
              <button type="button" className="ml-choice-value"
                onClick={() => { onActivity(suggestedSubhead!); setSource("user"); }}
                data-tip="Use this sub-head">{suggestedSubhead}</button>
              {suggestedHead && <span className="ml-choice-in">in</span>}
            </span>
            {suggestedHead && <strong className="ml-choice-headpill">{suggestedHead}</strong>}
          </span>
        </div>
      )}
      {derived && (
        <div className="derived-head" data-tip="Derived from the sub-head — not editable here">
          Head: <strong>{derived}</strong>
        </div>
      )}
      {isNew && (
        <div className="field" style={{ marginTop: 8 }}>
          <label data-tip="This sub-head is new — pick or type the head it belongs to">
            New sub-head's head <span className="req-dot" aria-label="required">•</span>
            {!newHeadTouched && headSuggestion?.kind === "existing" && (
              <span className="ml-tag ml-tag-existing" data-tip="Suggested from your existing sub-heads — still editable">suggested</span>
            )}
          </label>
          <FuzzyDropdown
            value={newHead}
            onChange={(v) => { setNewHead(v); setNewHeadTouched(true); }}
            options={plannableHeads}
            placeholder="Pick or create a head"
            clearable
            ariaLabel="New sub-head's head"
          />
        </div>
      )}
    </>
  );
}
