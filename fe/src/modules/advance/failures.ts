import { classifySignError, type ProveFailure } from "@/lib/errors";
import { formatUsd } from "@/lib/format";
import { ReclaimCancelledError, RelayError, RelayNotReadyError, type RelayErrorCode } from "@/lib/reclaim";
import { ContractError, MissingConfigError, SimulationError, TransactionFailedError } from "@/lib/stellar/contract";
import { WalletSignError } from "@/lib/stellar/wallet-error";

/**
 * Why 02 Prove and accept stopped: a contract refusal (its code from `docs/interface.md` §7), one of
 * the failures around it, or an offer too small to send.
 */
export type AdvanceFailure = { code: number } | { kind: ProveFailure } | { kind: "tooSmall"; revenue: string };

/** A failure that is not about the wallet: the Reclaim session, the contract, the network, the build. */
function sorted(e: unknown): AdvanceFailure {
  if (e instanceof ReclaimCancelledError) return { kind: "cancelled" };
  if (e instanceof RelayNotReadyError) return { kind: "relayNotReady" };
  if (e instanceof RelayError) {
    const kinds: Partial<Record<RelayErrorCode, ProveFailure>> = {
      token: "googleSignIn",
      account: "noAdsense",
      running: "proofRunning",
      gone: "proofGone",
      busy: "relayBusy",
      unconfigured: "relayNotReady",
      unreachable: "relayUnreachable",
      googleUnavailable: "googleUnavailable",
      popupBlocked: "popupBlocked",
    };
    return { kind: kinds[e.code] ?? "relayFailed" };
  }
  if (e instanceof ContractError) return { code: e.code };
  if (e instanceof SimulationError) return { kind: "simulationFailed" };
  if (e instanceof MissingConfigError) return { kind: "notConfigured" };
  // "We could not reach Stellar" only when the request truly got no answer; anything else is named as
  // unexpected rather than offered a Try again that cannot work (review S3).
  return isTransportError(e) ? { kind: "unreachable" } : { kind: "unexpected" };
}

/**
 * A request that got no usable answer from the network or the RPC node: the browser's fetch failing,
 * or the SDK's HTTP client with no response, a timeout, or a busy or broken server (429, 5xx).
 */
export function isTransportError(e: unknown): boolean {
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) return true;
  if (e && typeof e === "object" && "isAxiosError" in e && (e as { isAxiosError: unknown }).isAxiosError) {
    const status = (e as { response?: { status?: number } }).response?.status;
    return status === undefined || status === 429 || status >= 500;
  }
  return false;
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
    const kinds = { declined: "declined", locked: "walletLocked", wrongNetwork: "walletWrongNetwork", noAnswer: "walletNoAnswer" } as const;
    return { kind: kinds[classifySignError(e)] };
  }
  if (e instanceof TransactionFailedError) {
    return { kind: e.unconfirmed ? "unconfirmed" : e.charged ? "charged" : "refused" };
  }
  if (e instanceof ContractError) return { code: e.code };
  // Signed but no clean answer: it may still land, so say only what is known.
  if (signed) return { kind: "unconfirmed" };
  return sorted(e);
}

/**
 * Back from a failed accept may return to the offer only if the proof still stands. Of the contract's
 * refusals only 41 (no USDC trustline) leaves it so: the panel says "Your proof is still valid", and
 * nothing was spent.
 */
export function proofStillGood(failure: AdvanceFailure): boolean {
  if (!("kind" in failure)) return failure.code === 41;
  // Not "charged": a transaction that failed on the ledger was usually refused there by the contract
  // (the proof expired or was used between the check and the ledger), so the offer may be gone.
  return ["refused", "unreachable", "simulationFailed", "walletLocked", "walletWrongNetwork", "walletNoAnswer"].includes(
    failure.kind,
  );
}
