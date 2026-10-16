import { classifyConnectError, type ProveFailure } from "@/lib/errors";
import { formatUsd } from "@/lib/format";
import { ReclaimCancelledError, RelayNotReadyError } from "@/lib/reclaim";
import { ContractError, MissingConfigError, SimulationError, TransactionFailedError } from "@/lib/stellar/contract";

/**
 * Why 02 Prove and accept stopped: a contract refusal (its code from `docs/interface.md` §7), one of
 * the failures around it, or an offer too small to send.
 */
export type AdvanceFailure = { code: number } | { kind: ProveFailure } | { kind: "tooSmall"; revenue: string };

/** The wallet threw while it was asked to sign. Keeps wallet trouble apart from network trouble. */
export class WalletSignError extends Error {
  cause: unknown;
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "WalletSignError";
    this.cause = cause;
  }
}

/** A failure that is not about the wallet: the Reclaim session, the contract, the network, the build. */
function sorted(e: unknown): AdvanceFailure {
  if (e instanceof ReclaimCancelledError) return { kind: "cancelled" };
  if (e instanceof RelayNotReadyError) return { kind: "relayNotReady" };
  if (e instanceof ContractError) return { code: e.code };
  if (e instanceof SimulationError) return { kind: "simulationFailed" };
  if (e instanceof MissingConfigError) return { kind: "notConfigured" };
  // What is left is a request that never got an answer: the network or the RPC node.
  return { kind: "unreachable" };
}

/** Proving, or checking the proof before the offer. A quote under 1 USDC is "too small", not an error. */
export function proveFailure(e: unknown, revenueUsd?: string): AdvanceFailure {
  if (e instanceof ContractError && e.code === 31 && revenueUsd !== undefined) {
    return { kind: "tooSmall", revenue: formatUsd(revenueUsd) };
  }
  return sorted(e);
}

/** Accepting. `signed` is true once the wallet handed back a signature, so the transaction may be out. */
export function acceptFailure(e: unknown, signed: boolean): AdvanceFailure {
  if (e instanceof WalletSignError) {
    // Wallets share no error codes. A network mismatch is named in the message when it is named at all.
    if (/passphrase|network/i.test(e.message)) return { kind: "walletWrongNetwork" };
    switch (classifyConnectError(e.cause)) {
      case "declined":
        return { kind: "declined" };
      case "locked":
        return { kind: "walletLocked" };
      case "wrongNetwork":
        return { kind: "walletWrongNetwork" };
      default:
        return { kind: "walletNoAnswer" };
    }
  }
  if (e instanceof TransactionFailedError) {
    return { kind: e.unconfirmed ? "unconfirmed" : e.charged ? "charged" : "refused" };
  }
  if (e instanceof ContractError) return { code: e.code };
  // Signed but no clean answer: it may still land, so say only what is known.
  if (signed) return { kind: "unconfirmed" };
  return sorted(e);
}

/** Back from a failed accept may return to the offer only if the contract never refused the proof. */
export function proofStillGood(failure: AdvanceFailure): boolean {
  if (!("kind" in failure)) return false;
  return ["refused", "charged", "unreachable", "simulationFailed", "walletLocked", "walletWrongNetwork", "walletNoAnswer"].includes(
    failure.kind,
  );
}
