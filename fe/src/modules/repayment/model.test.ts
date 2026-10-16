import { describe, expect, it } from "vitest";
import type { AdvanceSummary, LedgerTransaction } from "@/lib/api/types";
import {
  amountDisplay,
  amountInputString,
  checkAmount,
  chipAmount,
  groupByMonth,
  historyRows,
  latestRows,
  outstanding,
  percentRepaid,
  pickAdvance,
  rowDate,
  sanitizeAmountInput,
  sizingLabel,
  typedAmount,
  windowLabel,
} from "./model";

const USDC = 10_000_000n;
const OPENED = 1_791_806_400n; // 12 Oct 2026

function advance(over: Partial<AdvanceSummary> = {}): AdvanceSummary {
  return {
    nullifier: "aa",
    borrower: "G",
    windowStart: "2026-07-01",
    windowEnd: "2026-09-30",
    revenueCents: 36_000n,
    principal: 90n * USDC,
    repaid: 30n * USDC,
    openedAt: OPENED,
    txHash: "adv",
    ...over,
  };
}

function tx(over: Partial<LedgerTransaction>): LedgerTransaction {
  return { hash: "h", kind: "repayment", amount: USDC, at: OPENED, status: "completed", nullifier: "aa", ...over };
}

describe("the advance on screen", () => {
  it("is null before any advance", () => {
    expect(pickAdvance([])).toBeNull();
  });

  it("prefers the newest advance that still has something to repay, numbered from the oldest", () => {
    const first = advance({ nullifier: "1", openedAt: 1n, repaid: 0n });
    const second = advance({ nullifier: "2", openedAt: 2n, repaid: 90n * USDC });
    expect(pickAdvance([second, first])).toEqual({ advance: first, number: 1 });
  });

  it("falls back to the newest when everything is repaid", () => {
    const first = advance({ nullifier: "1", openedAt: 1n, repaid: 90n * USDC });
    const second = advance({ nullifier: "2", openedAt: 2n, repaid: 90n * USDC });
    expect(pickAdvance([first, second])).toEqual({ advance: second, number: 2 });
  });

  it("says what is left and how much is repaid, rounding the percent down", () => {
    expect(outstanding(advance())).toBe(60n * USDC);
    expect(percentRepaid(advance())).toBe(33);
    expect(percentRepaid(advance({ repaid: 90n * USDC }))).toBe(100);
    expect(outstanding(advance({ repaid: 90n * USDC }))).toBe(0n);
  });

  it("names the window and how the advance was sized", () => {
    expect(windowLabel("2026-07-01", "2026-09-30")).toBe("Jul to Sep 2026");
    expect(windowLabel("2025-11-01", "2026-01-31")).toBe("Nov 2025 to Jan 2026");
    expect(sizingLabel(advance())).toBe("25% of $360.00");
    expect(sizingLabel(advance({ revenueCents: 124_000n, principal: 100n * USDC }))).toBe("Capped at 100.00 USDC");
  });
});

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

describe("the transaction lists", () => {
  const list: LedgerTransaction[] = [
    tx({ hash: "r3", amount: 10n * USDC, at: OPENED + 1_036_800n }),
    tx({ hash: "r2", amount: 10n * USDC, at: OPENED + 1_036_000n, status: "failed" }),
    tx({ hash: "r1", amount: 20n * USDC, at: OPENED + 691_200n }),
    tx({ hash: "adv", kind: "advance", amount: 90n * USDC, at: OPENED }),
    tx({ hash: "tl", kind: "trustline", amount: 0n, at: OPENED - 600n, nullifier: "" }),
    tx({ hash: "other", at: OPENED + 5n, nullifier: "bb" }),
  ];

  it("3a lists the latest four of this advance, oldest of them first", () => {
    expect(latestRows(list, "aa").map((r) => r.hash)).toEqual(["adv", "r1", "r2", "r3"]);
    expect(latestRows(list, "aa", 2).map((r) => r.hash)).toEqual(["r2", "r3"]);
    expect(latestRows(list, "aa")[2]).toMatchObject({ failed: true });
  });

  it("3b lists everything newest first, with the proof and the USDC allowance", () => {
    const rows = historyRows(list, advance());
    expect(rows.map((r) => `${r.kind}:${r.hash}`)).toEqual([
      "repayment:r3",
      "repayment:r2",
      "repayment:r1",
      "advance:adv",
      "proof:adv",
      "trustline:tl",
    ]);
  });

  it("groups rows by month, newest month first", () => {
    const rows = historyRows(
      [tx({ hash: "nov", at: OPENED + 30n * 86_400n }), tx({ hash: "adv", kind: "advance", at: OPENED })],
      advance(),
    );
    expect(groupByMonth(rows).map((g) => [g.month, g.rows.length])).toEqual([
      ["November 2026", 1],
      ["October 2026", 2],
    ]);
  });

  it("dates rows without a clock time, and says Today for today", () => {
    expect(rowDate(OPENED, new Date("2026-10-20T00:00:00Z"))).toBe("12 Oct 2026");
    expect(rowDate(OPENED, new Date("2026-10-12T23:00:00Z"))).toBe("Today");
  });
});
