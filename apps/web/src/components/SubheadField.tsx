/**
 * Sub-head picker (§2.1 Head/Activity) — the lean shared version used by the
 * history editor and gap-fill flow: a searchable sub-head dropdown with the
 * head DERIVED read-only from the registry, plus a compact "new sub-head's
 * head" picker when the typed sub-head isn't known yet. No ML suggestions here
 * (that richness lives in the planning drawer); this is the back-log face.
 *
 * The resolved head is reported upward via `onHead`; the parent persists a new
 * (head, sub-head) pair with `useHeads().addActivity` on commit (idempotent).
 */
import { useEffect, useState } from "react";
import { useHeads } from "../heads";
import { FuzzyDropdown } from "./FuzzyDropdown";

interface Props {
  activity: string;
  onActivity: (v: string) => void;
  /** The head resolved from the sub-head (registry-derived or newly picked). */
  onHead: (head: string | undefined) => void;
}

export function SubheadField({ activity, onActivity, onHead }: Props): JSX.Element {
  const { plannableActivities, plannableHeads, headFor } = useHeads();
  const derived = headFor(activity);
  const isNew = activity.trim() !== "" && !derived;
  const [newHead, setNewHead] = useState("");
  const head = derived ?? (isNew ? newHead.trim() || undefined : undefined);

  useEffect(() => {
    onHead(head);
  }, [head, onHead]);

  return (
    <>
      <FuzzyDropdown
        value={activity}
        onChange={onActivity}
        options={plannableActivities}
        placeholder="e.g. Reading, Sleep, Errands"
        clearable
        ariaLabel="Sub-head"
      />
      {derived && (
        <div className="derived-head" data-tip="Derived from the sub-head — not editable here">
          Head: <strong>{derived}</strong>
        </div>
      )}
      {isNew && (
        <div className="field" style={{ marginTop: 8 }}>
          <label data-tip="This sub-head is new — pick or type the head it belongs to">
            New sub-head's head <span className="req-dot" aria-label="required">•</span>
          </label>
          <FuzzyDropdown
            value={newHead}
            onChange={setNewHead}
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
