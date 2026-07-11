/**
 * React hook wiring the suggestion engine into the drawer (SPEC §7.0.1).
 * Debounces ~400ms after typing stops; never fires once the user has
 * touched the sub-head field this session ("intent wins", always).
 */

import { useEffect, useRef, useState } from "react";
import { suggestSubhead, type Suggestion } from "./suggest";

export function useSubheadSuggestion(
  title: string,
  touched: boolean,
  knownActivities: string[],
): Suggestion | null {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const latestTitle = useRef(title);
  latestTitle.current = title;

  useEffect(() => {
    if (touched || title.trim().length < 3) {
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
  }, [title, touched]);

  return suggestion;
}
