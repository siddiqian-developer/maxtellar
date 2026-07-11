/** §7.0.1 derived-store hygiene: deleting a sub-head forgets its title→sub-head
 * pairings; reassigning re-homes them. These exercise the localStorage-backed
 * corpus/name-cache directly (no embeddings needed). */
import { beforeEach, describe, it, expect } from "vitest";
import {
  addTitleEntry,
  loadTitleCorpus,
  loadNameVectors,
  saveNameVector,
  forgetActivity,
  rehomeActivity,
} from "./vectorStore";

/** Minimal in-memory localStorage for the node test environment (no jsdom). */
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

beforeEach(() => installLocalStorage());

describe("forgetActivity — deletion forgets a sub-head's pairings", () => {
  it("drops every corpus entry for the activity and its name vector, leaving others intact", () => {
    addTitleEntry({ title: "morning ride", activity: "Cycling", vector: [1, 0] });
    addTitleEntry({ title: "evening loop", activity: "Cycling", vector: [0, 1] });
    addTitleEntry({ title: "standup", activity: "Work", vector: [1, 1] });
    saveNameVector("Cycling", [1, 0]);
    saveNameVector("Work", [0, 1]);

    forgetActivity("Cycling");

    expect(loadTitleCorpus().map((e) => e.activity)).toEqual(["Work"]);
    expect("Cycling" in loadNameVectors()).toBe(false);
    expect("Work" in loadNameVectors()).toBe(true);
  });

  it("is a no-op when nothing matches", () => {
    addTitleEntry({ title: "standup", activity: "Work", vector: [1, 1] });
    forgetActivity("Cycling");
    expect(loadTitleCorpus()).toHaveLength(1);
  });
});

describe("rehomeActivity — reassign moves a sub-head's pairings to the target", () => {
  it("re-labels the activity's corpus entries and drops its now-orphaned name vector", () => {
    addTitleEntry({ title: "morning ride", activity: "Cycling", vector: [1, 0] });
    addTitleEntry({ title: "standup", activity: "Work", vector: [1, 1] });
    saveNameVector("Cycling", [1, 0]);

    rehomeActivity("Cycling", "Sports");

    expect(loadTitleCorpus().map((e) => e.activity).sort()).toEqual(["Sports", "Work"]);
    // Old name vector is dropped; the target's is rebuilt lazily elsewhere.
    expect("Cycling" in loadNameVectors()).toBe(false);
  });

  it("is a no-op when from === to", () => {
    addTitleEntry({ title: "morning ride", activity: "Cycling", vector: [1, 0] });
    rehomeActivity("Cycling", "Cycling");
    expect(loadTitleCorpus()[0].activity).toBe("Cycling");
  });
});
