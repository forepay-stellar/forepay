import { describe, expect, it } from "vitest";
import { contractCode, provenUsd } from "./contract";

describe("contractCode", () => {
  it("reads the contract's error number out of a simulation error", () => {
    expect(contractCode("HostError: Error(Contract, #20)\n\nEvent log ...")).toBe(20);
  });

  it("is null for anything that is not a contract refusal", () => {
    expect(contractCode("HostError: Error(Budget, ExceededLimit)")).toBeNull();
  });
});

describe("provenUsd", () => {
  it("is the AdSense figure as signed", () => {
    expect(provenUsd({ revenueUsd: "360.00" })).toBe("360.00");
  });

  it("truncates AdMob's micros to cents, never rounding up", () => {
    expect(provenUsd({ revenueUsd: "12.345678", source: "admob", revenueMicros: "12345678" })).toBe("12.34");
    expect(provenUsd({ revenueUsd: "0.999999", source: "admob", revenueMicros: "999999" })).toBe("0.99");
    expect(provenUsd({ revenueUsd: "4", source: "admob", revenueMicros: "4000000" })).toBe("4.00");
  });
});
