/** §7.0.1 suggester: the retrieval paths are scoped to the CURRENT registry, so
 * a deleted sub-head never resurfaces as an "existing" pick — it must come back
 * as "suggested new". `embed` is mocked with a deterministic one-hot so identical
 * strings score cosine 1.0 and distinct strings 0.0, making thresholds crisp. */
import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("./embedClient", () => {
  const idx = new Map<string, number>();
  const oneHot = (t: string): Float32Array => {
    const s = t.trim();
    if (!idx.has(s)) idx.set(s, idx.size);
    const v = new Float32Array(64);
    v[idx.get(s)!] = 1;
    return v;
  };
  return { embed: (t: string) => Promise.resolve(oneHot(t)) };
});

import { embed } from "./embedClient";
import { suggestSubhead } from "./suggest";
import { addTitleEntry } from "./vectorStore";

function installLocalStorage(): void {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  globalThis.localStorage = mock as unknown as Storage;
}

async function corpusEntry(title: string, activity: string): Promise<void> {
  addTitleEntry({ title, activity, vector: Array.from(await embed(title)) });
}

beforeEach(() => installLocalStorage());

describe("suggestSubhead", () => {
  it("returns 'none' for titles shorter than 3 chars", async () => {
    expect((await suggestSubhead("ab", ["Cycling"])).kind).toBe("none");
  });

  it("suggests an existing sub-head when a past title matches and it's still in the registry", async () => {
    await corpusEntry("morning ride", "Cycling");
    const s = await suggestSubhead("morning ride", ["Cycling"]);
    expect(s.kind).toBe("existing");
    if (s.kind === "existing") expect(s.activity).toBe("Cycling");
  });

  it("does NOT resurrect a deleted sub-head from the title corpus (activity no longer in registry)", async () => {
    await corpusEntry("morning ride", "Cycling"); // pairing lingers in the corpus
    // "Cycling" was deleted → not in knownActivities:
    expect((await suggestSubhead("morning ride", [])).kind).toBe("new");
  });

  it("does NOT resurrect a deleted sub-head from the name-vector cache", async () => {
    // First call (while "cycling" exists) caches its name vector and matches it.
    const first = await suggestSubhead("cycling", ["cycling"]);
    expect(first.kind).toBe("existing");
    // After deletion the cached "cycling" vector lingers, but the lookup is scoped
    // to the current registry, so it's ignored → "new", not "existing".
    expect((await suggestSubhead("cycling", [])).kind).toBe("new");
  });

  it("returns 'new' when nothing is confident", async () => {
    const s = await suggestSubhead("something entirely unrelated", ["Cycling"]);
    expect(s.kind).toBe("new");
  });
});
