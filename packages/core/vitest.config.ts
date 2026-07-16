import { defineConfig } from "vitest/config";
import { quickpickle } from "quickpickle";

// §7.2/§7.4 acceptance layer: the Gherkin `.feature` files under test/acceptance/
// run inside the same Vitest pass as the unit tests (quickpickle is a Vite plugin,
// not a separate runner — "no heavy new deps"). Step definitions register via the
// setup file. Fresh from spec, each scenario tagged with the rule it verifies.
export default defineConfig({
  plugins: [quickpickle()],
  test: {
    include: ["test/**/*.test.ts", "test/acceptance/**/*.feature"],
    setupFiles: ["test/acceptance/steps.ts"],
  },
});
