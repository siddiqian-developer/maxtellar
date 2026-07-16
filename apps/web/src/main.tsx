import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { boot } from "./useStore";
import { SettingsProvider } from "./settings";
import { HeadsProvider } from "./heads";
import "./theme.css";

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
