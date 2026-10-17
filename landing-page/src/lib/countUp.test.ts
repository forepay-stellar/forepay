import { describe, expect, it } from "vitest";
import { countUpValue } from "./countUp";

describe("countUpValue", () => {
  it("starts at zero and lands exactly on the target", () => {
    expect(countUpValue(100, 0)).toBe(0);
    expect(countUpValue(100, 1)).toBe(100);
  });

  it("eases out, so it is past halfway at half time", () => {
    expect(countUpValue(100, 0.5)).toBeGreaterThan(50);
  });

  it("clamps progress outside 0 to 1 and never returns a fraction", () => {
    expect(countUpValue(25, 1.4)).toBe(25);
    expect(countUpValue(25, -1)).toBe(0);
    expect(Number.isInteger(countUpValue(25, 0.37))).toBe(true);
  });
});
