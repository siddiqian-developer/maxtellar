/**
 * §7.0.4 / §7.0.5 enforcement — reuse by DETECTION, not discipline.
 * The snap-notify toast lives in ONE shared component (SnapToast.tsx). A raw
 * `notice-toast` element anywhere else in the web source is a re-hand-roll of a
 * shared mechanism — a bug. This guard fails the moment one reappears, so the
 * next edit can't silently spawn a parallel copy (the exact mistake this
 * replaces). If a genuinely new shared primitive is needed, add it to
 * SnapToast.tsx (or its own shared module) and to docs/shared-primitives.md —
 * do not inline a bespoke `notice-toast`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url)); // apps/web/src

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

describe("snap-notify toast is a single shared component (§7.0.4/§7.0.5)", () => {
  it("no bespoke `notice-toast` element outside SnapToast.tsx", () => {
    const offenders = walk(SRC)
      .filter((f) => !f.endsWith("SnapToast.tsx") && !/\.test\.tsx?$/.test(f))
      .filter((f) => readFileSync(f, "utf8").includes("notice-toast"))
      .map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
