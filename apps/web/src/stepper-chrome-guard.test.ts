/**
 * §7.0.6 composition law + §7.0.5 UI symmetry — the stepper, enforced by
 * DETECTION rather than discipline.
 *
 * Two properties, both learned from real bugs (2026-07-16):
 *
 * 1. **ONE stepper.** The `.time-stepper` shell lives only in `StepperField.tsx`;
 *    every surface composes it. It was hand-rolled in five places before, and
 *    had already drifted — the history editor and off-period dialog carried the
 *    📅 but had silently lost the ▴▾ chevrons. A re-hand-rolled shell anywhere
 *    else fails here.
 *
 * 2. **The stepper is ONE field, not a field plus two loose chevrons.** The
 *    input relies on `flex: 1` to fill the shell so the chevrons sit flush
 *    against it. Week plan right-aligned its field by putting `margin-left:auto`
 *    on the INPUT inside the shell — and per flexbox an auto margin absorbs the
 *    free space AND forces flex-grow to zero, so `flex: 1` silently stopped
 *    applying and the chevrons detached. Alignment belongs on the `.time-stepper`
 *    wrapper, never on what's inside it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url)); // apps/web/src
const CSS = join(SRC, "theme.css");
const HOME = "components/StepperField.tsx"; // the one home of the stepper chrome

/** Chrome that only the shared stepper may render. */
const CHROME = ["time-stepper", "time-stepper-btns", "cal-btn"];
/** Declarations that break a flex child out of the stepper's layout. */
const BREAKS_CHROME = /(?:^|;)\s*(?:margin(?:-left|-right|-inline(?:-start|-end)?)?\s*:[^;]*\bauto\b|float\s*:\s*(?:left|right)|position\s*:\s*(?:absolute|fixed))/;

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

const rel = (f: string): string => f.slice(SRC.length + 1).replace(/\\/g, "/");
const sources = (): string[] => walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f));

describe("the ±stepper is composed, never re-hand-rolled (§7.0.6)", () => {
  it("only StepperField renders the stepper chrome", () => {
    const offenders: string[] = [];
    for (const f of sources()) {
      if (rel(f) === HOME) continue;
      const src = readFileSync(f, "utf8");
      for (const cls of CHROME) {
        // Match the class as a whole word inside a className literal.
        if (new RegExp(`className=["\`][^"\`]*\\b${cls}\\b`).test(src)) {
          offenders.push(`${rel(f)} hand-rolls .${cls} — compose <StepperField> instead`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the ±stepper stays one field with its input (§7.0.5)", () => {
  /**
   * Classes that end up on the element INSIDE the stepper: the always-applied
   * `num`, plus every literal handed to the shell's `inputClassName` prop.
   */
  const inner = new Set<string>(["num"]);
  for (const f of sources()) {
    for (const m of readFileSync(f, "utf8").matchAll(/inputClassName=["{`]([^"}`]+)/g)) {
      for (const cls of (m[1] ?? "").split(/\s+/)) {
        if (/^[a-zA-Z][\w-]*$/.test(cls)) inner.add(cls);
      }
    }
  }

  it("resolves the classes rendered inside the stepper", () => {
    // `num` is always applied by the shell, so the guard is never vacuous even
    // when no surface passes an `inputClassName`.
    expect(inner.has("num")).toBe(true);
  });

  it("no CSS rule gives a stepper's inner element an auto margin or takes it out of flow", () => {
    const css = readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders: string[] = [];

    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = block[1] ?? "";
      const decls = block[2] ?? "";
      if (!BREAKS_CHROME.test(";" + decls)) continue;

      for (const sel of selectors.split(",")) {
        // The subject = rightmost compound: what the rule actually styles.
        const parts = sel.trim().split(/\s+|>|\+|~/).filter(Boolean);
        const subj = parts[parts.length - 1] ?? "";
        if ([...inner].some((cls) => subj.includes(`.${cls}`))) {
          offenders.push(`${sel.trim()} { ${decls.trim()} }`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
