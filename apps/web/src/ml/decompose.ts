/**
 * §2.7 (G24) ML-assisted decomposition suggestion (SPEC §7.0.1/§7.0.3).
 * When you compose a task, offer the subtasks you used for a similar task
 * before. Two-staged per §7.0.2: a deterministic exact-title match first (runs
 * in ANY compute mode), then — in "maximum" mode only — semantic similarity via
 * the on-device embedding model already shipped for sub-head suggestion (no new
 * model weight). Never load-bearing: any embedding failure resolves to null and
 * the drawer simply shows no suggestion.
 */

import { embed } from "./embedClient";
import { addDecompEntry, loadDecompCorpus, type DecompEntry } from "./vectorStore";
import type { AiLevel } from "../settings";

/** Similar-title bar for reusing a past breakdown. Higher than the sub-head
 * suggester's 0.65 — proposing a whole breakdown is a stronger commitment, so
 * demand a clearly-similar task (measured related-title cosine ≥ 0.72). The
 * "lightweight" level raises the bar further (fewer, safer suggestions). */
export const DECOMP_THRESHOLD_FULL = 0.72;
export const DECOMP_THRESHOLD_LIGHT = 0.82;

function cosine(a: Float32Array, b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface DecompChild {
  title: string;
  budget: number;
}
export interface DecompSuggestion {
  children: DecompChild[];
  source: "exact" | "similar";
  fromTitle: string;
}

/** Remember a decomposition so a future similar task can reuse it. Fire-and-
 * forget; needs ≥2 children (a composition, §2.7). Never blocks or throws. */
export function recordDecomposition(title: string, children: DecompChild[]): void {
  const t = title.trim();
  if (!t || children.length < 2) return;
  void embed(t)
    .then((v) => addDecompEntry({ title: t, vector: Array.from(v), children }))
    .catch(() => {}); // corpus is a cache; failure is a no-op
}

/** Suggest a breakdown for `title` from past decompositions, or null. Pure
 * except for `embed`. The deterministic exact-title match runs at EVERY level
 * (no model); the semantic path runs at "lightweight" (stricter bar) and
 * "full" (standard bar). Never throws — silent degrade to null. */
export async function suggestDecomposition(title: string, level: AiLevel): Promise<DecompSuggestion | null> {
  const t = title.trim();
  if (t.length < 2) return null;
  const corpus = loadDecompCorpus();
  if (corpus.length === 0) return null;

  // 1. Deterministic exact-title match (any level, no model).
  const key = t.toLowerCase();
  const exact = corpus.find((e) => e.title.trim().toLowerCase() === key);
  if (exact) return { children: exact.children, source: "exact", fromTitle: exact.title };

  // 2. Semantic similarity (AI levels only).
  if (level === "deterministic") return null;
  const threshold = level === "lightweight" ? DECOMP_THRESHOLD_LIGHT : DECOMP_THRESHOLD_FULL;
  try {
    const v = await embed(t);
    let best: DecompEntry | null = null;
    let bestSim = 0;
    for (const e of corpus) {
      const s = cosine(v, e.vector);
      if (s > bestSim) {
        bestSim = s;
        best = e;
      }
    }
    if (best && bestSim >= threshold) return { children: best.children, source: "similar", fromTitle: best.title };
  } catch {
    // silent degrade — never load-bearing
  }
  return null;
}
