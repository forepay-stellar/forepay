import type { Page } from "@playwright/test";
import type { AdvanceSummary, LedgerTransaction } from "../../src/lib/api/types";
import { E2E_ADDRESS } from "../../src/lib/stellar/wallet-e2e";

/**
 * A stand-in for the #16 API. The app under test points at https://api.e2e.invalid (see
 * playwright.config.ts); this answers `GET /advances` and `GET /transactions` from a `Ledger` the spec
 * owns, in the wire format the client parses (amounts as strings). When the RPC stub lands a repayment,
 * the spec updates the same object with `recordRepayment`, the way the indexer behind #16 would, so the
 * screen can only show the new figures by reading them again.
 */
export type Ledger = {
  advances: AdvanceSummary[];
  transactions: LedgerTransaction[];
  /** Answer every call with a server error instead. */
  down?: boolean;
  /** Wait this long before answering, to see the loading state. */
  delayMs?: number;
};

export const NULLIFIER = "7c21d0a3f9c2e81b44fa0d5e6b7a8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7";
export const ADVANCE_TX = "a3f9c2".padEnd(64, "0");
const OPENED = 1_791_806_400n; // 12 Oct 2026
const USDC = 10_000_000n;

/** The 3a and 3b frames: 90.00 advanced against $360.00, 30.00 repaid, 60.00 left. */
export function frameLedger(): Ledger {
  return {
    advances: [
      {
        nullifier: NULLIFIER,
        source: "AdSense",
        borrower: E2E_ADDRESS,
        windowStart: "2026-07-01",
        windowEnd: "2026-09-30",
        revenueCents: 36_000n,
        principal: 90n * USDC,
        repaid: 30n * USDC,
        openedAt: OPENED,
        txHash: ADVANCE_TX,
      },
    ],
    transactions: [
      { hash: "e90b13".padEnd(64, "1"), kind: "repayment", amount: 10n * USDC, at: OPENED + 1_036_800n, status: "completed", nullifier: NULLIFIER },
      { hash: "f1c2d0".padEnd(64, "2"), kind: "repayment", amount: 10n * USDC, at: OPENED + 1_036_000n, status: "failed", nullifier: NULLIFIER },
      { hash: "7c21d0".padEnd(64, "3"), kind: "repayment", amount: 20n * USDC, at: OPENED + 691_200n, status: "completed", nullifier: NULLIFIER },
      { hash: ADVANCE_TX, kind: "advance", amount: 90n * USDC, at: OPENED, status: "completed", nullifier: NULLIFIER },
      { hash: "5b8e44".padEnd(64, "4"), kind: "trustline", amount: 0n, at: OPENED - 600n, status: "completed", nullifier: "" },
    ],
  };
}

/** What the indexer behind #16 records once a repayment lands. */
export function recordRepayment(ledger: Ledger, amount: bigint, hash: string) {
  const advance = ledger.advances[0];
  advance.repaid += amount;
  ledger.transactions.unshift({
    hash,
    kind: "repayment",
    amount,
    at: BigInt(Math.floor(Date.now() / 1000)),
    status: "completed",
    nullifier: advance.nullifier,
  });
}

const wire = (rows: object[]) =>
  JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

export async function mockApi(page: Page, ledger: Ledger) {
  await page.route("https://api.e2e.invalid/**", async (route) => {
    if (ledger.delayMs) await new Promise((r) => setTimeout(r, ledger.delayMs));
    const headers = { "access-control-allow-origin": "*" };
    if (ledger.down) return route.fulfill({ status: 503, headers, body: "unavailable" });
    const { pathname } = new URL(route.request().url());
    if (pathname === "/advances") return route.fulfill({ headers, contentType: "application/json", body: wire(ledger.advances) });
    if (pathname === "/transactions") {
      return route.fulfill({ headers, contentType: "application/json", body: wire(ledger.transactions) });
    }
    return route.fulfill({ status: 404, headers, body: `unexpected ${pathname}` });
  });
}
