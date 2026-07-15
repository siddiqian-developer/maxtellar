/**
 * §2.9 preset pills (Sleep / Nap / Food) for the task drawer. A preset pre-fills
 * a bundle of fields — some locked, some editable — and can be auto-selected
 * from a matching title (ML auto-switch, §7.0.1). Preset metadata lives here so
 * the drawer, the ML matcher, and the future gap-fill flow share one source.
 */

import { RECHARGE, FOOD } from "@maxtellar/core";
import type { PresetId } from "./settings";

export interface Preset {
  id: PresetId;
  /** Pill label. */
  label: string;
  /** Locked title (Sleep/Nap) or the seed title (Food — editable). */
  title: string;
  /** Whether the Title field is editable while the pill is active (Food only). */
  titleEditable: boolean;
  /** Locked sub-head (activity) and its head. */
  subhead: string;
  head: string;
  /** Sleep/Nap set a sleepKind; Food does not. */
  sleepKind?: "sleep" | "nap";
  /** Lowercased keywords that a title can match to auto-select this pill. */
  keywords: string[];
}

export const PRESETS: Preset[] = [
  {
    id: "sleep",
    label: "Sleep",
    title: "Sleep",
    titleEditable: false,
    subhead: "Sleep",
    head: RECHARGE,
    sleepKind: "sleep",
    keywords: ["sleep", "sleeping", "bedtime", "go to bed", "night sleep"],
  },
  {
    id: "nap",
    label: "Nap",
    title: "Nap",
    titleEditable: false,
    subhead: "Nap",
    head: RECHARGE,
    sleepKind: "nap",
    keywords: ["nap", "napping", "power nap", "siesta", "doze"],
  },
  {
    id: "food",
    label: "Food",
    title: "Food",
    titleEditable: true,
    subhead: "Food",
    head: FOOD,
    keywords: ["food", "meal", "eat", "eating", "lunch", "dinner", "breakfast", "brunch", "snack", "supper"],
  },
];

export function presetById(id: PresetId): Preset {
  return PRESETS.find((p) => p.id === id)!;
}

/**
 * §7.0.1 ML auto-switch: pick the preset a title matches, or null. Deterministic
 * keyword match (a whole-word or clear substring hit) — an on-device, always-
 * available signal; never load-bearing. The longest matching keyword wins so
 * "power nap" beats a stray "nap" substring elsewhere.
 */
export function matchPreset(title: string): Preset | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  const words = new Set(t.split(/[^a-z]+/).filter(Boolean));
  let best: { preset: Preset; len: number } | null = null;
  for (const preset of PRESETS) {
    for (const kw of preset.keywords) {
      const hit = kw.includes(" ") ? t.includes(kw) : words.has(kw);
      if (hit && (!best || kw.length > best.len)) best = { preset, len: kw.length };
    }
  }
  return best?.preset ?? null;
}
