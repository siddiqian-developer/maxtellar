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
import { useSettings } from "../settings";
import { headLabel, headLabels } from "../headDisplay";
import { useEscClose } from "../useEscClose";
import { rehomeActivity } from "../ml/vectorStore";
import { FuzzyDropdown } from "./FuzzyDropdown";
import { useHeadSuggestion } from "../ml/useHeadSuggestion";
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

/** §11.1a: one head row — draggable onto another category (dnd-kit
 * `useDraggable`; drop targets are the category sections, `useDroppable`
 * below). Built-ins aren't draggable (their category is fixed). */
function HeadRow({
  headId,
  heads,
  registry,
  categories,
  categoryFor,
  moveHead,
  headInUse,
  requestDeleteHead,
  requestDeleteActivity,
  activityInUse,
}: {
  headId: string;
  heads: string[];
  registry: Record<string, string[]>;
  categories: string[];
  categoryFor: (h: string) => string;
  moveHead: (h: string, c: string) => string | null;
  headInUse: (h: string) => boolean;
  requestDeleteHead: (h: string) => void;
  requestDeleteActivity: (h: string, a: string) => void;
  activityInUse: (h: string, a: string) => boolean;
}): JSX.Element {
  const builtIn = BUILT_IN_HEADS.includes(headId);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `head:${headId}`,
    data: { headId },
    disabled: builtIn,
  });
  const [moveOpen, setMoveOpen] = useState(false);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 5 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={`config-head-row${isDragging ? " dragging" : ""}`}>
      <div className="config-head-title">
        {!builtIn && (
          <span className="bp-drag" data-tip="Drag onto another category to move this head" {...listeners} {...attributes}>⋮⋮</span>
        )}
        <span className="config-head-name">{headLabel(headId, heads)}</span>
        {builtIn && (
          <span className="built-in-dot" aria-label="Built-in head" data-tip="Built-in — can't be deleted or moved" />
        )}
        {BUILT_IN_HEAD_NOTES[headId] && (
          <span className="config-head-note">{BUILT_IN_HEAD_NOTES[headId]}</span>
        )}
        {!builtIn && (
          <span className="config-move-wrap">
            <button
              type="button"
              className="config-move-btn"
              aria-label={`Move ${headName(headId)} to another category`}
              data-tip="Move to another category"
              onClick={() => setMoveOpen((v) => !v)}
            >
              ⇄
            </button>
            {moveOpen && (
              <ul className="config-move-list" role="menu">
                {categories.filter((c) => c !== categoryFor(headId)).map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { moveHead(headId, c); setMoveOpen(false); }}
                    >
                      to: {c}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </span>
        )}
        {!builtIn && (
          <button
            type="button"
            className="chip-delete"
            aria-label={`Delete head ${headName(headId)}`}
            data-tip={
              headInUse(headId)
                ? "In use by a task — deleting will ask you to reassign first"
                : (registry[headId] ?? []).length > 0
                  ? `Deletes this head and its ${(registry[headId] ?? []).length} sub-head(s) from the registry`
                  : "Removes this head from the registry"
            }
            onClick={() => requestDeleteHead(headId)}
          >
            &times;
          </button>
        )}
      </div>
      <div className="config-activities">
        {(registry[headId] ?? []).length === 0 && <span className="config-empty">no sub-heads yet</span>}
        {(registry[headId] ?? []).map((a) =>
          isBuiltInActivity(headId, a) ? (
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
                  activityInUse(headId, a)
                    ? "In use by a task — deleting will ask you to reassign first"
                    : "Remove this sub-head from the registry"
                }
                onClick={() => requestDeleteActivity(headId, a)}
              >
                &times;
              </button>
            </span>
          ),
        )}
      </div>
    </div>
  );
}

/** §11.1a: one category section — a drop target for head DnD, and itself a
 * sortable item (category reordering, dragged by its header grip). */
function CategorySection({
  category,
  headsIn,
  ...rowProps
}: {
  category: string;
  headsIn: string[];
} & Omit<Parameters<typeof HeadRow>[0], "headId">): JSX.Element {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `cat:${category}`, data: { category } });
  const { attributes, listeners, setNodeRef: setSortRef, transform, transition } = useSortable({ id: `catsort:${category}` });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setSortRef} style={style} className={`config-cat-section${isOver ? " cat-drop-over" : ""}`}>
      <div className="config-cat-header">
        <span className="bp-drag" data-tip="Drag to reorder categories" {...listeners} {...attributes}>⋮⋮</span>
        <h4>{category}</h4>
      </div>
      <div ref={setDropRef} className="config-cat-drop">
        {headsIn.length === 0 && <span className="config-empty">no heads yet — drag one here, or move one via ⇄</span>}
        {headsIn.map((h) => <HeadRow key={h} headId={h} {...rowProps} />)}
      </div>
    </div>
  );
}

export function HeadsConfigScreen({ state, dispatch, onBack }: Props): JSX.Element {
  const { registry, heads, categories, addHead, addActivity, deleteActivity, deleteHead, headFor, categoryFor, moveHead, addCategory, reorderCategories } = useHeads();
  const { presetsConfig, setPresetsConfig } = useSettings();

  // Deleting a head also removes any presets pointing at it (§11.1c) — a
  // preset must never dangle on a head that no longer exists in the registry.
  const removeHead = (headId: string): void => {
    deleteHead(headId);
    setPresetsConfig(presetsConfig.filter((p) => p.headId !== headId));
  };
  const [newHead, setNewHead] = useState("");
  const [activityHead, setActivityHead] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [headTouched, setHeadTouched] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** A category section registers TWO overlapping droppables — the whole-card
   * `cat:` (head DnD target) and the header-only `catsort:` (category-reorder
   * target, dnd-kit sortable). `cat:`'s box is much bigger, so `closestCenter`
   * often wins it even when the drag is a category-reorder — resolve either
   * id form down to the plain category name here. */
  const overCategory = (overId: string): string | null =>
    overId.startsWith("cat:") ? overId.slice(4) : overId.startsWith("catsort:") ? overId.slice(8) : null;

  const onDndEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overCat = overCategory(String(over.id));
    if (overCat === null) return;
    if (activeId.startsWith("head:")) {
      moveHead(activeId.slice(5), overCat);
      return;
    }
    if (activeId.startsWith("catsort:")) {
      const from = categories.indexOf(activeId.slice(8));
      const to = categories.indexOf(overCat);
      if (from >= 0 && to >= 0 && from !== to) reorderCategories(arrayMove(categories, from, to));
    }
  };

  const submitCategory = (): void => {
    if (!newCategory.trim()) return;
    addCategory(newCategory);
    setNewCategory("");
  };

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
      removeHead(headId);
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
      removeHead(reassign.headId);
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

        <section className="config-section config-two-col" style={{ maxWidth: 880 }}>
          <div className="config-col">
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
          </div>
          <div className="config-col">
            <h3>Add a category</h3>
            <p className="config-empty" style={{ marginBottom: 8 }}>
              Categories are add-only — the shipped ones can be reordered but not renamed or
              removed. A new one starts empty; move heads into it from the Registry below.
            </p>
            <div className="config-form-row">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCategory(); }}
                placeholder="e.g. Personal Projects"
                aria-label="New category name"
              />
              <button className="primary" onClick={submitCategory} disabled={!newCategory.trim()}>Add category</button>
            </div>
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
          <p className="config-empty" style={{ marginBottom: 8 }}>
            Drag a category by its grip (⋮⋮) to reorder. Drag a head onto another category, or use its
            ⇄ button, to move it — built-ins stay put.
          </p>
          {/* pointerWithin, not closestCenter: each category registers TWO droppables
              (the whole card for head-drop, the header for category-reorder) that
              overlap in the same screen region. closestCenter picked the big card's
              far-off center over the small header's near one on short drags —
              pointerWithin instead picks whichever rect the pointer is actually inside. */}
          <DndContext sensors={dndSensors} collisionDetection={pointerWithin} onDragEnd={onDndEnd}>
            <SortableContext items={categories.map((c) => `catsort:${c}`)} strategy={verticalListSortingStrategy}>
              {categories.map((c) => {
                const inCat = [...BUILT_IN_HEADS.filter((h) => categoryFor(h) === c), ...heads.filter((h) => !BUILT_IN_HEADS.includes(h) && categoryFor(h) === c)];
                return (
                  <CategorySection
                    key={c}
                    category={c}
                    headsIn={inCat}
                    heads={heads}
                    registry={registry}
                    categories={categories}
                    categoryFor={categoryFor}
                    moveHead={moveHead}
                    headInUse={(h) => headInUse(state, h)}
                    requestDeleteHead={requestDeleteHead}
                    requestDeleteActivity={requestDeleteActivity}
                    activityInUse={(h, a) => activityInUse(state, h, a)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </section>
      </div>
    </div>
  );
}
