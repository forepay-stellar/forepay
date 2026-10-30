import { describe, expect, it } from "vitest";
import type { AdvanceSummary, LedgerTransaction } from "@/lib/api/types";
import {
  groupByMonth,
  historyRows,
  latestRows,
  outstanding,
  percentRepaid,
  pickAdvance,
  rowDate,
  sizingLabel,
} from "./ledger";

const USDC = 10_000_000n;
const OPENED = 1_791_806_400n; // 12 Oct 2026

function advance(over: Partial<AdvanceSummary> = {}): AdvanceSummary {
  return {
    nullifier: "aa",
    source: "AdSense",
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

  // The window itself is formatWindow's (lib/format.ts), shared with 2b.
  it("names how the advance was sized", () => {
    const terms = { rateNum: 25n, rateDen: 100n, capStroops: 100n * USDC, minStroops: USDC, stroopsPerCent: 100_000n };
    expect(sizingLabel(advance(), terms)).toBe("25% of $360.00");
    expect(sizingLabel(advance({ revenueCents: 124_000n, principal: 100n * USDC }), terms)).toBe("Capped at 100.00 USDC");
    // The rate is the contract's: another rate reads as itself.
    expect(sizingLabel(advance({ principal: 144n * USDC }), { ...terms, rateNum: 40n, capStroops: 200n * USDC })).toBe(
      "40% of $360.00",
    );
    // Without the contract's terms, nothing is said.
    expect(sizingLabel(advance(), undefined)).toBeNull();
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
