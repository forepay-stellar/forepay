import { describe, expect, it } from "vitest";
import { WalletError, WalletSignError } from "@/lib/stellar/wallet-error";
import { ContractError, MissingConfigError, SimulationError, TransactionFailedError } from "@/lib/stellar/contract";
import { repayFailureCopy } from "./failures";

describe("repayFailureCopy", () => {
  it("names a contract refusal with the contract's own code", () => {
    expect(repayFailureCopy(new ContractError(51, "Error(Contract, #51)"), false).title).toBe("That is more than you owe");
    expect(repayFailureCopy(new ContractError(50, "Error(Contract, #50)"), false).title).toBe("We could not find this advance");
  });

  it("reads the USDC token contract's refusals as its own, never as advance codes", () => {
    expect(repayFailureCopy(new ContractError(10, "Error(Contract, #10)"), false)).toEqual({
      title: "Your wallet does not hold enough USDC",
      body: "Nothing was charged. Add USDC to your wallet, then try again.",
    });
    expect(repayFailureCopy(new ContractError(13, "Error(Contract, #13)"), false).title).toBe("Your wallet needs to accept USDC first");
    expect(repayFailureCopy(new ContractError(11, "Error(Contract, #11)"), false).title).toBe("Your USDC is on hold");
    expect(repayFailureCopy(new ContractError(6, "Error(Contract, #6)"), false)).toEqual({
      title: "This Stellar account does not exist yet",
      body: "Nothing was charged. Fund the wallet with test XLM, then try again.",
    });
    // 1 is the SAC's InternalError as much as the advance contract's NotInitialized: neither is said.
    expect(repayFailureCopy(new ContractError(1, "Error(Contract, #1)"), false).title).toBe("The repayment did not go through");
    expect(repayFailureCopy(new ContractError(12, "Error(Contract, #12)"), false).title).toBe("The repayment did not go through");
    expect(repayFailureCopy(new ContractError(52, "Error(Contract, #52)"), false).title).toBe("Enter an amount above zero");
  });

  it("says nothing was charged only when the ledger did not take the fee", () => {
    const refused = repayFailureCopy(new TransactionFailedError("The network did not accept the transaction (ERROR)", false), true);
    expect(refused).toEqual({ title: "The repayment did not go through", body: "Nothing was charged. Try again in a moment." });
    const charged = repayFailureCopy(new TransactionFailedError("The transaction failed on the ledger", true), true);
    expect(charged.body).toMatch(/kept the tiny network fee/);
    expect(charged.body).not.toMatch(/Nothing was charged/);
  });

  it("promises nothing about a transaction that may still land", () => {
    const late = repayFailureCopy(new TransactionFailedError("The transaction was not confirmed (NOT_FOUND)", false, true), true);
    expect(late.title).toBe("Your repayment is not confirmed yet");
    expect(repayFailureCopy(new Error("fetch failed"), true).title).toBe("Your repayment is not confirmed yet");
  });

  it("tells a declined signature apart from a node that did not answer", () => {
    const declined = new WalletSignError(new WalletError("The user rejected this request.", -4));
    expect(repayFailureCopy(declined, false).title).toBe("You declined the repayment");
    expect(repayFailureCopy(new Error("fetch failed"), false).title).toBe("We could not reach Stellar");
  });

  it("names the wallet's own trouble, in the words #20 uses, never as a network failure", () => {
    const locked = new WalletSignError(new WalletError("Freighter is locked"));
    expect(repayFailureCopy(locked, false, "Freighter")).toEqual({
      title: "Unlock Freighter first",
      body: "Open Freighter, enter your password, then repay again.",
    });
    const mainnet = new WalletSignError(new Error("network passphrase mismatch"));
    expect(repayFailureCopy(mainnet, false, "xBull").title).toBe("Switch your wallet to testnet");
    expect(repayFailureCopy(mainnet, false, "xBull").body).toContain("Change the network in xBull");
    const silent = new WalletSignError(new Error("timeout"));
    expect(repayFailureCopy(silent, false, "Rabet").title).toBe("Rabet did not answer");
    // With no wallet name, a title still starts with a capital, and a body keeps it lower case.
    expect(repayFailureCopy(silent, false).title).toBe("Your wallet did not answer");
    expect(repayFailureCopy(locked, false).body).toBe("Open your wallet, enter your password, then repay again.");
  });

  it("names a simulation Stellar could not run, and a build missing its addresses", () => {
    expect(repayFailureCopy(new SimulationError("HostError: Error(Auth, InvalidAction)"), false).title).toBe(
      "Stellar could not run this request",
    );
    expect(repayFailureCopy(new MissingConfigError("NEXT_PUBLIC_ADVANCE_CONTRACT_ID"), false).title).toBe(
      "Forepay is not set up on this page",
    );
  });

  it("never uses a colon, semicolon or em dash", () => {
    const all = [
      repayFailureCopy(new TransactionFailedError("x", true), true),
      repayFailureCopy(new TransactionFailedError("x", false), true),
      repayFailureCopy(new TransactionFailedError("not confirmed", false, true), true),
      repayFailureCopy(new WalletSignError(new WalletError("rejected", -4)), false),
      repayFailureCopy(new WalletSignError(new WalletError("Freighter is locked")), false, "Freighter"),
      repayFailureCopy(new WalletSignError(new Error("network passphrase mismatch")), false, "Freighter"),
      repayFailureCopy(new WalletSignError(new Error("timeout")), false, "Freighter"),
      repayFailureCopy(new SimulationError("x"), false),
      repayFailureCopy(new MissingConfigError("X"), false),
      repayFailureCopy(new Error("x"), false),
      ...[10, 11, 13, 99].map((code) => repayFailureCopy(new ContractError(code, "x"), false)),
    ];
    for (const c of all) expect(`${c.title} ${c.body}`).not.toMatch(/[:;—·]/);
  });
});
