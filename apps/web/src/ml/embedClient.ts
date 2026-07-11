/**
 * Main-thread client for the embedding worker (SPEC §7.0.1). Lazy-starts the
 * worker on first call, never blocks the UI thread. Never load-bearing: any
 * failure (no network on first-ever model download, WASM/WebGPU unsupported,
 * worker error) rejects the promise — callers must treat that as "no
 * suggestion available" and degrade silently, never surface an error to the
 * user for this feature.
 */

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: unknown) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./embedWorker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; vector?: number[]; error?: string }>) => {
    const { id, vector, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(new Float32Array(vector!));
  };
  worker.onerror = (e) => {
    for (const [, p] of pending) p.reject(e);
    pending.clear();
  };
  return worker;
}

/** Embeds `text`; rejects on any failure (see file header — never load-bearing). */
export function embed(text: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, text });
  });
}
