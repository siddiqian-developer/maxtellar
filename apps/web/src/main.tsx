import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { boot } from "./useStore";
import "./theme.css";

void boot();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
