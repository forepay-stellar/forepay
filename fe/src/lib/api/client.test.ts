import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdvances, getTransactions, usingMockApi } from "./client";

const BORROWER = "GBORROWER";

describe("the fixture client's forepay.mock.ledger switch", () => {
  afterEach(() => window.localStorage.removeItem("forepay.mock.ledger"));

  it("answers from the fixtures while no API is set", () => {
    expect(usingMockApi).toBe(true);
  });

  it("has the active advance by default: 30.00 of 90.00 repaid", async () => {
    const [advance] = await getAdvances(BORROWER);
    expect(advance.repaid).toBe(300_000_000n);
    expect(await getTransactions(BORROWER)).toHaveLength(5);
  });

  it("none: no advance and no rows", async () => {
    window.localStorage.setItem("forepay.mock.ledger", "none");
    expect(await getAdvances(BORROWER)).toEqual([]);
    expect(await getTransactions(BORROWER)).toEqual([]);
  });

  it("repaid: all of it, with the last repayment first", async () => {
    window.localStorage.setItem("forepay.mock.ledger", "repaid");
    const [advance] = await getAdvances(BORROWER);
    expect(advance.repaid).toBe(advance.principal);
    const [last] = await getTransactions(BORROWER);
    expect(last).toMatchObject({ kind: "repayment", amount: 600_000_000n, status: "completed" });
  });

  it("error: both reads fail", async () => {
    window.localStorage.setItem("forepay.mock.ledger", "error");
    await expect(getAdvances(BORROWER)).rejects.toThrow();
    await expect(getTransactions(BORROWER)).rejects.toThrow();
  });

  it("anything else reads as the default", async () => {
    window.localStorage.setItem("forepay.mock.ledger", "paused");
    expect(await getAdvances(BORROWER)).toHaveLength(1);
  });
});

describe("the #16 API's advances", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** `getAdvances` against an API that answers `rows`, read with the API set at import time. */
  async function advancesFrom(rows: object[]) {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(rows)));
    vi.resetModules();
    const client = await import("./client");
    return client.getAdvances(BORROWER);
  }

  const row = {
    nullifier: "aa",
    borrower: BORROWER,
    windowStart: "2026-07-01",
    windowEnd: "2026-09-30",
    revenueCents: "36000",
    principal: "900000000",
    repaid: "0",
    openedAt: "1791806400",
    txHash: "adv",
  };

  it("keeps AdMob's source (#107)", async () => {
    const [advance] = await advancesFrom([{ ...row, source: "AdMob" }]);
    expect(advance.source).toBe("AdMob");
    expect(advance.revenueCents).toBe(36_000n);
  });

  it("reads a row without a source, from an API before #107, as AdSense", async () => {
    const [advance] = await advancesFrom([row]);
    expect(advance.source).toBe("AdSense");
  });

  it("reads a source it does not know as AdSense", async () => {
    const [advance] = await advancesFrom([{ ...row, source: "YouTube" }]);
    expect(advance.source).toBe("AdSense");
  });
});
