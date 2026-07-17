/**
 * Hover-reveal insert affordance for a vertical list of rows — the shared
 * primitive behind "add a row at this exact spot" wherever a list wants it
 * (BudgetPanel's per-category head list today; task lists / any other
 * reorderable row list later, §11.8a).
 *
 * Two zones, each hidden until hovered:
 *  - **Empty state**: the list has zero items — the WHOLE placeholder row
 *    (e.g. "no Recharging budgets") is the hover target; a centered
 *    `AddCircleButton` appears before the label. `onInsert(0)`.
 *  - **Non-empty**: each row is split into an upper and lower half. Hovering
 *    the upper half reveals a `+` centered on that row's TOP boundary;
 *    hovering the lower half reveals one on the BOTTOM boundary. Clicking
 *    inserts at that exact position — `onInsert(index)` for the row's own
 *    slot (pushes it and everything after down), `onInsert(index + 1)` for
 *    the slot right after it.
 *
 * Deliberately dumb: this component does no reordering itself — it only ever
 * reports WHERE (`onInsert(atIndex)`); the caller owns what "insert" means
 * (open a drawer, splice an array, whatever).
 */
import { useState, type ReactNode } from "react";
import { AddCircleButton } from "./AddCircleButton";

export function HoverInsertRows<T>({
  items,
  keyFor,
  renderRow,
  onInsert,
  emptyLabel,
  addLabel,
  disabled,
  className,
}: {
  items: T[];
  keyFor: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  /** Where to insert — an index into `items` (0..items.length). */
  onInsert: (atIndex: number) => void;
  /** Shown (with the + before it) when `items` is empty. */
  emptyLabel: string;
  /** Base for the button's aria-label, e.g. "Add a head" — suffixed with
   * " above X" / " below X" / "" (empty state) for the concrete label. */
  addLabel: string;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
  if (items.length === 0) {
    return (
      <div className={`hir-empty${className ? ` ${className}` : ""}`}>
        {!disabled && (
          <AddCircleButton label={addLabel} tip={addLabel} size={18} className="hir-empty-add"
            onClick={() => onInsert(0)} />
        )}
        <span className="hir-empty-label">{emptyLabel}</span>
      </div>
    );
  }
  return (
    <div className={className}>
      {items.map((item, i) => (
        <HoverInsertRow key={keyFor(item)} disabled={disabled} onInsertAbove={() => onInsert(i)} onInsertBelow={() => onInsert(i + 1)} addLabel={addLabel}>
          {renderRow(item, i)}
        </HoverInsertRow>
      ))}
    </div>
  );
}

/** One row + its two hover-split insert zones. Cursor Y within the row
 * (not the zone — the zone is pointer-events:none until revealed, so it
 * can't :hover on its own) decides which half is "hot"; CSS keys off the
 * `data-hover` attribute this sets. */
function HoverInsertRow({ children, disabled, onInsertAbove, onInsertBelow, addLabel }: {
  children: ReactNode;
  disabled: boolean | undefined;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  addLabel: string;
}): JSX.Element {
  const [hover, setHover] = useState<"top" | "bottom" | null>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHover(e.clientY - r.top < r.height / 2 ? "top" : "bottom");
  };
  return (
    <div className="hir-row" data-hover={hover ?? undefined} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {!disabled && (
        <>
          <div className="hir-zone hir-zone-top">
            <AddCircleButton label={`${addLabel} above`} tip={`${addLabel} above`} size={18} className="hir-edge-add" onClick={onInsertAbove} />
          </div>
          <div className="hir-zone hir-zone-bottom">
            <AddCircleButton label={`${addLabel} below`} tip={`${addLabel} below`} size={18} className="hir-edge-add" onClick={onInsertBelow} />
          </div>
        </>
      )}
      {children}
    </div>
  );
}
