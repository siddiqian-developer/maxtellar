/**
 * App-wide settings (SPEC VI, Part VI "Time formats"): currently just the
 * 12h/24h clock format, applied everywhere a wall-clock time is displayed
 * (global clock, timeline ticks, pipeline cards). Persisted to localStorage;
 * extend this context as more settings are added rather than threading new
 * per-component props.
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { PomodoroConfig, TimingType } from "@maxtellar/core";
import type { CustomSound, SoundChoice } from "./sound";

/** §5.3 alarm firing behavior — the single global toggle. */
export type AlarmBehavior = "oneshot" | "persist";

export type TimeFormat = "12h" | "24h";

/** §5.2 pomodoro global default preset (per-task override happens at Start). */
export const DEFAULT_POMODORO: PomodoroConfig = { workMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 };

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
  /** §7.0.2: show the weekday label on far-date times ("Sun, Jul 19, 02:01 AM"
   * vs "Jul 19, 02:01 AM"). Default on. The parser ignores the label either way. */
  showWeekday: boolean;
  setShowWeekday: (v: boolean) => void;
  /** §4.4a: which weekdays are the cultural "weekend" (0=Sun…6=Sat). Default
   * Sat+Sun; ≥1. Presentational + a seed; the planner enforces weekend ⊆ offDays. */
  weekendDays: number[];
  setWeekendDays: (days: number[]) => void;
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
  /** Bulk restore — the §06 transactional revert puts the whole set back at once. */
  setAiLevels: (l: AiLevels) => void;
  /** §5.2 global default pomodoro preset; per-task override at Start. */
  pomodoroDefault: PomodoroConfig;
  setPomodoroDefault: (c: PomodoroConfig) => void;
  /** §5.3 alarms — master enable (best-effort sound + Notification), the single
   * global one-shot/persist toggle, the chosen sound, and user-added sounds. */
  alarmsEnabled: boolean;
  setAlarmsEnabled: (v: boolean) => void;
  alarmBehavior: AlarmBehavior;
  setAlarmBehavior: (b: AlarmBehavior) => void;
  alarmSound: SoundChoice;
  setAlarmSound: (s: SoundChoice) => void;
  customSounds: CustomSound[];
  addCustomSound: (s: CustomSound) => void;
  removeCustomSound: (id: string) => void;
  /** Bulk restore — §06 revert: add/remove alone can't undo a cancelled session. */
  setCustomSounds: (l: CustomSound[]) => void;
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
  const [showWeekday, setShowWeekday] = useState<boolean>(() => localStorage.getItem("showWeekday") !== "0");
  const [weekendDays, setWeekendDaysRaw] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("weekendDays") ?? "null");
      if (Array.isArray(stored)) {
        const days = [...new Set(stored.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
        if (days.length >= 1) return days;
      }
    } catch {
      // fall through
    }
    return [0, 6];
  });
  // §4.4a: at least one weekend day always.
  const setWeekendDays = (days: number[]): void => {
    const clean = [...new Set(days.filter((d) => d >= 0 && d <= 6))].sort();
    if (clean.length >= 1) setWeekendDaysRaw(clean);
  };
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

  const [pomodoroDefault, setPomodoroDefault] = useState<PomodoroConfig>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("pomodoroDefault") ?? "null");
      const n = (v: unknown, f: number): number => (typeof v === "number" && v > 0 ? Math.round(v) : f);
      if (s && typeof s === "object") {
        return {
          workMin: n(s.workMin, DEFAULT_POMODORO.workMin),
          breakMin: n(s.breakMin, DEFAULT_POMODORO.breakMin),
          longBreakMin: n(s.longBreakMin, DEFAULT_POMODORO.longBreakMin),
          cyclesBeforeLong: n(s.cyclesBeforeLong, DEFAULT_POMODORO.cyclesBeforeLong),
        };
      }
    } catch {
      // fall through
    }
    return DEFAULT_POMODORO;
  });

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
    localStorage.setItem("showWeekday", showWeekday ? "1" : "0");
  }, [showWeekday]);
  useEffect(() => {
    localStorage.setItem("weekendDays", JSON.stringify(weekendDays));
  }, [weekendDays]);
  useEffect(() => {
    localStorage.setItem("presetDefaults", JSON.stringify(presetDefaults));
  }, [presetDefaults]);
  useEffect(() => {
    localStorage.setItem("aiLevels", JSON.stringify(aiLevels));
  }, [aiLevels]);
  useEffect(() => {
    localStorage.setItem("pomodoroDefault", JSON.stringify(pomodoroDefault));
  }, [pomodoroDefault]);

  const [alarmsEnabled, setAlarmsEnabled] = useState<boolean>(() => localStorage.getItem("alarmsEnabled") === "1");
  const [alarmBehavior, setAlarmBehavior] = useState<AlarmBehavior>(() => (localStorage.getItem("alarmBehavior") === "oneshot" ? "oneshot" : "persist"));
  const [alarmSound, setAlarmSound] = useState<SoundChoice>(() => localStorage.getItem("alarmSound") || "synth");
  const [customSounds, setCustomSounds] = useState<CustomSound[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("customSounds") ?? "null");
      return Array.isArray(s) ? s.filter((c) => c && typeof c.id === "string" && typeof c.dataUrl === "string") : [];
    } catch {
      return [];
    }
  });
  const addCustomSound = (s: CustomSound): void => setCustomSounds((cs) => [...cs.filter((c) => c.id !== s.id), s]);
  const removeCustomSound = (id: string): void =>
    setCustomSounds((cs) => {
      if (alarmSound === `custom:${id}`) setAlarmSound("synth");
      return cs.filter((c) => c.id !== id);
    });
  useEffect(() => {
    localStorage.setItem("alarmsEnabled", alarmsEnabled ? "1" : "0");
  }, [alarmsEnabled]);
  useEffect(() => {
    localStorage.setItem("alarmBehavior", alarmBehavior);
  }, [alarmBehavior]);
  useEffect(() => {
    localStorage.setItem("alarmSound", alarmSound);
  }, [alarmSound]);
  useEffect(() => {
    localStorage.setItem("customSounds", JSON.stringify(customSounds));
  }, [customSounds]);
  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat, showWeekday, setShowWeekday, weekendDays, setWeekendDays, gridGranularity, setGridGranularity, devSandbox, setDevSandbox, presetDefaults, setPresetDefault, mlMode, setMlMode, aiLevels, setAiLevel, setAiLevels, pomodoroDefault, setPomodoroDefault, alarmsEnabled, setAlarmsEnabled, alarmBehavior, setAlarmBehavior, alarmSound, setAlarmSound, customSounds, addCustomSound, removeCustomSound, setCustomSounds }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
