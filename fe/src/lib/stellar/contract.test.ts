import { describe, expect, it } from "vitest";
import { contractCode } from "./contract";

describe("contractCode", () => {
  it("reads the contract's error number out of a simulation error", () => {
    expect(contractCode("HostError: Error(Contract, #20)\n\nEvent log ...")).toBe(20);
  });

  it("is null for anything that is not a contract refusal", () => {
    expect(contractCode("HostError: Error(Budget, ExceededLimit)")).toBeNull();
  });
});
