import { describe, expect, it } from "vitest";
import {
  amountDisplay,
  amountInputString,
  checkAmount,
  chipAmount,
  sanitizeAmountInput,
  typedAmount,
} from "./model";

const USDC = 10_000_000n;

describe("the repay form", () => {
  it("accepts digits and up to seven decimals only", () => {
    expect(sanitizeAmountInput("30")).toBe("30");
    expect(sanitizeAmountInput("30.")).toBe("30.");
    expect(sanitizeAmountInput(".5")).toBe("0.5");
    expect(sanitizeAmountInput("30,5")).toBe("30.5");
    expect(sanitizeAmountInput("1.1234567")).toBe("1.1234567");
    expect(sanitizeAmountInput("1.12345678")).toBeNull();
    expect(sanitizeAmountInput("abc")).toBeNull();
    expect(sanitizeAmountInput("-1")).toBeNull();
  });

  it("reads nothing or zero as no amount", () => {
    expect(typedAmount("")).toBeNull();
    expect(typedAmount("0")).toBeNull();
    expect(typedAmount("0.00")).toBeNull();
    expect(typedAmount("30.")).toBe(30n * USDC);
  });

  it("shows the whole part solid and the decimals faded, padded to two", () => {
    expect(amountDisplay("")).toEqual({ whole: "", decimals: "0.00" });
    expect(amountDisplay("30")).toEqual({ whole: "30", decimals: ".00" });
    expect(amountDisplay("30.")).toEqual({ whole: "30", decimals: ".00" });
    expect(amountDisplay("30.5")).toEqual({ whole: "30", decimals: ".50" });
    expect(amountDisplay("30.00")).toEqual({ whole: "30", decimals: ".00" });
    expect(amountDisplay("1.1234567")).toEqual({ whole: "1", decimals: ".1234567" });
  });

  it("writes stroops back as a plain amount, keeping every stroop", () => {
    expect(amountInputString(30n * USDC)).toBe("30.00");
    expect(amountInputString(1_234_567_891n)).toBe("123.4567891");
    expect(amountInputString(15_000_000n)).toBe("1.50");
  });

  it("sizes the chips from what is left, rounding 25% and 50% down to the cent", () => {
    const left = 60n * USDC + 3n;
    expect(chipAmount("quarter", left)).toBe(15n * USDC);
    expect(chipAmount("half", left)).toBe(30n * USDC);
    expect(chipAmount("full", left)).toBe(left);
  });

  it("stops an amount above what is left before the contract refuses it", () => {
    expect(checkAmount("", 60n * USDC, 820n * USDC)).toEqual({ kind: "empty" });
    expect(checkAmount("30", 60n * USDC, 820n * USDC)).toEqual({ kind: "ok", amount: 30n * USDC });
    expect(checkAmount("75", 60n * USDC, 820n * USDC)).toEqual({ kind: "overOutstanding", amount: 75n * USDC });
    expect(checkAmount("60", 60n * USDC, 12n * USDC)).toEqual({ kind: "overBalance", amount: 60n * USDC });
  });

  it("does not guess a balance it could not read, and reads no trustline as nothing held", () => {
    expect(checkAmount("60", 60n * USDC, undefined)).toEqual({ kind: "ok", amount: 60n * USDC });
    expect(checkAmount("60", 60n * USDC, null)).toEqual({ kind: "overBalance", amount: 60n * USDC });
  });
});
