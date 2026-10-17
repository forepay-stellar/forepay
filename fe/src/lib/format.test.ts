import { describe, expect, it } from "vitest";
import {
  formatLedgerTime,
  formatUsd,
  formatUsdCents,
  formatUsdc,
  formatUsdcExact,
  formatWindow,
  formatXlmFee,
  parseUsdc,
  shortAddress,
  usdcParts,
} from "./format";

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

describe("formatUsd", () => {
  it("shows the proven figure in dollars, two decimals, thousands grouped", () => {
    expect(formatUsd("360.00")).toBe("$360.00");
    expect(formatUsd("1240")).toBe("$1,240.00");
    expect(formatUsd("3.2")).toBe("$3.20");
  });

  it("leaves anything that is not a plain amount as it is, rather than guessing", () => {
    expect(formatUsd("12.345")).toBe("12.345");
  });
});

describe("formatWindow", () => {
  it("names the three months two ways, as the offer shows them", () => {
    expect(formatWindow("2026-07-01", "2026-09-30")).toEqual({ short: "Jul to Sep 2026", long: "July to September" });
  });

  it("keeps both years when the window crosses one", () => {
    expect(formatWindow("2026-11-01", "2027-01-31")).toEqual({
      short: "Nov 2026 to Jan 2027",
      long: "November 2026 to January 2027",
    });
  });
});

describe("formatXlmFee", () => {
  it("says Under 0.01 XLM for a small fee, as the 2c frame does", () => {
    expect(formatXlmFee(25_000n)).toBe("Under 0.01 XLM");
  });

  it("rounds a larger fee up, never down", () => {
    expect(formatXlmFee(100_000n)).toBe("Up to 0.01 XLM");
    expect(formatXlmFee(312_345n)).toBe("Up to 0.04 XLM");
    expect(formatXlmFee(12_000_001n)).toBe("Up to 1.21 XLM");
  });
});

describe("formatUsdcExact", () => {
  it("shows every decimal an amount has, and at least two", () => {
    expect(formatUsdcExact(125_090_000n)).toBe("12.509 USDC");
    expect(formatUsdcExact(300_000_000n)).toBe("30.00 USDC");
    expect(formatUsdcExact(1n)).toBe("0.0000001 USDC");
    expect(formatUsdcExact(12_345_678_900_000n)).toBe("1,234,567.89 USDC");
  });
});

describe("formatUsdCents", () => {
  it("reads the API's cents as dollars, grouped", () => {
    expect(formatUsdCents(36_000n)).toBe("$360.00");
    expect(formatUsdCents(124_000_05n)).toBe("$124,000.05");
  });
});
