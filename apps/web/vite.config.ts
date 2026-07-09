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
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
});
