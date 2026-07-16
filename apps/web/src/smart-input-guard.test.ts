/**
 * §7.0.5 UI-symmetry enforcement — reuse by DETECTION, not discipline.
 * Every date/time/duration input must inherit the smart-input pipeline (casual
 * parse → snap → reformat, + the ±5 stepper) via a SHARED field component. The
 * casual PARSERS (`parseCasualTime`/`parseTimeOfDay`/`parseCasualDuration`/…)
 * are the tell: a component that imports one is hand-rolling a raw time/duration
 * input instead of reaching for the shared field — the exact symmetry break this
 * guard prevents. Import a parser ONLY inside a shared field component (so the
 * snap + stepper come for free), never in a bespoke surface.
 *
 * Allowlist = the shared field components + the title-shorthand grammar (which
 * legitimately delegates values to the parsers, §06) + the two bespoke drawers
 * that predate the shared fields (§7.0.4 "stays until touched"); both already
 * carry steppers + snap. Adding a NEW surface that parses time/duration inline
 * fails here — build/adopt a shared field instead.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url)); // apps/web/src
const PARSER = /parse(CasualTime|CasualDate|CasualDuration|TimeOfDay|AbsoluteDate)/;

// Shared field components + delegating grammar + documented bespoke drawers.
const ALLOW = new Set([
  "casualTime.ts",
  "titleGrammar.ts", // §06 grammar delegates values to the parsers (never re-parses)
  "components/BudgetPanel.tsx", // DurInput — the shared smart duration field
  "components/TaskSpecFields.tsx", // TodField — the shared smart time-of-day field
  "components/TaskDrawer.tsx", // bespoke §3.6 trio field (predates shared fields)
  "components/OffPeriodControl.tsx", // bespoke known-end field (predates; carries a stepper)
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

describe("time/duration inputs go through a shared smart field (§7.0.5)", () => {
  it("only shared field components import the casual parsers", () => {
    const offenders = walk(SRC)
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => !ALLOW.has(f.slice(SRC.length + 1).replace(/\\/g, "/")))
      .filter((f) => PARSER.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});
