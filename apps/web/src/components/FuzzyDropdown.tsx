/**
 * Filtered dropdown with live subsequence-match highlighting (SPEC VI) — the
 * one combobox pattern used everywhere in the app a dropdown is needed
 * (drawer's Sub-head and New-sub-head's-head fields, Heads & Sub-heads
 * config screen's head picker). Opens on focus, filters as you type via
 * `fuzzy.ts`, bolds the matched letters, arrow-key navigable. Escape closes
 * only the open list (stops propagation so it doesn't also close the parent
 * drawer via useEscClose); Escape with the list already closed bubbles
 * normally.
 *
 * The combobox state machine + ARIA wiring is downshift's `useCombobox` (adopted
 * 2026-07-16 per the §7.0.4 buy-first rule — see specs/07-engineering.md). What
 * downshift buys: aria-activedescendant/aria-controls/id plumbing, outside-click
 * dismissal, and a tested keyboard state machine. What stays ours: `fuzzy.ts`
 * matching + bolding, and the two §6 behaviors that downshift's defaults would
 * otherwise break — see `stateReducer` below. The field is FREE TEXT (a brand-new
 * sub-head is a valid value); downshift's "selection" is only a shortcut for
 * filling it, never a constraint on it.
 */

import { useCombobox } from "downshift";
import { fuzzyMatch, fuzzyScore } from "../fuzzy";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  autoFocus?: boolean;
  clearable?: boolean;
  ariaLabel?: string;
}

function highlightMatches(text: string, positions: number[]): JSX.Element {
  const set = new Set(positions);
  return (
    <>
      {text.split("").map((ch, i) => (set.has(i) ? <strong key={i}>{ch}</strong> : <span key={i}>{ch}</span>))}
    </>
  );
}

export function FuzzyDropdown({ value, onChange, options, placeholder, autoFocus, clearable, ariaLabel }: Props): JSX.Element {
  const matches = options
    .map((o) => ({ o, pos: fuzzyMatch(value, o) }))
    .filter((m): m is { o: string; pos: number[] } => m.pos !== null)
    .sort((a, b) => fuzzyScore(a.pos) - fuzzyScore(b.pos) || (a.pos[0] ?? 0) - (b.pos[0] ?? 0))
    .map((m) => m.o);

  const { isOpen, getInputProps, getMenuProps, getItemProps, highlightedIndex, openMenu } = useCombobox({
    items: matches,
    inputValue: value,
    defaultHighlightedIndex: 0, // Enter with no arrow-key press takes the top match
    itemToString: (item) => item ?? "",
    onInputValueChange: ({ inputValue }) => onChange(inputValue ?? ""),
    stateReducer: (state, { type, changes }) => {
      switch (type) {
        // §6: Escape closes only the open list. downshift's default ALSO clears the
        // input — that would silently destroy what the user typed. Keep the text.
        case useCombobox.stateChangeTypes.InputKeyDownEscape:
          return { ...changes, inputValue: state.inputValue, selectedItem: state.selectedItem };
        // The field is free text: blurring must never auto-commit the highlighted
        // option over what was actually typed (downshift's default for a combobox).
        case useCombobox.stateChangeTypes.InputBlur:
          return { ...changes, inputValue: state.inputValue, selectedItem: state.selectedItem };
        default:
          return changes;
      }
    },
  });

  const show = isOpen && matches.length > 0;

  return (
    <div className="fuzzy-combobox">
      <div className="clearable-field">
        <input
          {...getInputProps({
            autoFocus,
            placeholder,
            "aria-label": ariaLabel,
            autoComplete: "off",
            onFocus: () => { if (!isOpen) openMenu(); },
            onKeyDown: (e) => {
              if (e.key !== "Escape") return;
              if (isOpen) {
                // Closing the list is this Escape's whole job — don't let the
                // parent drawer's useEscClose see it too (back-navigation stack).
                e.stopPropagation();
              } else {
                // List already closed: this Escape belongs to the drawer. Tell
                // downshift to keep its hands off and let it bubble.
                (e.nativeEvent as unknown as { preventDownshiftDefault?: boolean }).preventDownshiftDefault = true;
              }
            },
          })}
        />
        {clearable && value && (
          <button type="button" className="clear-btn" tabIndex={-1} aria-label="Clear" onClick={() => onChange("")}>&times;</button>
        )}
      </div>
      <ul {...getMenuProps({ className: "fuzzy-list" })} style={show ? undefined : { display: "none" }}>
        {show &&
          matches.map((o, i) => (
            <li
              key={o}
              className={`fuzzy-option${i === highlightedIndex ? " active" : ""}`}
              {...getItemProps({ item: o, index: i })}
            >
              {highlightMatches(o, fuzzyMatch(value, o) ?? [])}
            </li>
          ))}
      </ul>
    </div>
  );
}
