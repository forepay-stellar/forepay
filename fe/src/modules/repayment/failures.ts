import { classifySignError, contractFailureCopy, type FailureCopy } from "@/lib/errors";
import { ContractError, MissingConfigError, SimulationError, TransactionFailedError } from "@/lib/stellar/contract";
import { WalletSignError } from "@/lib/stellar/wallet-error";

/**
 * Why a repayment did not land, in the brief's words (board row 3, "Did not go through"). One sentence
 * per cause, and "Nothing was charged" only when that is known to be true:
 *
 * - before the wallet signed, nothing can have been sent;
 * - a contract refusal comes from the simulation, before anything is sent;
 * - `TransactionFailedError.charged` says whether the ledger took the fee, `.unconfirmed` whether it
 *   was sent and never confirmed;
 * - a transaction that was sent but not confirmed while we waited may still land, so it promises nothing.
 *
 * - the wallet's own trouble (declined, locked, wrong network, silent) is told apart from the network's,
 *   in the words #20 uses for the same causes;
 *
 * `signed` is whether the wallet had already handed back a signed transaction when it failed.
 */
export function repayFailureCopy(error: unknown, signed: boolean, walletName: string | null = null): FailureCopy {
  if (error instanceof ContractError) return refusalCopy(error.code);
  if (error instanceof TransactionFailedError) {
    if (error.charged) {
      return {
        title: "The repayment did not go through",
        body: "Stellar kept the tiny network fee, but no USDC left your wallet. Try again in a moment.",
      };
    }
    if (error.unconfirmed) return unconfirmed;
    return { title: "The repayment did not go through", body: "Nothing was charged. Try again in a moment." };
  }
  if (error instanceof SimulationError) {
    return {
      title: "Stellar could not run this request",
      body: "Nothing was charged and no USDC left your wallet. Try again in a moment.",
    };
  }
  if (error instanceof MissingConfigError) {
    return {
      title: "Forepay is not set up on this page",
      body: "This copy of the app is missing a Stellar address. Nothing was charged.",
    };
  }
  if (error instanceof WalletSignError) return walletCopy(error, walletName);
  if (!signed) {
    return { title: "We could not reach Stellar", body: "Nothing was charged. Check your connection, then try again." };
  }
  return unconfirmed;
}

/**
 * `repay` itself only refuses with 1 NotInitialized, 50 UnknownAdvance, 51 RepaymentExceedsOutstanding
 * and 52 AmountNotPositive (`sc/advance/src/lib.rs`). Any other `Error(Contract, #N)` in a repay
 * simulation is raised by the USDC token contract it calls to move the money, whose numbers mean
 * something else (soroban-env-host `builtin_contracts/contract_error.rs`): 10 BalanceError, 11
 * BalanceDeauthorizedError, 13 TrustlineMissingError. Reading those as advance codes would tell a
 * creator who is short of USDC that "Advances are not open yet".
 *
 * Checked on 2026-10-16 against stellar/rs-soroban-env at fced8a124103, the last commit touching that
 * file. The Stellar Raven MCP was not available to confirm it.
 */
const REPAY_CODES = new Set([1, 50, 51, 52]);

function refusalCopy(code: number): FailureCopy {
  if (REPAY_CODES.has(code)) return contractFailureCopy(code);
  switch (code) {
    case 10:
      return {
        title: "Your wallet does not hold enough USDC",
        body: "Nothing was charged. Add USDC to your wallet, then try again.",
      };
    case 11:
      return {
        title: "The USDC in your wallet cannot move right now",
        body: "Nothing was charged. The USDC issuer has paused this wallet.",
      };
    case 13:
      return {
        title: "Your wallet needs to accept USDC first",
        body: "Nothing was charged. Allow USDC in your wallet, then try again.",
      };
    default:
      return { title: "The repayment did not go through", body: "Nothing was charged. Try again in a moment." };
  }
}

/** The wallet threw before handing back a signature, so nothing was sent. */
function walletCopy(error: WalletSignError, walletName: string | null): FailureCopy {
  // A title starts with the name, a body uses it mid-sentence.
  const Name = walletName ?? "Your wallet";
  const name = walletName ?? "your wallet";
  switch (classifySignError(error)) {
    case "declined":
      return { title: "You declined the repayment", body: "Nothing was charged. Repay again when you are ready." };
    case "locked":
      return { title: `Unlock ${name} first`, body: `Open ${name}, enter your password, then repay again.` };
    case "wrongNetwork":
      return {
        title: "Switch your wallet to testnet",
        body: `Forepay runs on Stellar testnet. Change the network in ${name}, then repay again.`,
      };
    case "noAnswer":
      return {
        title: `${Name} did not answer`,
        body: "Nothing was sent. Try again, or reconnect your wallet from the wallet menu.",
      };
  }
}

const unconfirmed: FailureCopy = {
  title: "Your repayment is not confirmed yet",
  body: "Stellar has not confirmed it so far. The balance updates here once it does.",
};
