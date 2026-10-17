import { describe, expect, it } from "vitest";
import { centBelow } from "./cap";

describe("centBelow", () => {
  it("is the figure one cent lower", () => {
    expect(centBelow("400.00")).toBe("399.99");
    expect(centBelow("1240")).toBe("1239.99");
    expect(centBelow("0.10")).toBe("0.09");
    expect(centBelow("100.5")).toBe("100.49");
  });

  it("is null at zero", () => {
    expect(centBelow("0.00")).toBeNull();
  });
});
