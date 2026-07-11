/**
 * SQLite-wasm adapter (OPFS-backed) — the web's durable store (§7.2).
 * Dynamically imported so Node test runs never load the wasm bundle.
 * Requires COOP/COEP headers (configured in the web app's vite config).
 */

import type { Event } from "@maxtellar/core";
import type { Snapshot, StorageAdapter, StoredEvent } from "./adapter.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  seq   INTEGER PRIMARY KEY AUTOINCREMENT,
  at    INTEGER NOT NULL,
  json  TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  upto_seq  INTEGER NOT NULL,
  state     TEXT    NOT NULL
);
`;

// Minimal structural types for the sqlite-wasm surface we use.
interface SqliteDb {
  exec(opts: { sql: string; bind?: unknown[]; rowMode?: string; resultRows?: unknown[] }): unknown;
  close(): void;
}

export class SqliteAdapter implements StorageAdapter {
  private constructor(private db: SqliteDb) {}

  /** Open (and migrate) the OPFS database. Falls back to an in-memory VFS when
   *  OPFS is unavailable (e.g. non-isolated context) — caller may warn. */
  static async open(filename = "maxtellar.db"): Promise<SqliteAdapter> {
    const mod = await import("@sqlite.org/sqlite-wasm");
    const sqlite3 = await mod.default({ print: () => {}, printErr: () => {} });
    const hasOpfs = "opfs" in sqlite3;
    const db = (hasOpfs
      ? new sqlite3.oo1.OpfsDb(filename)
      : new sqlite3.oo1.DB(`:memory:`, "c")) as unknown as SqliteDb;
    db.exec({ sql: SCHEMA });
    return new SqliteAdapter(db);
  }

  async append(event: Event): Promise<number> {
    this.db.exec({
      sql: "INSERT INTO events (at, json) VALUES (?, ?)",
      bind: [Date.now(), JSON.stringify(event)],
    });
    const rows: unknown[] = [];
    this.db.exec({ sql: "SELECT last_insert_rowid()", rowMode: "array", resultRows: rows });
    return Number((rows[0] as unknown[])[0]);
  }

  async eventsAfter(afterSeq: number): Promise<StoredEvent[]> {
    const rows: unknown[] = [];
    this.db.exec({
      sql: "SELECT seq, at, json FROM events WHERE seq > ? ORDER BY seq",
      bind: [afterSeq],
      rowMode: "array",
      resultRows: rows,
    });
    return (rows as [number, number, string][]).map(([seq, at, json]) => ({
      seq,
      at,
      event: JSON.parse(json) as Event,
    }));
  }

  async saveSnapshot(snap: Snapshot): Promise<void> {
    this.db.exec({
      sql: `INSERT INTO snapshots (id, upto_seq, state) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET upto_seq = excluded.upto_seq, state = excluded.state`,
      bind: [snap.uptoSeq, snap.stateJson],
    });
  }

  async loadSnapshot(): Promise<Snapshot | null> {
    const rows: unknown[] = [];
    this.db.exec({
      sql: "SELECT upto_seq, state FROM snapshots WHERE id = 1",
      rowMode: "array",
      resultRows: rows,
    });
    if (rows.length === 0) return null;
    const [uptoSeq, stateJson] = rows[0] as [number, string];
    return { uptoSeq, stateJson };
  }

  async count(): Promise<number> {
    const rows: unknown[] = [];
    this.db.exec({ sql: "SELECT COUNT(*) FROM events", rowMode: "array", resultRows: rows });
    return Number((rows[0] as unknown[])[0]);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
