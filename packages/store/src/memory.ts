import type { Event } from "@maxtellar/core";
import type { Snapshot, StorageAdapter, StoredEvent } from "./adapter.js";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** In-memory adapter — tests and SSR fallback. */
export class MemoryAdapter implements StorageAdapter {
  private events: StoredEvent[] = [];
  private snapshot: Snapshot | null = null;

  async append(event: Event): Promise<number> {
    const seq = this.events.length + 1;
    this.events.push({ seq, at: Date.now(), event: clone(event) });
    return seq;
  }

  async eventsAfter(afterSeq: number): Promise<StoredEvent[]> {
    return this.events.filter((e) => e.seq > afterSeq).map((e) => clone(e));
  }

  async saveSnapshot(snap: Snapshot): Promise<void> {
    this.snapshot = { ...snap };
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    return this.snapshot ? { ...this.snapshot } : null;
  }

  async count(): Promise<number> {
    return this.events.length;
  }

  async close(): Promise<void> {
    /* nothing */
  }
}
