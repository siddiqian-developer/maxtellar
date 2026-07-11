/**
 * App-wide settings (SPEC VI, Part VI "Time formats"): currently just the
 * 12h/24h clock format, applied everywhere a wall-clock time is displayed
 * (global clock, timeline ticks, pipeline cards). Persisted to localStorage;
 * extend this context as more settings are added rather than threading new
 * per-component props.
 */

import { createContext, useContext, useEffect, useState } from "react";

export type TimeFormat = "12h" | "24h";

interface Settings {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
  /** Dev sandbox (§7): testing affordances — e.g. speed-up on the running
   * task. Never changes scheduler semantics, only exposes extra controls. */
  devSandbox: boolean;
  setDevSandbox: (v: boolean) => void;
}

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() => {
    const stored = localStorage.getItem("timeFormat");
    return stored === "24h" || stored === "12h" ? stored : "12h";
  });
  const [devSandbox, setDevSandbox] = useState<boolean>(() => localStorage.getItem("devSandbox") === "1");

  useEffect(() => {
    localStorage.setItem("timeFormat", timeFormat);
  }, [timeFormat]);
  useEffect(() => {
    localStorage.setItem("devSandbox", devSandbox ? "1" : "0");
  }, [devSandbox]);

  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat, devSandbox, setDevSandbox }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
