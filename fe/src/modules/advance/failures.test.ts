import { describe, expect, it } from "vitest";
import { ReclaimCancelledError, RelayError, RelayNotReadyError } from "@/lib/reclaim";
import { ContractError, MissingConfigError, SimulationError, TransactionFailedError } from "@/lib/stellar/contract";
import { WalletError } from "@/lib/stellar/wallet-error";
import { WalletSignError } from "@/lib/stellar/wallet-error";
import { acceptFailure, proofStillGood, proveFailure } from "./failures";

describe("proveFailure", () => {
  it("names each cause on its own", () => {
    expect(proveFailure(new ReclaimCancelledError())).toEqual({ kind: "cancelled" });
    expect(proveFailure(new RelayNotReadyError())).toEqual({ kind: "relayNotReady" });
    expect(proveFailure(new RelayError("token", "x"))).toEqual({ kind: "googleSignIn" });
    expect(proveFailure(new RelayError("account", "x"))).toEqual({ kind: "noAdsense" });
    for (const code of ["busy", "provider", "prove", "audit", "internal"] as const) {
      expect(proveFailure(new RelayError(code, "x"))).toEqual({ kind: "relayFailed" });
    }
    expect(proveFailure(new ContractError(14, "x"))).toEqual({ code: 14 });
    expect(proveFailure(new SimulationError("HostError: Error(Auth, InvalidAction)"))).toEqual({ kind: "simulationFailed" });
    expect(proveFailure(new MissingConfigError("NEXT_PUBLIC_ADVANCE_CONTRACT_ID"))).toEqual({ kind: "notConfigured" });
    expect(proveFailure(new TypeError("Failed to fetch"))).toEqual({ kind: "unreachable" });
  });

  it("says Stellar was unreachable only when the request got no answer", () => {
    const http = (status?: number) => Object.assign(new Error("Request failed"), { isAxiosError: true, response: status ? { status } : undefined });
    expect(proveFailure(http())).toEqual({ kind: "unreachable" });
    expect(proveFailure(http(503))).toEqual({ kind: "unreachable" });
    expect(proveFailure(http(429))).toEqual({ kind: "unreachable" });
    // An answer, just not one we recognise: not the network, and Try again would meet it again.
    expect(proveFailure(http(404))).toEqual({ kind: "unexpected" });
    expect(proveFailure(new Error("Account not found: GA6H…"))).toEqual({ kind: "unexpected" });
    expect(proveFailure(new TypeError("Cannot read properties of undefined"))).toEqual({ kind: "unexpected" });
  });

  it("reads a quote under 1 USDC as too small, with the proven figure", () => {
    expect(proveFailure(new ContractError(31, "x"), "3.2")).toEqual({ kind: "tooSmall", revenue: "$3.20" });
  });
});

describe("acceptFailure", () => {
  it("sorts what the wallet said while signing", () => {
    expect(acceptFailure(new WalletSignError(new WalletError("The user rejected this request.", -4)), false)).toEqual({
      kind: "declined",
    });
    expect(acceptFailure(new WalletSignError(new WalletError("Freighter is locked")), false)).toEqual({ kind: "walletLocked" });
    expect(acceptFailure(new WalletSignError(new Error("network passphrase mismatch")), false)).toEqual({
      kind: "walletWrongNetwork",
    });
    expect(acceptFailure(new WalletSignError(new Error("timeout")), false)).toEqual({ kind: "walletNoAnswer" });
    // A wallet's own connection trouble is not a wrong network.
    expect(acceptFailure(new WalletSignError(new Error("Network request failed")), false)).toEqual({
      kind: "walletNoAnswer",
    });
  });

  it("never reads a network failure before signing as a wallet problem", () => {
    expect(acceptFailure(new TypeError("Failed to fetch"), false)).toEqual({ kind: "unreachable" });
  });

  it("says only what is known once signed", () => {
    expect(acceptFailure(new TypeError("Failed to fetch"), true)).toEqual({ kind: "unconfirmed" });
    expect(acceptFailure(new TransactionFailedError("x", false, true), true)).toEqual({ kind: "unconfirmed" });
    expect(acceptFailure(new TransactionFailedError("x", true), true)).toEqual({ kind: "charged" });
    expect(acceptFailure(new TransactionFailedError("x", false), true)).toEqual({ kind: "refused" });
  });

  it("keeps the contract's code", () => {
    expect(acceptFailure(new ContractError(12, "x"), false)).toEqual({ code: 12 });
  });
});

describe("proofStillGood", () => {
  it("is false once the contract refused the proof", () => {
    expect(proofStillGood({ code: 12 })).toBe(false);
    // No USDC trustline refuses the transfer, not the proof.
    expect(proofStillGood({ code: 41 })).toBe(true);
    expect(proofStillGood({ kind: "unconfirmed" })).toBe(false);
    expect(proofStillGood({ kind: "refused" })).toBe(true);
    // Failed on the ledger: most likely the contract refusing there, so the offer is not trusted.
    expect(proofStillGood({ kind: "charged" })).toBe(false);
    expect(proofStillGood({ kind: "unreachable" })).toBe(true);
  });
});
