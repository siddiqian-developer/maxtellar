/**
 * App-wide settings (SPEC VI, Part VI "Time formats"): currently just the
 * 12h/24h clock format, applied everywhere a wall-clock time is displayed
 * (global clock, timeline ticks, pipeline cards). Persisted to localStorage;
 * extend this context as more settings are added rather than threading new
 * per-component props.
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { TimingType } from "@maxtellar/core";

export type TimeFormat = "12h" | "24h";

/** §2.9 preset ids whose default timing type is user-configurable. */
export type PresetId = "sleep" | "nap" | "food";
export type PresetDefaults = Record<PresetId, TimingType>;
const PRESET_DEFAULTS_FALLBACK: PresetDefaults = {
  sleep: "budgeted",
  nap: "unscheduled",
  food: "budgeted",
};
const ALL_TIMINGS: TimingType[] = ["unscheduled", "budgeted", "semi-head", "semi-tail", "fixed"];

/** Timeline ruler graduation between the labelled hours. 0 = off (default);
 * otherwise the minor-tick interval in minutes. */
export type GridGranularity = 0 | 5 | 10 | 15 | 30;
const GRID_VALUES: GridGranularity[] = [0, 5, 10, 15, 30];

interface Settings {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
  /** Timeline sub-hour graduation marks; 0 = don't show (default). */
  gridGranularity: GridGranularity;
  setGridGranularity: (g: GridGranularity) => void;
  /** Dev sandbox (§7): testing affordances — e.g. the topbar dev clock that
   * ticks/fast-forwards logical `now`. Never changes scheduler semantics,
   * only exposes extra controls. */
  devSandbox: boolean;
  setDevSandbox: (v: boolean) => void;
  /** §2.9 configurable default timing type per preset pill. */
  presetDefaults: PresetDefaults;
  setPresetDefault: (id: PresetId, timing: TimingType) => void;
}

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() => {
    const stored = localStorage.getItem("timeFormat");
    return stored === "24h" || stored === "12h" ? stored : "12h";
  });
  const [gridGranularity, setGridGranularity] = useState<GridGranularity>(() => {
    const stored = Number(localStorage.getItem("gridGranularity"));
    return (GRID_VALUES as number[]).includes(stored) ? (stored as GridGranularity) : 0;
  });
  const [devSandbox, setDevSandbox] = useState<boolean>(() => localStorage.getItem("devSandbox") === "1");
  const [presetDefaults, setPresetDefaults] = useState<PresetDefaults>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("presetDefaults") ?? "null");
      if (stored && typeof stored === "object") {
        const valid = (t: unknown): t is TimingType => ALL_TIMINGS.includes(t as TimingType);
        return {
          sleep: valid(stored.sleep) ? stored.sleep : PRESET_DEFAULTS_FALLBACK.sleep,
          nap: valid(stored.nap) ? stored.nap : PRESET_DEFAULTS_FALLBACK.nap,
          food: valid(stored.food) ? stored.food : PRESET_DEFAULTS_FALLBACK.food,
        };
      }
    } catch {
      // fall through to fallback
    }
    return PRESET_DEFAULTS_FALLBACK;
  });
  const setPresetDefault = (id: PresetId, timing: TimingType): void =>
    setPresetDefaults((d) => ({ ...d, [id]: timing }));

  useEffect(() => {
    localStorage.setItem("timeFormat", timeFormat);
  }, [timeFormat]);
  useEffect(() => {
    localStorage.setItem("gridGranularity", String(gridGranularity));
  }, [gridGranularity]);
  useEffect(() => {
    localStorage.setItem("devSandbox", devSandbox ? "1" : "0");
  }, [devSandbox]);
  useEffect(() => {
    localStorage.setItem("presetDefaults", JSON.stringify(presetDefaults));
  }, [presetDefaults]);
  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat, gridGranularity, setGridGranularity, devSandbox, setDevSandbox, presetDefaults, setPresetDefault }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
