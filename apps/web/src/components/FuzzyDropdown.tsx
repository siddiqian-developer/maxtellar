/**
 * Filtered dropdown with live subsequence-match highlighting (SPEC VI) — the
 * one combobox pattern used everywhere in the app a dropdown is needed
 * (drawer's Sub-head and New-sub-head's-head fields, Heads & Sub-heads
 * config screen's head picker). Opens on focus, filters as you type via
 * `fuzzy.ts`, bolds the matched letters, arrow-key navigable. Escape closes
 * only the open list (stops propagation so it doesn't also close the parent
 * drawer via useEscClose); Escape with the list already closed bubbles
 * normally.
 */

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = options
    .map((o) => ({ o, pos: fuzzyMatch(value, o) }))
    .filter((m): m is { o: string; pos: number[] } => m.pos !== null)
    .sort((a, b) => fuzzyScore(a.pos) - fuzzyScore(b.pos) || (a.pos[0] ?? 0) - (b.pos[0] ?? 0))
    .map((m) => m.o);

  useEffect(() => setHighlight(0), [value]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const choose = (opt: string): void => {
    onChange(opt);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && matches[highlight]) {
      e.preventDefault();
      choose(matches[highlight] as string);
    }
  };

  return (
    <div className="fuzzy-combobox" ref={rootRef}>
      <div className="clearable-field">
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          autoComplete="off"
        />
        {clearable && value && (
          <button type="button" className="clear-btn" tabIndex={-1} aria-label="Clear" onClick={() => onChange("")}>&times;</button>
        )}
      </div>
      {open && matches.length > 0 && (
        <ul className="fuzzy-list" role="listbox">
          {matches.map((o, i) => {
            const pos = fuzzyMatch(value, o) ?? [];
            return (
              <li
                key={o}
                role="option"
                aria-selected={i === highlight}
                className={`fuzzy-option${i === highlight ? " active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                onMouseEnter={() => setHighlight(i)}
              >
                {highlightMatches(o, pos)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
