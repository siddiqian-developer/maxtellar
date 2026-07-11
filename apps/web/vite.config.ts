import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// COOP/COEP: required for SQLite-wasm OPFS (SharedArrayBuffer isolation).
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: {
    headers: isolationHeaders,
    // WSL: /mnt/d is a Windows drive — inotify events don't propagate, poll instead.
    watch: { usePolling: true, interval: 300 },
  },
  preview: { headers: isolationHeaders },
  optimizeDeps: {
    // @xenova/transformers (v2, archived) + its bundled onnxruntime-web broke
    // under Vite's worker dependency pre-bundling: "Cannot read properties of
    // undefined (reading 'registerBackend')". Switched to @huggingface/
    // transformers (the actively-maintained v3 successor, bundler-friendly).
    // Keeping both excluded here is defensive, not load-bearing for the fix.
    exclude: ["@sqlite.org/sqlite-wasm", "@huggingface/transformers", "onnxruntime-web"],
  },
  worker: {
    format: "es",
  },
});
