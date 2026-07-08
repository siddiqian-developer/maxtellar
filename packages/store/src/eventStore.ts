/**
 * EventStore — hydrate/append/replay glue between the pure reducer and a
 * StorageAdapter. The reducer stays pure; THIS is the only place events are
 * persisted. Snapshots bound replay cost (R11: reopen = one batch, no
 * per-minute rendering).
 */

import { initialState, reduce, type Event, type Min, type State } from "@timekeeper/core";
import type { StorageAdapter } from "./adapter.js";

export interface EventStoreOptions {
  /** take a snapshot every N appended events (default 200) */
  snapshotEvery?: number;
}

export class EventStore {
  private state: State;
  private appendedSinceSnapshot = 0;
  private lastSeq = 0;

  private constructor(
    private adapter: StorageAdapter,
    state: State,
    lastSeq: number,
    private snapshotEvery: number,
  ) {
    this.state = state;
    this.lastSeq = lastSeq;
  }

  /** Load snapshot (if any), replay the tail of the log, return a live store. */
  static async hydrate(
    adapter: StorageAdapter,
    bootNow: Min,
    opts: EventStoreOptions = {},
  ): Promise<EventStore> {
    const snap = await adapter.loadSnapshot();
    let state: State;
    let from = 0;
    if (snap) {
      state = JSON.parse(snap.stateJson) as State;
      from = snap.uptoSeq;
    } else {
      // The log must FULLY determine state (event-sourcing): state always
      // starts from epoch 0, and the very first event of a fresh log is a
      // TICK to the boot instant. Replays are then boot-time independent.
      state = initialState(0);
      if ((await adapter.count()) === 0 && bootNow > 0) {
        await adapter.append({ type: "TICK", to: bootNow });
      }
    }
    const tail = await adapter.eventsAfter(from);
    for (const se of tail) state = reduce(state, se.event);
    const lastSeq = tail.length > 0 ? tail[tail.length - 1]!.seq : from;
    return new EventStore(adapter, state, lastSeq, opts.snapshotEvery ?? 200);
  }

  get current(): State {
    return this.state;
  }

  /** Apply + persist one event. The state change and the append are one unit:
   *  if reduce throws, nothing is persisted (sandbox principle, §3.12). */
  async dispatch(event: Event): Promise<State> {
    const next = reduce(this.state, event); // may throw → nothing persisted
    this.lastSeq = await this.adapter.append(event);
    this.state = next;
    if (++this.appendedSinceSnapshot >= this.snapshotEvery) {
      await this.adapter.saveSnapshot({
        uptoSeq: this.lastSeq,
        stateJson: JSON.stringify(this.state),
      });
      this.appendedSinceSnapshot = 0;
    }
    return next;
  }

  async close(): Promise<void> {
    await this.adapter.saveSnapshot({
      uptoSeq: this.lastSeq,
      stateJson: JSON.stringify(this.state),
    });
    await this.adapter.close();
  }
}
