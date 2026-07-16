/**
 * §06 TRANSACTIONAL SETTINGS — invariant guard, pinned after the 2026-07-16 audit.
 *
 * "Every change reflects live … only commits on `Done`. Esc, the header ×, and a
 * scrim click all revert EVERY FIELD to the values captured [on open]."
 *
 * Seven fields were editable in the panel but missing from App's snapshot, so they
 * silently survived a cancel (verified in-browser: showWeekday toggled to "0"
 * stayed "0" after Escape). Nothing failed — the law was just quietly untrue.
 *
 * This is a STATIC guard rather than a behavioral one, because the bug lives in the
 * gap BETWEEN two files: a setting is added to SettingsPanel and nobody remembers
 * App. It fails on the next such omission, naming the setter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (f: string): string => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

/** Setters the panel actually calls = the fields a user can change there. */
function editableSetters(panel: string): string[] {
  const found = new Set<string>();
  for (const m of panel.matchAll(/\b(set[A-Z]\w*)\s*\(/g)) found.add(m[1]!);
  // Local React state inside the panel (drafts, open/closed) — not app settings.
  const localOnly = new Set(["setDefaults", "setId", "setSettingsSnapshot"]);
  return [...found].filter((s) => !localOnly.has(s));
}

describe("§06 — Esc/×/scrim revert EVERY settings field", () => {
  it("every setting the panel can change is restored by revertSettings", () => {
    const panel = read("components/SettingsPanel.tsx");
    const app = read("App.tsx");
    const revert = app.slice(app.indexOf("const revertSettings"), app.indexOf("const [theme, setTheme]"));
    expect(revert.length).toBeGreaterThan(0); // the slice must actually find it

    const missing = editableSetters(panel).filter((setter) => {
      // A field counts as restored if revert calls its setter, or an equivalent
      // bulk one (add/removeCustomSound ↔ setCustomSounds; setMlMode ↔ setAiLevels).
      const equivalents: Record<string, string> = {
        addCustomSound: "setCustomSounds",
        removeCustomSound: "setCustomSounds",
        setMlMode: "setAiLevels",
        setAiLevel: "setAiLevels",
        setPresetDefault: "setPresetDefault",
      };
      const needed = equivalents[setter] ?? setter;
      return !revert.includes(`${needed}(`);
    });
    expect(missing, `SettingsPanel can change these, but a cancel does NOT revert them: ${missing.join(", ")}`).toEqual([]);
  });

  it("every CORE event the panel dispatches is also reverted", () => {
    // The first version of this guard only scanned `setX(` calls and MISSED
    // `SET_SLEEP_BUDGET` — a real unreverted field (§11.4 Sleep is edited here as
    // well as in weekly planning). Settings reach core two ways; both must revert.
    const panel = read("components/SettingsPanel.tsx");
    const app = read("App.tsx");
    const revert = app.slice(app.indexOf("const revertSettings"), app.indexOf("const [theme, setTheme]"));

    const dispatched = new Set([...panel.matchAll(/type:\s*"(SET_[A-Z_]+)"/g)].map((m) => m[1]!));
    const restored = new Set([...revert.matchAll(/type:\s*"(SET_[A-Z_]+)"/g)].map((m) => m[1]!));
    const missing = [...dispatched].filter((e) => !restored.has(e));
    expect(missing, `SettingsPanel dispatches these to core, but a cancel does NOT revert them: ${missing.join(", ")}`).toEqual([]);
  });

  it("the weekend edit reverts core's OFF set too (§4.4a: weekend ⊆ offDays)", () => {
    // Reverting the setting without the days it forced OFF would just re-drift them.
    const app = read("App.tsx");
    const revert = app.slice(app.indexOf("const revertSettings"), app.indexOf("const [theme, setTheme]"));
    expect(revert).toContain("setWeekendDays(");
    expect(revert).toContain("SET_OFF_DAYS");
  });
});
