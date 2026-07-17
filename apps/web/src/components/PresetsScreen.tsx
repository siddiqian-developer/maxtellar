/**
 * Presets configuration — a full screen (§11.1c, 2026-07-18), opened from
 * Settings ("Manage presets →"), same chrome as the Heads & Sub-heads screen.
 * Settings itself shows only a compact read-only summary; ALL preset editing
 * lives here, where the table has real width (the settings drawer's ~430px is
 * exactly why an inline table misaligned).
 *
 * One row per preset: head, Timing Type select, the Value cell that timing's
 * §2.5 FIELD_ROLES require (budget for budgeted; start–end for fixed; start /
 * end alone for semi-head / semi-tail; nothing for unscheduled), a Source
 * select (Flat / Week Plan / Settings), reorder (drag ⋮⋮ AND ▴/▾), remove ×.
 * All columns left-aligned; dropdown options render Capital Case (§6 law).
 *
 * Add = the ⊕ at the bottom-left: appends a pending row with the head picker
 * focused; leaving it without picking a valid head DISCARDS the row with a
 * snap-toast (never a half-filled preset in the list).
 */

import { useState } from "react";
import type { TimingType } from "@maxtellar/core";
import { headName } from "@maxtellar/core";
import { useSettings } from "../settings";
import { useHeads } from "../heads";
import { headLabels } from "../headDisplay";
import { blankPresetFor, type PresetConfig, type BudgetSource, type AnchorSource } from "../presets";
import { FIELD_ROLES, TodField } from "./TaskSpecFields";
import { useEscClose } from "../useEscClose";
import { capitalCase } from "../text";
import { DurInput } from "./BudgetPanel";
import { FuzzyDropdown } from "./FuzzyDropdown";
import { SnapToast, useSnapToast } from "../SnapToast";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const PRESET_TIMINGS: TimingType[] = ["unscheduled", "budgeted", "semi-head", "semi-tail", "fixed"];
const BUDGET_SOURCES: BudgetSource[] = ["flat", "weekPlan", "settings"];
const ANCHOR_SOURCES: AnchorSource[] = ["flat", "weekPlan"];

/** One preset row — sortable (dnd-kit, drag by the ⋮⋮ grip) IN ADDITION to the
 * ▴/▾ buttons. Anchor times are smart TodFields (§7.0.2 parity), editable only
 * when the source is Flat. */
function SortablePresetRow({ p, index, count, hour12, onUpdate, onRemove, onMove }: {
  p: PresetConfig;
  index: number;
  count: number;
  hour12: boolean;
  onUpdate: (id: string, patch: Partial<PresetConfig>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style = { transform: CSS.Transform.toString(transform), transition, ...(isDragging ? { zIndex: 5, opacity: 0.7 } : {}) };
  const roles = FIELD_ROLES[p.timing];
  const showAnchors = roles.start !== "not used" || roles.end !== "not used";
  const showBudget = !showAnchors && roles.budget !== "not used";
  const flatAnchors = p.anchorSource === "flat";
  return (
    <div ref={setNodeRef} style={style} className="preset-table-row">
      <span className="preset-row-name">
        <span className="bp-drag" data-tip="Drag to reorder" {...listeners} {...attributes}>⋮⋮</span>
        {headName(p.headId)}
      </span>
      <select
        aria-label={`${p.label} timing type`}
        value={p.timing}
        onChange={(e) => onUpdate(p.id, { timing: e.target.value as TimingType })}
      >
        {PRESET_TIMINGS.map((t) => <option key={t} value={t}>{capitalCase(t)}</option>)}
      </select>
      {showBudget && (
        <>
          <span className="preset-row-value">
            <DurInput
              ariaLabel={`${p.label} budget`}
              value={p.budgetFlat}
              disabled={p.budgetSource !== "flat"}
              onCommit={(m) => { if (m !== null) onUpdate(p.id, { budgetFlat: m }); }}
            />
          </span>
          <select
            aria-label={`${p.label} budget source`}
            value={p.budgetSource}
            onChange={(e) => onUpdate(p.id, { budgetSource: e.target.value as BudgetSource })}
          >
            {BUDGET_SOURCES.map((s) => <option key={s} value={s}>{capitalCase(s)}</option>)}
          </select>
        </>
      )}
      {showAnchors && (
        <>
          <span className="preset-row-value">
            {roles.start !== "not used" && (
              <TodField value={p.startFlat} hour12={hour12} disabled={!flatAnchors} ariaLabel={`${p.label} start`}
                onChange={(tod) => { if (tod !== undefined) onUpdate(p.id, { startFlat: tod }); }} />
            )}
            {roles.end !== "not used" && (
              <TodField value={p.endFlat} hour12={hour12} disabled={!flatAnchors} ariaLabel={`${p.label} end`}
                onChange={(tod) => { if (tod !== undefined) onUpdate(p.id, { endFlat: tod }); }} />
            )}
          </span>
          <select
            aria-label={`${p.label} time source`}
            value={p.anchorSource}
            onChange={(e) => onUpdate(p.id, { anchorSource: e.target.value as AnchorSource })}
          >
            {ANCHOR_SOURCES.map((s) => <option key={s} value={s}>{capitalCase(s)}</option>)}
          </select>
        </>
      )}
      {!showBudget && !showAnchors && (
        <>
          <span className="preset-row-empty">—</span>
          <span className="preset-row-empty">—</span>
        </>
      )}
      <span className="preset-row-actions">
        <button type="button" className="link-btn preset-arrow up" disabled={index === 0} aria-label={`Move ${p.label} up`} onClick={() => onMove(p.id, -1)} />
        <button type="button" className="link-btn preset-arrow down" disabled={index === count - 1} aria-label={`Move ${p.label} down`} onClick={() => onMove(p.id, 1)} />
        <button type="button" className="chip-delete" aria-label={`Remove ${p.label} preset`} onClick={() => onRemove(p.id)}>&times;</button>
      </span>
    </div>
  );
}

export function PresetsScreen({ onBack }: { onBack: () => void }): JSX.Element {
  const { presetsConfig, setPresetsConfig, timeFormat } = useSettings();
  const { heads } = useHeads();
  const hour12 = timeFormat === "12h";
  const { toast, notify } = useSnapToast();

  // Pending "add" row (⊕): head picker focused; discarded with a toast if left
  // without a valid head. null = no pending row.
  const [pendingHead, setPendingHead] = useState<string | null>(null);

  useEscClose(onBack);

  const availableHeads = heads.filter((h) => !presetsConfig.some((p) => p.headId === h));

  const updatePreset = (id: string, patch: Partial<PresetConfig>): void =>
    setPresetsConfig(presetsConfig.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePreset = (id: string): void =>
    setPresetsConfig(presetsConfig.filter((p) => p.id !== id));
  const movePreset = (id: string, dir: -1 | 1): void => {
    const i = presetsConfig.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= presetsConfig.length) return;
    setPresetsConfig(arrayMove(presetsConfig, i, j));
  };

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDndEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = presetsConfig.findIndex((p) => p.id === String(active.id));
    const to = presetsConfig.findIndex((p) => p.id === String(over.id));
    if (from >= 0 && to >= 0) setPresetsConfig(arrayMove(presetsConfig, from, to));
  };

  /** Pending-row head change: a valid available head commits the row at once. */
  const onPendingHead = (v: string): void => {
    if (availableHeads.includes(v)) {
      setPresetsConfig([...presetsConfig, blankPresetFor(v)]);
      setPendingHead(null);
    } else {
      setPendingHead(v);
    }
  };
  /** Focus left the pending row without a valid head → discard, with a toast. */
  const onPendingBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; // still inside
    if (pendingHead !== null) {
      setPendingHead(null);
      notify("New preset discarded — pick a head to keep it");
    }
  };

  return (
    <div className="config-screen">
      <div className="config-header">
        <button className="theme-toggle" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>Presets</h2>
      </div>

      <div className="config-body">
        <section className="config-section" style={{ maxWidth: 880 }}>
          <p className="config-empty" style={{ marginBottom: 10 }}>
            Each preset pre-fills the task drawer: its timing type, and the value that timing
            needs — a fixed number/time, today's week-plan line, or (Sleep) the Settings sleep
            budget. Drag ⋮⋮ or use ▴▾ to reorder; ⊕ adds any head as a new preset.
          </p>
          <div className="preset-table">
            <div className="preset-table-head">
              <span>Head</span>
              <span>Timing Type</span>
              <span>Value</span>
              <span>Source</span>
              <span />
            </div>
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDndEnd}>
              <SortableContext items={presetsConfig.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {presetsConfig.map((p, i) => (
                  <SortablePresetRow
                    key={p.id}
                    p={p}
                    index={i}
                    count={presetsConfig.length}
                    hour12={hour12}
                    onUpdate={updatePreset}
                    onRemove={removePreset}
                    onMove={movePreset}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {pendingHead !== null ? (
              <div className="preset-table-row preset-add-row" onBlur={onPendingBlur}>
                <FuzzyDropdown
                  value={pendingHead}
                  onChange={onPendingHead}
                  options={availableHeads}
                  labels={headLabels(availableHeads)}
                  placeholder="Pick a head for the new preset"
                  autoFocus
                  clearable
                  ariaLabel="New preset head"
                />
              </div>
            ) : (
              <button
                type="button"
                className="preset-add-circle"
                aria-label="Add a preset"
                data-tip="Add a head as a new preset"
                onClick={() => setPendingHead("")}
              >
                +
              </button>
            )}
          </div>
        </section>
      </div>
      <SnapToast text={toast} />
    </div>
  );
}
