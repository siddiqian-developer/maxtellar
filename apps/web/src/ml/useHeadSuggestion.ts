/**
 * React hook wiring the sub-head → head suggestion engine into the Heads &
 * Sub-heads config screen (SPEC §7.0.1's "same duality" clause). Same shape
 * as `useSubheadSuggestion`: debounces ~400ms after typing stops, never
 * fires once the user has touched the head field this session ("intent
 * wins", always).
 */

import { useEffect, useRef, useState } from "react";
import { suggestHeadForSubhead, type HeadSuggestion } from "./suggest";

export function useHeadSuggestion(
  subheadName: string,
  touched: boolean,
  registry: Record<string, string[]>,
): HeadSuggestion | null {
  const [suggestion, setSuggestion] = useState<HeadSuggestion | null>(null);
  const latestName = useRef(subheadName);
  latestName.current = subheadName;

  useEffect(() => {
    if (touched || subheadName.trim().length < 3) {
      setSuggestion(null);
      return;
    }
    const requestedFor = subheadName;
    const timer = setTimeout(() => {
      suggestHeadForSubhead(subheadName, registry)
        .then((s) => {
          // Ignore stale responses (user kept typing past this debounce window).
          if (latestName.current === requestedFor) setSuggestion(s.kind === "none" ? null : s);
        })
        .catch(() => setSuggestion(null)); // never surfaces an error — silent degrade
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subheadName, touched]);

  return suggestion;
}
