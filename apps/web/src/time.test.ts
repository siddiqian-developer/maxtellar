/** SPEC Part VI time-format verification (the exact examples from the spec). */
import { describe, it, expect } from "vitest";
import { fmtDur } from "./time";

describe("duration format MM:WW:DD:HH:MM — leading units only when non-zero", () => {
  it("90 minutes → 01:30", () => {
    expect(fmtDur(90)).toBe("01:30");
  });
  it("8 days 2 hours → 01:01:02:00 (1w 1d 2h 0m)", () => {
    expect(fmtDur((8 * 24 + 2) * 60)).toBe("01:01:02:00");
  });
  it("45 minutes → 00:45", () => {
    expect(fmtDur(45)).toBe("00:45");
  });
  it("25 hours → 01:01:00 (1d 1h 0m)", () => {
    expect(fmtDur(25 * 60)).toBe("01:01:00");
  });
  it("zero → 00:00", () => {
    expect(fmtDur(0)).toBe("00:00");
  });
});
