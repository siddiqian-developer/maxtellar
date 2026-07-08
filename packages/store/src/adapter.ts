/**
 * StorageAdapter (§7.2) — the seam between the event-sourced domain and any
 * physical storage. Web: SQLite-wasm (OPFS). Tests: memory. Mobile later:
 * expo-sqlite. Cloud offload later: export log segments through this interface.
 */

import type { Event } from "@timekeeper/core";

export interface StoredEvent {
  /** monotonically increasing sequence (assigned by the adapter on append) */
  seq: number;
  /** wall-clock ms at append (audit only — domain time lives in the event) */
  at: number;
  event: Event;
}

export interface Snapshot {
  /** the seq of the last event folded into this snapshot */
  uptoSeq: number;
  stateJson: string;
}

export interface StorageAdapter {
  /** Append one event; returns its assigned seq. Append-only, never mutates. */
  append(event: Event): Promise<number>;
  /** All events with seq > afterSeq, in order. */
  eventsAfter(afterSeq: number): Promise<StoredEvent[]>;
  /** Persist a snapshot (replaces any previous one). */
  saveSnapshot(snap: Snapshot): Promise<void>;
  /** Latest snapshot, if any. */
  loadSnapshot(): Promise<Snapshot | null>;
  /** Total number of events (diagnostics). */
  count(): Promise<number>;
  close(): Promise<void>;
}
