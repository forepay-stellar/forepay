import { contractFailureCopy, isSignatureDeclined, type FailureCopy } from "@/lib/errors";
import { ContractError, TransactionFailedError } from "@/lib/stellar/contract";

/**
 * Why a repayment did not land, in the brief's words (board row 3, "Did not go through"). One sentence
 * per cause, and "Nothing was charged" only when that is known to be true:
 *
 * - before the wallet signed, nothing can have been sent;
 * - `TransactionFailedError.charged` says whether the ledger took the fee;
 * - a transaction that was sent but not confirmed while we waited may still land, so it promises nothing.
 *
 * `signed` is whether the wallet had already handed back a signed transaction when it failed.
 */
export function repayFailureCopy(error: unknown, signed: boolean): FailureCopy {
  if (error instanceof ContractError) return contractFailureCopy(error.code);
  if (error instanceof TransactionFailedError) {
    if (error.charged) {
      return {
        title: "The repayment did not go through",
        body: "Stellar kept the tiny network fee, but no USDC left your wallet. Try again in a moment.",
      };
    }
    if (/not confirmed/i.test(error.message)) return unconfirmed;
    return { title: "The repayment did not go through", body: "Nothing was charged. Try again in a moment." };
  }
  if (!signed && isSignatureDeclined(error)) {
    return { title: "You declined the repayment", body: "Nothing was charged. Repay again when you are ready." };
  }
  if (!signed) {
    return { title: "We could not reach Stellar", body: "Nothing was charged. Check your connection, then try again." };
  }
  return unconfirmed;
}

const unconfirmed: FailureCopy = {
  title: "Your repayment is not confirmed yet",
  body: "Stellar has not confirmed it so far. The balance updates here once it does.",
};
