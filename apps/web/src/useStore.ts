/**
 * The live bridge: EventStore (persistence) + tick engine + Zustand (UI state).
 * Every mutation flows through dispatch() — one sequential reducer (E5).
 * Tick: minute-aligned interval + visibilitychange batch catch-up (R11).
 */

import { create } from "zustand";
import type { Event, State } from "@timekeeper/core";
import { EventStore, MemoryAdapter, SqliteAdapter, type StorageAdapter } from "@timekeeper/store";
import { nowMin } from "./time";

interface UiStore {
  ready: boolean;
  persistent: boolean; // false = memory fallback (warn in UI)
  state: State | null;
  dispatch: (e: Event) => Promise<void>;
  error: string | null;
}

let eventStore: EventStore | null = null;

export const useStore = create<UiStore>((set) => ({
  ready: false,
  persistent: false,
  state: null,
  error: null,
  dispatch: async (e: Event) => {
    if (!eventStore) return;
    try {
      const next = await eventStore.dispatch(e);
      set({ state: next, error: null });
    } catch (err) {
      // Sandbox principle: a throwing event changed nothing; surface and move on.
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
}));

async function openAdapter(): Promise<{ adapter: StorageAdapter; persistent: boolean }> {
  try {
    const adapter = await SqliteAdapter.open();
    return { adapter, persistent: true };
  } catch {
    return { adapter: new MemoryAdapter(), persistent: false };
  }
}

export async function boot(): Promise<void> {
  const { adapter, persistent } = await openAdapter();
  eventStore = await EventStore.hydrate(adapter, nowMin());
  // catch-up to the real minute (app may have been closed for hours — one batch)
  await eventStore.dispatch({ type: "TICK", to: nowMin() });
  useStore.setState({ ready: true, persistent, state: eventStore.current });

  const tick = async (): Promise<void> => {
    if (!eventStore) return;
    const target = nowMin();
    if (target > eventStore.current.now) {
      const next = await eventStore.dispatch({ type: "TICK", to: target });
      useStore.setState({ state: next });
    }
  };

  // minute-aligned interval
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), 60000);
  }, msToNextMinute + 250);

  // batch catch-up when the tab wakes
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tick();
  });
}
