import { describe, expect, it } from "vitest";
import { WalletError } from "@/lib/stellar/wallet-error";
import { ContractError, TransactionFailedError } from "@/lib/stellar/contract";
import { repayFailureCopy } from "./failures";

describe("repayFailureCopy", () => {
  it("names a contract refusal with the contract's own code", () => {
    expect(repayFailureCopy(new ContractError(51, "Error(Contract, #51)"), false).title).toBe("That is more than you owe");
    expect(repayFailureCopy(new ContractError(50, "Error(Contract, #50)"), false).title).toBe("We could not find this advance");
  });

  it("says nothing was charged only when the ledger did not take the fee", () => {
    const refused = repayFailureCopy(new TransactionFailedError("The network did not accept the transaction (ERROR)", false), true);
    expect(refused).toEqual({ title: "The repayment did not go through", body: "Nothing was charged. Try again in a moment." });
    const charged = repayFailureCopy(new TransactionFailedError("The transaction failed on the ledger", true), true);
    expect(charged.body).toMatch(/kept the tiny network fee/);
    expect(charged.body).not.toMatch(/Nothing was charged/);
  });

  it("promises nothing about a transaction that may still land", () => {
    const late = repayFailureCopy(new TransactionFailedError("The transaction was not confirmed (NOT_FOUND)", false), true);
    expect(late.title).toBe("Your repayment is not confirmed yet");
    expect(repayFailureCopy(new Error("fetch failed"), true).title).toBe("Your repayment is not confirmed yet");
  });

  it("tells a declined signature apart from a node that did not answer", () => {
    expect(repayFailureCopy(new WalletError("The user rejected this request.", -4), false).title).toBe("You declined the repayment");
    expect(repayFailureCopy(new Error("fetch failed"), false).title).toBe("We could not reach Stellar");
  });

  it("never uses a colon, semicolon or em dash", () => {
    const all = [
      repayFailureCopy(new TransactionFailedError("x", true), true),
      repayFailureCopy(new TransactionFailedError("x", false), true),
      repayFailureCopy(new TransactionFailedError("not confirmed", false), true),
      repayFailureCopy(new WalletError("rejected", -4), false),
      repayFailureCopy(new Error("x"), false),
    ];
    for (const c of all) expect(`${c.title} ${c.body}`).not.toMatch(/[:;—·]/);
  });
});
