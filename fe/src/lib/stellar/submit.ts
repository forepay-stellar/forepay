import { TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "./network";

/**
 * Sending a signed transaction and waiting for the ledger, once for every write in the app: the USDC
 * trustline (#19), `request_advance` (#20) and `repay` (#21). Each caller turns `SubmitError` into its
 * own words.
 *
 * - `refused`: it never reached the ledger, so nothing was charged.
 * - `failed`: the ledger took it and it failed there, so the network fee was spent.
 * - `unconfirmed`: it may be out. A request with no answer, or a ledger that has not shown it yet, says
 *   nothing either way, so it is never reported as free.
 */
export type SubmitOutcome = "refused" | "failed" | "unconfirmed";

export class SubmitError extends Error {
  outcome: SubmitOutcome;
  constructor(message: string, outcome: SubmitOutcome) {
    super(message);
    this.name = "SubmitError";
    this.outcome = outcome;
  }
}

export type Landed = { hash: string; result: rpc.Api.GetSuccessfulTransactionResponse };

/**
 * Send what the wallet signed and wait for the ledger. `onSent` fires with the hash once the network
 * has taken it, before the wait, so a caller can remember a transaction that is out (#20 keeps it
 * across leaving the page). `attempts` is the wait, about one a second.
 */
export async function submitSigned(
  server: rpc.Server,
  signedXdr: string,
  { attempts, onSent }: { attempts: number; onSent?: (hash: string) => void },
): Promise<Landed> {
  // A wallet answer that is not a transaction never left the page.
  let signed: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  } catch {
    throw new SubmitError("The wallet did not return a transaction", "refused");
  }
  let sent: rpc.Api.SendTransactionResponse;
  try {
    sent = await server.sendTransaction(signed);
  } catch {
    throw new SubmitError("Sending got no answer", "unconfirmed");
  }
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new SubmitError(`The network did not accept the transaction (${sent.status})`, "refused");
  }
  onSent?.(sent.hash);
  return waitFor(server, sent.hash, attempts);
}

/** Wait for a transaction that is already out, by its hash: after sending, or after coming back to it. */
export async function waitFor(server: rpc.Server, hash: string, attempts: number): Promise<Landed> {
  let result: rpc.Api.GetTransactionResponse;
  try {
    result = await server.pollTransaction(hash, { attempts });
  } catch {
    throw new SubmitError("Waiting for the ledger got no answer", "unconfirmed");
  }
  if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash, result };
  if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new SubmitError("The transaction failed on the ledger", "failed");
  }
  throw new SubmitError(`The transaction was not confirmed (${result.status})`, "unconfirmed");
}
