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

/** §7.0.3 configurable compute intensity (the "ship both, let the client
 * choose" pattern). Two layers:
 *  - a GLOBAL quick switch: "maximum" (all features Full AI) vs "lightweight"
 *    (all Deterministic); "custom" when the per-feature detail diverges.
 *  - a per-FEATURE level for every AI-using feature (detailed screen).
 * AI is never load-bearing at any level — deterministic simply skips the model.
 * Default: everything Full AI. */
export type MlMode = "maximum" | "lightweight" | "custom";

/** Every feature that can use an on-device AI model. */
export type AiFeature = "subhead" | "head" | "decompose" | "timeParse";
/** Per-feature intensity: no model / model with a stricter, cheaper bar /
 * full-quality model. */
export type AiLevel = "deterministic" | "lightweight" | "full";
export type AiLevels = Record<AiFeature, AiLevel>;

export const AI_FEATURES: { id: AiFeature; label: string; desc: string }[] = [
  { id: "subhead", label: "Sub-head suggestion", desc: "Suggest a sub-head from your task title, learned from your own history." },
  { id: "head", label: "Head suggestion", desc: "Suggest which head a brand-new sub-head belongs under." },
  { id: "decompose", label: "Task breakdown", desc: "Offer the subtasks you used for a similar task before." },
  { id: "timeParse", label: "Casual time parsing", desc: "Interpret ambiguous time/duration text (deterministic grammar first, AI fallback). AI fallback is provisioned; grammar runs today." },
];

const DEFAULT_AI_LEVELS: AiLevels = { subhead: "full", head: "full", decompose: "full", timeParse: "full" };
const AI_LEVEL_VALUES: AiLevel[] = ["deterministic", "lightweight", "full"];

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
  /** §7.0.3 compute intensity. `mlMode` is the derived GLOBAL state (maximum /
   * lightweight / custom); `setMlMode` writes all features at once. `aiLevels`
   * is the per-feature source of truth (the AI Studio detail screen). */
  mlMode: MlMode;
  setMlMode: (m: "maximum" | "lightweight") => void;
  aiLevels: AiLevels;
  setAiLevel: (feature: AiFeature, level: AiLevel) => void;
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
  const [aiLevels, setAiLevels] = useState<AiLevels>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("aiLevels") ?? "null");
      if (stored && typeof stored === "object") {
        const ok = (v: unknown): v is AiLevel => AI_LEVEL_VALUES.includes(v as AiLevel);
        return {
          subhead: ok(stored.subhead) ? stored.subhead : DEFAULT_AI_LEVELS.subhead,
          head: ok(stored.head) ? stored.head : DEFAULT_AI_LEVELS.head,
          decompose: ok(stored.decompose) ? stored.decompose : DEFAULT_AI_LEVELS.decompose,
          timeParse: ok(stored.timeParse) ? stored.timeParse : DEFAULT_AI_LEVELS.timeParse,
        };
      }
    } catch {
      // fall through
    }
    return DEFAULT_AI_LEVELS;
  });
  const setAiLevel = (feature: AiFeature, level: AiLevel): void =>
    setAiLevels((s) => ({ ...s, [feature]: level }));
  const setMlMode = (m: "maximum" | "lightweight"): void => {
    const level: AiLevel = m === "maximum" ? "full" : "deterministic";
    setAiLevels({ subhead: level, head: level, decompose: level, timeParse: level });
  };
  const levelVals = Object.values(aiLevels);
  const mlMode: MlMode = levelVals.every((l) => l === "full")
    ? "maximum"
    : levelVals.every((l) => l === "deterministic")
      ? "lightweight"
      : "custom";
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
  useEffect(() => {
    localStorage.setItem("aiLevels", JSON.stringify(aiLevels));
  }, [aiLevels]);
  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat, gridGranularity, setGridGranularity, devSandbox, setDevSandbox, presetDefaults, setPresetDefault, mlMode, setMlMode, aiLevels, setAiLevel }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
