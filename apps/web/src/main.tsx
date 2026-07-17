import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { boot } from "./useStore";
import { SettingsProvider } from "./settings";
import { HeadsProvider } from "./heads";
import "./theme.css";

// §11.1 head identity became a PATH (category + name, one encoded string) on
// 2026-07-17, with a fresh 7-category seed. Old-format stores (bare-name head
// registry + name-keyed ML corpora) are wiped wholesale rather than migrated —
// decided with the user 2026-07-17: the app re-seeds from the shipped defaults.
// Settings/theme survive (they carry no head names). Runs BEFORE any provider
// reads localStorage.
const REGISTRY_FORMAT_KEY = "registryFormat";
const REGISTRY_FORMAT = "path-v1";
if (localStorage.getItem(REGISTRY_FORMAT_KEY) !== REGISTRY_FORMAT) {
  for (const k of ["headsRegistry", "headCategories", "mlTitleCorpus", "mlNameVectors", "mlDecompCorpus"]) {
    localStorage.removeItem(k);
  }
  localStorage.setItem(REGISTRY_FORMAT_KEY, REGISTRY_FORMAT);
}

// §7.2/§5.3 PWA. registerType "prompt": the new build waits rather than reloading a
// live day out from under the user — it takes over on the next natural load (once
// every tab is closed). No update UI by design; there is nothing for the user to decide.
if (import.meta.env.PROD) {
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}

void boot();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsProvider>
      <HeadsProvider>
        <App />
      </HeadsProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
