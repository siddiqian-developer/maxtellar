import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { boot } from "./useStore";
import { SettingsProvider } from "./settings";
import { HeadsProvider } from "./heads";
import "./theme.css";

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
