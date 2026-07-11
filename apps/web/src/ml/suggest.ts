/**
 * Title → sub-head suggestion engine (SPEC §7.0.1, grilled 2026-07-10).
 * Corpus priority: past task titles (kNN vote, the strong signal) first;
 * sub-head NAMES as cold-start fallback only when the title corpus has no
 * confident match. Below threshold: a clearly-labeled "suggest creating a
 * new sub-head" result — never disguised as an existing-registry match.
 * Never load-bearing: any embedding failure resolves to `{ kind: "none" }`
 * and the caller shows nothing (silent degrade, per §7.0.1).
 */

import { embed } from "./embedClient";
import { loadTitleCorpus, loadNameVectors, saveNameVector, addTitleEntry } from "./vectorStore";

/** Threshold for the title-corpus kNN vote (full-sentence embeddings — the
 * strong signal, discriminative even at this level). */
export const CONFIDENCE_THRESHOLD = 0.45;
/** Threshold for the title→sub-head cold-start NAME fallback (comparing a
 * full title against bare sub-head names). Calibrated 2026-07-10: bge-small
 * mean-pooled short-text/single-word embeddings have a high noise floor —
 * unrelated words already land at 0.48-0.66 cosine ("cycling" vs "networking"
 * = 0.577, vs "fitness" = 0.657), while genuinely related short phrases
 * cluster at 0.72+ ("cycling" vs "cycling club" = 0.776). 0.45 let noise
 * through as false "existing" matches; 0.60 (tuned down from an initial
 * 0.68) trades a bit more false-positive risk for catching more true
 * matches — retune independently of `HEAD_FALLBACK_THRESHOLD` below, the two
 * compare different things and don't need to move together. */
export const NAME_FALLBACK_THRESHOLD = 0.60;
/** Threshold for the sub-head→head suggester (comparing a new sub-head name
 * against other sub-head names already in the registry). Split out
 * 2026-07-11 from `NAME_FALLBACK_THRESHOLD` so the two can be tuned
 * independently — name-vs-name and title-vs-name are different comparisons
 * with potentially different noise floors. Starts equal to
 * `NAME_FALLBACK_THRESHOLD` (0.60); retune this one on its own evidence. */
export const HEAD_FALLBACK_THRESHOLD = 0.60;
const TOP_K = 5;

export type Suggestion =
  | { kind: "existing"; activity: string; confidence: number }
  | { kind: "new"; confidence: number } 
  | { kind: "none" };

export type HeadSuggestion =
  | { kind: "existing"; head: string; confidence: number }
  | { kind: "new"; confidence: number }
  | { kind: "none" };

function cosine(a: Float32Array, b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Ensures every current activity name has a cached embedding; embeds any missing ones. */
async function ensureNameVectors(activities: string[]): Promise<Record<string, number[]>> {
  const cache = loadNameVectors();
  for (const a of activities) {
    if (!cache[a]) {
      try {
        const v = await embed(a);
        cache[a] = Array.from(v);
        saveNameVector(a, cache[a]);
      } catch {
        // ML unavailable — leave this name unembedded; fallback path handles it.
      }
    }
  }
  return cache;
}

/** Suggests a sub-head for `title`. `knownActivities` is the current registry
 * (used only for the cold-start name-fallback, and to ignore stale corpus
 * entries for activities that were since deleted). */
export async function suggestSubhead(title: string, knownActivities: string[]): Promise<Suggestion> {
  const t = title.trim();
  if (t.length < 3) return { kind: "none" };

  let vector: Float32Array;
  try {
    vector = await embed(t);
  } catch {
    return { kind: "none" }; // ML unavailable — silent degrade, never blocks entry
  }

  // 1) kNN vote over past titles (weighted by similarity), scoped to activities
  // that still exist in the registry.
  const corpus = loadTitleCorpus().filter((e) => knownActivities.includes(e.activity));
  if (corpus.length > 0) {
    const scored = corpus
      .map((e) => ({ ...e, sim: cosine(vector, e.vector) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, TOP_K);
    const votes = new Map<string, { score: number; best: number }>();
    for (const s of scored) {
      const cur = votes.get(s.activity) ?? { score: 0, best: 0 };
      votes.set(s.activity, { score: cur.score + s.sim, best: Math.max(cur.best, s.sim) });
    }
    const winner = [...votes.entries()].sort((a, b) => b[1].score - a[1].score)[0];
    if (winner && winner[1].best >= CONFIDENCE_THRESHOLD) {
      return { kind: "existing", activity: winner[0], confidence: winner[1].best };
    }
  }

  // 2) Cold-start fallback: compare against sub-head NAME embeddings. Iterate only
  // the CURRENT registry activities, never the whole cache — the name-vector cache
  // is not pruned on delete, so a deleted sub-head (e.g. "cycling") lingers there and
  // would otherwise self-match at ~1.0 and be wrongly returned as an existing pick.
  const nameVectors = await ensureNameVectors(knownActivities);
  let bestName: string | null = null;
  let bestSim = 0;
  for (const name of knownActivities) {
    const v = nameVectors[name];
    if (!v) continue;
    const sim = cosine(vector, v);
    if (sim > bestSim) { bestSim = sim; bestName = name; }
  }
  if (bestName && bestSim >= NAME_FALLBACK_THRESHOLD) {
    return { kind: "existing", activity: bestName, confidence: bestSim };
  }

  // 3) Nothing confident — explicitly labeled as a NEW sub-head suggestion,
  // never as an existing-list pick (the whole point of the grilled rule).
  return { kind: "new", confidence: bestSim };
}

/** Suggests a head for a brand-new sub-head name, config-screen cold-start
 * fallback (SPEC §7.0.1's "same duality applies to the sub-head → head
 * suggester"). No separate corpus needed: every sub-head already in the
 * registry, plus the head it lives under, IS the training data — kNN vote
 * over the existing sub-head-NAME embeddings (same cache `suggestSubhead`
 * warms), weighted by similarity to the new name. Empty registry or nothing
 * confident → `"new"`, never a disguised existing-head pick. */
export async function suggestHeadForSubhead(
  subheadName: string,
  registry: Record<string, string[]>,
): Promise<HeadSuggestion> {
  const t = subheadName.trim();
  if (t.length < 3) return { kind: "none" };

  const known = Object.entries(registry).flatMap(([head, activities]) =>
    activities.map((activity) => ({ head, activity })),
  );
  if (known.length === 0) return { kind: "new", confidence: 0 };

  let vector: Float32Array;
  try {
    vector = await embed(t);
  } catch {
    return { kind: "none" }; // ML unavailable — silent degrade, never blocks entry
  }

  const nameVectors = await ensureNameVectors(known.map((k) => k.activity));
  const scored = known
    .map((k) => {
      const v = nameVectors[k.activity];
      return { ...k, sim: v ? cosine(vector, v) : 0 };
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, TOP_K);
  const votes = new Map<string, { score: number; best: number }>();
  for (const s of scored) {
    const cur = votes.get(s.head) ?? { score: 0, best: 0 };
    votes.set(s.head, { score: cur.score + s.sim, best: Math.max(cur.best, s.sim) });
  }
  const winner = [...votes.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  if (winner && winner[1].best >= HEAD_FALLBACK_THRESHOLD) {
    return { kind: "existing", head: winner[0], confidence: winner[1].best };
  }
  return { kind: "new", confidence: winner?.[1].best ?? 0 };
}

/** Records a resolved title→activity pair for future suggestions. Call this
 * on task creation regardless of whether the pairing came from a suggestion
 * or manual entry — the corpus only grows richer over time. Fire-and-forget;
 * never blocks or throws into the caller. */
export function recordTitleActivity(title: string, activity: string): void {
  const t = title.trim();
  const a = activity.trim();
  if (!t || !a) return;
  embed(t)
    .then((v) => addTitleEntry({ title: t, activity: a, vector: Array.from(v) }))
    .catch(() => { /* ML unavailable — skip recording this one, non-fatal */ });
}
