/**
 * Hook wiring the decomposition suggester into the drawer (§2.7 / §7.0.1).
 * Debounces ~400ms after the title stops changing; recomputes on every title or
 * mode change. Never surfaces errors (silent degrade). Returns null until a
 * confident past breakdown is found.
 */

import { useEffect, useRef, useState } from "react";
import { suggestDecomposition, type DecompSuggestion } from "./decompose";
import type { AiLevel } from "../settings";

export function useDecompositionSuggestion(title: string, level: AiLevel): DecompSuggestion | null {
  const [suggestion, setSuggestion] = useState<DecompSuggestion | null>(null);
  const latest = useRef(title);
  latest.current = title;

  useEffect(() => {
    if (title.trim().length < 2) {
      setSuggestion(null);
      return;
    }
    const requestedFor = title;
    const timer = setTimeout(() => {
      suggestDecomposition(title, level)
        .then((s) => {
          if (latest.current === requestedFor) setSuggestion(s);
        })
        .catch(() => setSuggestion(null));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, level]);

  return suggestion;
}
