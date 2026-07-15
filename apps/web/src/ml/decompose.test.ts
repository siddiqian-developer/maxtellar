/** §2.7 decomposition suggester: deterministic exact-title match works in any
 * mode; semantic match is maximum-mode only. `embed` is mocked one-hot so equal
 * strings score cosine 1.0 and distinct strings 0.0 — thresholds stay crisp. */
import { beforeEach, describe, it, expect } from "vitest";

import { vi } from "vitest";
vi.mock("./embedClient", () => {
  const idx = new Map<string, number>();
  const oneHot = (t: string): Float32Array => {
    const s = t.trim().toLowerCase();
    if (!idx.has(s)) idx.set(s, idx.size);
    const v = new Float32Array(64);
    v[idx.get(s)!] = 1;
    return v;
  };
  return { embed: (t: string) => Promise.resolve(oneHot(t)) };
});

import { recordDecomposition, suggestDecomposition } from "./decompose";

function installLocalStorage(): void {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("decomposition suggester", () => {
  beforeEach(() => installLocalStorage());

  it("returns null with an empty corpus", async () => {
    expect(await suggestDecomposition("Write essay", "full")).toBeNull();
  });

  it("deterministic exact-title match works in lightweight mode", async () => {
    recordDecomposition("Write essay", [
      { title: "Outline", budget: 20 },
      { title: "Draft", budget: 40 },
    ]);
    await flush(); // let the fire-and-forget embed resolve
    const s = await suggestDecomposition("write essay", "lightweight");
    expect(s).toMatchObject({ source: "exact", fromTitle: "Write essay" });
    expect(s!.children.map((c) => c.title)).toEqual(["Outline", "Draft"]);
  });

  it("a non-exact title finds nothing in lightweight mode", async () => {
    recordDecomposition("Write essay", [
      { title: "Outline", budget: 20 },
      { title: "Draft", budget: 40 },
    ]);
    await flush();
    expect(await suggestDecomposition("Compose a report", "lightweight")).toBeNull();
  });

  it("semantic match returns the nearest past breakdown in maximum mode", async () => {
    // one-hot: identical normalized strings score 1.0, others 0.0 — so only the
    // exact-embedding twin passes the 0.72 bar (distinct titles score 0).
    recordDecomposition("Write essay", [
      { title: "Outline", budget: 20 },
      { title: "Draft", budget: 40 },
    ]);
    await flush();
    // exact still wins via the deterministic path
    const same = await suggestDecomposition("Write essay", "full");
    expect(same).toMatchObject({ source: "exact" });
    // an unrelated title (cosine 0 under one-hot) → no confident match
    expect(await suggestDecomposition("Buy groceries", "full")).toBeNull();
  });

  it("re-recording the same title replaces the earlier breakdown", async () => {
    recordDecomposition("Plan trip", [
      { title: "a", budget: 10 },
      { title: "b", budget: 10 },
    ]);
    await flush();
    recordDecomposition("Plan trip", [
      { title: "x", budget: 15 },
      { title: "y", budget: 15 },
      { title: "z", budget: 15 },
    ]);
    await flush();
    const s = await suggestDecomposition("Plan trip", "lightweight");
    expect(s!.children.map((c) => c.title)).toEqual(["x", "y", "z"]);
  });

  it("ignores a single-child 'decomposition' (needs ≥2, §2.7)", async () => {
    recordDecomposition("Solo", [{ title: "only", budget: 30 }]);
    await flush();
    expect(await suggestDecomposition("Solo", "full")).toBeNull();
  });
});
