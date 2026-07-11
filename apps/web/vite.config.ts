import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// COOP/COEP: required for SQLite-wasm OPFS (SharedArrayBuffer isolation).
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// transformers.js probes OPTIONAL model files (e.g. added_tokens.json) that many
// repos don't ship. On a real static host a missing file 404s and the library
// ignores it; but Vite's dev/preview SPA fallback answers 200 + index.html, which
// the library then tries to JSON.parse ("Unexpected token '<'") and the whole model
// load fails. This guard returns a real 404 for missing files under /models/ so the
// probes degrade gracefully — matching production static-hosting behavior.
function modelFile404(): PluginOption {
  const guard = (rootDir: string) => (req: { url?: string }, res: { statusCode: number; end: (s?: string) => void }, next: () => void) => {
    const url = (req.url ?? "").split("?")[0];
    if (url.startsWith("/models/") && !fs.existsSync(path.join(rootDir, decodeURIComponent(url)))) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    next();
  };
  return {
    name: "model-file-404",
    configureServer(server) {
      server.middlewares.use(guard(server.config.publicDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(guard(server.config.build.outDir));
    },
  };
}

export default defineConfig({
  plugins: [react(), modelFile404()],
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
