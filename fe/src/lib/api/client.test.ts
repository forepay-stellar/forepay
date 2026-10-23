import { afterEach, describe, expect, it } from "vitest";
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
