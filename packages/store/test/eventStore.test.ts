import { describe, it, expect } from "vitest";
import type { Event } from "@timekeeper/core";
import { EventStore } from "../src/eventStore.js";
import { MemoryAdapter } from "../src/memory.js";

const T = (h: number, m: number): number => h * 60 + m;

const create = (id: string, budget: number): Event => ({
  type: "CREATE_TASK",
  task: {
    id,
    title: id,
    headId: "h",
    activityId: "a",
    tier: "normal",
    timing: "budgeted",
    ommf: false,
    slideable: true,
    breakable: true,
    budget,
  } as never,
});

describe("EventStore", () => {
  it("append → rehydrate reproduces identical state (event-sourcing)", async () => {
    const adapter = new MemoryAdapter();
    const store = await EventStore.hydrate(adapter, T(9, 0));
    await store.dispatch(create("A", 30));
    await store.dispatch(create("B", 45));
    await store.dispatch({ type: "START_TASK", taskId: "A" });
    await store.dispatch({ type: "TICK", to: T(9, 20) });
    const live = JSON.stringify(store.current);

    const rehydrated = await EventStore.hydrate(adapter, T(0, 0)); // bootNow ignored (log wins)
    expect(JSON.stringify(rehydrated.current)).toBe(live);
  });

  it("snapshots bound replay: state identical when hydrating past a snapshot", async () => {
    const adapter = new MemoryAdapter();
    const store = await EventStore.hydrate(adapter, T(9, 0), { snapshotEvery: 3 });
    await store.dispatch(create("A", 30));
    await store.dispatch(create("B", 45));
    await store.dispatch({ type: "START_TASK", taskId: "A" }); // snapshot fires here
    await store.dispatch({ type: "TICK", to: T(9, 10) }); // tail after snapshot
    const live = JSON.stringify(store.current);

    expect(await adapter.loadSnapshot()).not.toBeNull();
    const rehydrated = await EventStore.hydrate(adapter, T(0, 0), { snapshotEvery: 3 });
    expect(JSON.stringify(rehydrated.current)).toBe(live);
  });

  it("a throwing event persists NOTHING (sandbox principle)", async () => {
    const adapter = new MemoryAdapter();
    const store = await EventStore.hydrate(adapter, T(9, 0));
    const bad: Event = {
      type: "BACKLOG",
      entry: {
        taskId: null,
        title: "x",
        headId: "h",
        activityId: "a",
        kind: "occupancy",
        start: T(7, 0),
        end: T(8, 0),
        outcome: "completed",
        channels: { spent: 60, wasted: 0, managed: 0, breaks: 0 },
      },
    };
    await store.dispatch(bad); // first is fine
    await expect(store.dispatch(bad)).rejects.toThrow(/overlap/); // second overlaps
    // seed TICK + one good BACKLOG = 2; the throwing event was never appended
    expect(await adapter.count()).toBe(2);
  });
});
