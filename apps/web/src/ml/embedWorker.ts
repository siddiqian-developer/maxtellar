/**
 * Embedding worker (SPEC §7.0.1): loads a small on-device sentence-embedding
 * model (bge-small-en-v1.5, quantized ~34MB) via transformers.js (the
 * actively-maintained @huggingface/transformers v3, NOT the archived
 * @xenova/transformers v2 — v2's bundled onnxruntime-web broke under Vite's
 * worker dependency pre-bundling: "Cannot read properties of undefined
 * (reading 'registerBackend')" — v3 ships a bundler-friendly build that
 * doesn't hit this) and embeds text on request. WebGPU is used when
 * available; falls back to WASM on CPU automatically — no GPU required.
 * Never blocks the main thread; never load-bearing (the caller must
 * tolerate this worker failing or never responding).
 *
 * Model files are self-hosted under `public/models/` (same-origin), NOT
 * fetched from the HuggingFace CDN at runtime: (1) satisfies "100% local &
 * offline" literally — no network needed even on first run; (2) sidesteps
 * the page's COEP: require-corp header (added for SQLite-wasm OPFS), which
 * would otherwise block a cross-origin fetch to a CDN that sends no
 * Cross-Origin-Resource-Policy header.
 */

import { pipeline, env } from "@huggingface/transformers";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";

type Req = { id: number; text: string };
type Res = { id: number; vector: number[] } | { id: number; error: string };

// transformers.js pipelines are callable proxies whose exact TS shape varies
// by task; typed loosely here since this worker is an isolated, internal
// boundary (never exposed as a public API) — the payload contract with the
// main thread (Req/Res above) is what matters and is fully typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loading: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExtractor(): Promise<any> {
  if (extractor) return extractor;
  if (!loading) {
    // dtype "q8" is the default for the wasm device anyway (maps to the
    // "_quantized" file suffix we already have locally) — set explicitly so
    // this doesn't silently change if the library's default ever does.
    loading = pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" });
  }
  extractor = await loading;
  return extractor;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, text } = e.data;
  try {
    const model = await getExtractor();
    const output = await model(text, { pooling: "mean", normalize: true });
    const vector = Array.from(output.data as Float32Array);
    (self.postMessage as (msg: Res) => void)({ id, vector });
  } catch (err) {
    (self.postMessage as (msg: Res) => void)({ id, error: String(err) });
  }
};
