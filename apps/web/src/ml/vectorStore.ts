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

const TITLE_KEY = "mlTitleCorpus";
const NAME_KEY = "mlNameVectors";
const MAX_ENTRIES = 1000;

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
