import { describe, expect, it } from "vitest";
import type { Sizing } from "@/lib/stellar/contract";
import { isCapped, rateLabel, revenueCents, shareWords, usdcWords } from "./cap";

// What the production contract's sizing() answers (#63).
const TERMS: Sizing = {
  rateNum: 25n,
  rateDen: 100n,
  capStroops: 1_000_000_000n,
  minStroops: 10_000_000n,
  stroopsPerCent: 100_000n,
};

describe("revenueCents", () => {
  it("reads the attested figure in cents", () => {
    expect(revenueCents("360.00")).toBe(36_000n);
    expect(revenueCents("1240")).toBe(124_000n);
    expect(revenueCents("3.2")).toBe(320n);
  });
});

describe("isCapped", () => {
  it("is true only when the share of revenue is more than the cap", () => {
    expect(isCapped(TERMS, "1240.00")).toBe(true);
    expect(isCapped(TERMS, "400.01")).toBe(true);
    // Exactly $400.00: the quarter is the cap itself, and the cap did nothing.
    expect(isCapped(TERMS, "400.00")).toBe(false);
    expect(isCapped(TERMS, "360.00")).toBe(false);
  });
});

describe("rateLabel", () => {
  it("names the contract's rate", () => {
    expect(rateLabel(TERMS)).toBe("× 25%");
  });
});

describe("shareWords and usdcWords", () => {
  it("word the contract's figures as the board does", () => {
    expect(shareWords(TERMS)).toBe("A quarter");
    expect(shareWords({ ...TERMS, rateNum: 50n })).toBe("Half");
    expect(shareWords({ ...TERMS, rateNum: 40n })).toBe("40%");
    expect(usdcWords(TERMS.capStroops)).toBe("100 USDC");
    expect(usdcWords(TERMS.minStroops)).toBe("1 USDC");
    expect(usdcWords(12_300_000n)).toBe("1.23 USDC");
  });
});
