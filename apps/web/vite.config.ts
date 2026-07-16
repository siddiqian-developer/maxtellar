import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
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

// §7.2 "Vite PWA" + §5.3 (installed-PWA alarms need an installable app). Adopted
// vite-plugin-pwa 2026-07-16 per the §7.0.4 buy-first rule — see specs/07-engineering.md.
// Two app-specific constraints shape this config:
//  1. public/models/ is ~34MB of ML weights — precaching them would make the very
//     first visit download the lot. They are runtime-cached (CacheFirst) instead, so
//     they land in the cache only once actually used, and then work offline.
//  2. The SPA navigation fallback must NOT answer /models/ probes with index.html:
//     transformers.js probes optional model files, and an index.html body fails its
//     JSON.parse and kills the model load. Same trap `modelFile404()` guards in dev.
function pwa(): PluginOption[] {
  return VitePWA({
    registerType: "prompt", // never reload out from under a running day; applies on next natural load
    includeAssets: ["favicon.svg", "apple-touch-icon.png"],
    manifest: {
      name: "maxtellar",
      short_name: "maxtellar",
      description: "An opinionated time-management app: one living plan, settled continuously.",
      theme_color: "#2f6d68", // --accent (petrol teal)
      background_color: "#faf9f5", // --paper
      display: "standalone",
      orientation: "portrait-primary",
      start_url: "/",
      scope: "/",
      icons: [
        { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
        { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      globIgnores: ["**/models/**"], // (1)
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // the wasm/onnx runtime chunks
      navigateFallbackDenylist: [/^\/models\//], // (2)
      runtimeCaching: [
        {
          urlPattern: /\/models\/.*/,
          handler: "CacheFirst",
          options: {
            cacheName: "maxtellar-models",
            expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 90 },
            cacheableResponse: { statuses: [200] }, // never cache the optional-file 404s
          },
        },
        {
          // The onnxruntime wasm is ~23MB — over the precache ceiling above, so it is
          // cached the same way: on first real use, and offline-available thereafter.
          urlPattern: /\.wasm$/,
          handler: "CacheFirst",
          options: {
            cacheName: "maxtellar-wasm",
            expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
            cacheableResponse: { statuses: [200] },
          },
        },
      ],
    },
    devOptions: { enabled: false }, // dev keeps the plain server (COOP/COEP + model-404 guard)
  }) as PluginOption[];
}

export default defineConfig({
  plugins: [react(), modelFile404(), pwa()],
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
