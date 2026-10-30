import { describe, expect, it } from "vitest";
import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { advanceArgs, contractCode, provenUsd, sourceArg, withSource, type AdvanceRequest } from "./contract";

const BORROWER = "GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2";
const REQ: AdvanceRequest = {
  revenueUsd: "360.00",
  pubId: "pub-1",
  windowStart: "2026-07-01",
  windowEnd: "2026-09-30",
  timestampS: 1n,
  epoch: 1n,
  signature: "00".repeat(64),
  recoveryId: 0,
};
const native = (args: xdr.ScVal[]) => args.map((a) => scValToNative(a) as unknown);

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
    // Without micros, the exact decimal is cut to cents rather than handed to `quote` as it is.
    expect(provenUsd({ revenueUsd: "12.345678", source: "admob" })).toBe("12.34");
  });
});

describe("the revenue source on the contract's calls (#94)", () => {
  it("is the contract's Source enum: a vector holding the variant's name", () => {
    expect(sourceArg(undefined).toXDR("base64")).toBe(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("AdSense")]).toXDR("base64"));
    expect(sourceArg("admob").toXDR("base64")).toBe(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("AdMob")]).toXDR("base64"));
  });

  it("is left out for the contract before #94, so its calls are what they were", () => {
    const args = advanceArgs(BORROWER, REQ, false);
    expect(native(args)).toEqual([BORROWER, "360.00", "pub-1", "2026-07-01", "2026-09-30", 1n, 1n, Buffer.alloc(64), 0]);
    expect(withSource("admob", args, false)).toBe(args);
  });

  it("leads the call once the contract takes it, and an AdMob proof gives its signed micros", () => {
    expect(native(advanceArgs(BORROWER, REQ, true)).slice(0, 3)).toEqual([["AdSense"], BORROWER, "360.00"]);
    const admob = { ...REQ, revenueUsd: "360.004567", source: "admob" as const, revenueMicros: "360004567" };
    expect(native(advanceArgs(BORROWER, admob, true)).slice(0, 3)).toEqual([["AdMob"], BORROWER, "360004567"]);
  });
});
