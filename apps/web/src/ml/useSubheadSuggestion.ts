/**
 * React hook wiring the suggestion engine into the drawer (SPEC §7.0.1).
 * Debounces ~400ms after typing stops; recomputes on EVERY title change —
 * a new title = new intent = a fresh suggestion (revised 2026-07-11). Whether
 * that suggestion autofills or lands as a tag-only hint is the caller's call
 * (it depends on whether the sub-head field holds hand-typed content).
 */

import { useEffect, useRef, useState } from "react";
import { suggestSubhead, type Suggestion } from "./suggest";

export function useSubheadSuggestion(
  title: string,
  knownActivities: string[],
): Suggestion | null {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const latestTitle = useRef(title);
  latestTitle.current = title;

  useEffect(() => {
    if (title.trim().length < 3) {
      setSuggestion(null);
      return;
    }
    const requestedFor = title;
    const timer = setTimeout(() => {
      suggestSubhead(title, knownActivities)
        .then((s) => {
          // Ignore stale responses (user kept typing past this debounce window).
          if (latestTitle.current === requestedFor) setSuggestion(s.kind === "none" ? null : s);
        })
        .catch(() => setSuggestion(null)); // never surfaces an error — silent degrade
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  return suggestion;
}
