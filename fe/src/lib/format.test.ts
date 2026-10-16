import { describe, expect, it } from "vitest";
import { formatLedgerTime, formatUsdc, parseUsdc, shortAddress, usdcParts } from "./format";

describe("shortAddress", () => {
  it("keeps the first and last four characters, as the wallet chip shows them", () => {
    expect(shortAddress("GBX4ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMN7QPA")).toBe("GBX4…7QPA");
  });
});

describe("usdcParts and formatUsdc", () => {
  it("splits whole and two decimals, grouping thousands", () => {
    expect(usdcParts(3_000_000_000n)).toEqual({ whole: "300", decimals: ".00" });
    expect(usdcParts(12_405_000_000n)).toEqual({ whole: "1,240", decimals: ".50" });
    expect(formatUsdc(1_000_000_000n)).toBe("100.00 USDC");
  });

  it("rounds down to the cent", () => {
    expect(usdcParts(1_999_999n)).toEqual({ whole: "0", decimals: ".19" });
  });
});

describe("parseUsdc", () => {
  it("reads plain amounts to stroops", () => {
    expect(parseUsdc("150")).toBe(1_500_000_000n);
    expect(parseUsdc("0.5")).toBe(5_000_000n);
    expect(parseUsdc("1.0000001")).toBe(10_000_001n);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "-1", "1e3", "1,000", "1.00000001", "abc"]) expect(parseUsdc(bad)).toBeNull();
  });
});

describe("formatDate", () => {
  it("has no clock time and no colon", () => {
    expect(formatLedgerTime(1_791_806_400)).toBe("12 Oct 2026");
  });
});
