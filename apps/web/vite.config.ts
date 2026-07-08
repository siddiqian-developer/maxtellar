import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// COOP/COEP: required for SQLite-wasm OPFS (SharedArrayBuffer isolation).
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
});
