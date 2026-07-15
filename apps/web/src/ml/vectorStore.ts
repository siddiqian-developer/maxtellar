/**
 * Title→activity vector corpus (SPEC §7.0.1): purely derived data — never
 * backed up, recomputable from titles at any time. Persisted to localStorage
 * only as a cache; capped so it can't grow unbounded. Sub-head NAME vectors
 * (the cold-start fallback corpus) are cached separately and rebuilt whenever
 * the heads registry changes shape.
 */

export interface TitleEntry {
  title: string;
  activity: string;
  vector: number[];
}

/** §2.7 (G24): a past decomposition — a parent title and the subtasks it was
 * broken into — cached so a similar future task can be pre-broken-down. Purely
 * derived (recomputable from the event log); a cache, never a source of truth. */
export interface DecompEntry {
  title: string;
  vector: number[];
  children: { title: string; budget: number }[];
}

const TITLE_KEY = "mlTitleCorpus";
const NAME_KEY = "mlNameVectors";
const DECOMP_KEY = "mlDecompCorpus";
const MAX_ENTRIES = 1000;

export function loadDecompCorpus(): DecompEntry[] {
  try {
    const raw = localStorage.getItem(DECOMP_KEY);
    return raw ? (JSON.parse(raw) as DecompEntry[]) : [];
  } catch {
    return [];
  }
}

export function addDecompEntry(entry: DecompEntry): void {
  const corpus = loadDecompCorpus();
  // De-dup by (case-insensitive) title — a later breakdown of the same title
  // replaces the earlier one (most recent intent wins).
  const key = entry.title.trim().toLowerCase();
  const filtered = corpus.filter((e) => e.title.trim().toLowerCase() !== key);
  filtered.push(entry);
  const trimmed = filtered.length > MAX_ENTRIES ? filtered.slice(filtered.length - MAX_ENTRIES) : filtered;
  localStorage.setItem(DECOMP_KEY, JSON.stringify(trimmed));
}

export function loadTitleCorpus(): TitleEntry[] {
  try {
    const raw = localStorage.getItem(TITLE_KEY);
    return raw ? (JSON.parse(raw) as TitleEntry[]) : [];
  } catch {
    return [];
  }
}

export function addTitleEntry(entry: TitleEntry): void {
  const corpus = loadTitleCorpus();
  corpus.push(entry);
  // Cap by dropping the oldest — recency is a reasonable proxy for relevance
  // and this is a cache, not the source of truth (the event log is).
  const trimmed = corpus.length > MAX_ENTRIES ? corpus.slice(corpus.length - MAX_ENTRIES) : corpus;
  localStorage.setItem(TITLE_KEY, JSON.stringify(trimmed));
}

export function loadNameVectors(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(NAME_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

export function saveNameVector(name: string, vector: number[]): void {
  const map = loadNameVectors();
  map[name] = vector;
  localStorage.setItem(NAME_KEY, JSON.stringify(map));
}

/** Drops all title-corpus entries paired with `activity`, and its cached name
 * vector. Called when a sub-head is deleted — deletion means "forget these
 * title→sub-head pairings" (§7.0.1), so a later same-name re-create starts clean
 * instead of resurrecting the old training. No-op if nothing matches. */
export function forgetActivity(activity: string): void {
  const a = activity.trim();
  if (!a) return;
  const corpus = loadTitleCorpus();
  const kept = corpus.filter((e) => e.activity !== a);
  if (kept.length !== corpus.length) localStorage.setItem(TITLE_KEY, JSON.stringify(kept));
  const map = loadNameVectors();
  if (a in map) {
    delete map[a];
    localStorage.setItem(NAME_KEY, JSON.stringify(map));
  }
}

/** Re-labels every title-corpus entry paired with `from` to `to`, and drops
 * `from`'s now-orphaned name vector (`to`'s is rebuilt lazily by
 * `ensureNameVectors`). Called on reassign-on-delete (§7.0.1): a genuine *move*
 * of a sub-head's tasks carries its title→sub-head training to the destination,
 * rather than forgetting it as a plain delete would. No-op if `from === to`. */
export function rehomeActivity(from: string, to: string): void {
  const f = from.trim();
  const t = to.trim();
  if (!f || !t || f === t) return;
  const corpus = loadTitleCorpus();
  let changed = false;
  const next = corpus.map((e) => (e.activity === f ? ((changed = true), { ...e, activity: t }) : e));
  if (changed) localStorage.setItem(TITLE_KEY, JSON.stringify(next));
  const map = loadNameVectors();
  if (f in map) {
    delete map[f];
    localStorage.setItem(NAME_KEY, JSON.stringify(map));
  }
}
