import { USER_CLOSED_MODAL, WalletError, type WalletSignError } from "./stellar/wallet-error";

/**
 * Every failure the creator can meet, in the plain words of the design brief (§3, rule 4, and the
 * onboarding "States and interactions" board). One entry per cause: "Something went wrong" is not
 * allowed. UI copy carries no colon, semicolon, em dash or middle dot.
 */
/** Connecting did not give us a usable wallet. Shown on 1b. */
export type ConnectFailure = "declined" | "locked" | "wrongNetwork" | "notFound" | "unknown";
/** A wallet is connected, but it cannot receive USDC yet, or checking or fixing that failed. Shown on 1c. */
export type ConnectedFailure =
  | "unfunded"
  | "fundFailed"
  | "readFailed"
  | "trustlineFailed"
  | "trustlineCharged"
  | "trustlineUnconfirmed"
  | "signLocked"
  | "signWrongNetwork"
  | "signNoAnswer";
export type WalletFailure = ConnectFailure | ConnectedFailure;

export type FailureCopy = { title: string; body: string };

export function failureCopy(kind: WalletFailure, walletName = "Freighter"): FailureCopy {
  switch (kind) {
    case "declined":
      return { title: "You closed the wallet window", body: "Nothing was shared. Connect again when you are ready." };
    case "locked":
      return {
        title: `Unlock ${walletName} first`,
        body: `Open ${walletName}, enter your password, then connect again.`,
      };
    case "wrongNetwork":
      return {
        title: "Switch your wallet to testnet",
        body: `Forepay is a demo that runs on Stellar testnet. Change the network in ${walletName}, then try again.`,
      };
    case "notFound":
      return {
        title: "Install a Stellar wallet",
        body: "Freighter is a free browser extension. Install it, create a testnet account, then come back here.",
      };
    case "unfunded":
      return {
        title: "Add test XLM to your wallet first",
        body: "A new Stellar wallet needs a little test XLM before it can accept USDC. It is free on testnet.",
      };
    case "fundFailed":
      return {
        title: "We could not add test XLM",
        body: "The testnet faucet did not answer. Try again in a moment.",
      };
    case "readFailed":
      return {
        title: "We could not check your wallet",
        body: "Stellar did not answer. Check your connection, then try again.",
      };
    case "trustlineFailed":
      // Only when the transaction never reached the ledger. Then nothing was charged.
      return {
        title: "The transaction did not go through",
        body: "Nothing was charged. Try again in a moment.",
      };
    case "trustlineUnconfirmed":
      // Sent, but not confirmed while we waited. It may still land, so promise nothing either way.
      return {
        title: "Your approval is not confirmed yet",
        body: "Stellar has not confirmed it so far. Check again in a moment.",
      };
    case "trustlineCharged":
      // The ledger took it and it failed there, so the network fee was spent.
      return {
        title: "USDC was not allowed",
        body: "Stellar kept the tiny network fee, but your wallet still cannot receive USDC. Try again in a moment.",
      };
    case "signLocked":
      return {
        title: `Unlock ${walletName} first`,
        body: `Open ${walletName}, enter your password, then allow USDC again.`,
      };
    case "signWrongNetwork":
      return {
        title: "Switch your wallet to testnet",
        body: `Forepay is a demo that runs on Stellar testnet. Change the network in ${walletName}, then allow USDC again.`,
      };
    case "signNoAnswer":
      return {
        title: `${walletName} did not answer`,
        body: "Nothing was sent. Try again, or use a different wallet.",
      };
    case "unknown":
      return {
        title: "Your wallet did not connect",
        body: `${walletName} did not answer. Try again, or use a different wallet.`,
      };
  }
}

/**
 * Sort a wallet rejection into one of the connect failures. `null` means "not a failure": the creator
 * closed the picker, which is a choice, not an error (ARCHITECTURE.md §5).
 *
 * Wallets do not share error codes, so beyond the kit's own picker code this reads the message, and
 * anything it does not recognise stays `unknown` rather than being guessed into a nicer bucket.
 */
export function classifyConnectError(e: unknown): ConnectFailure | null {
  const err = e instanceof WalletError ? e : null;
  const message = (err?.message ?? (e instanceof Error ? e.message : String(e))).toLowerCase();
  if (err?.code === USER_CLOSED_MODAL && message.includes("closed the modal")) return null;
  if (/locked|unlock|password/.test(message)) return "locked";
  // Freighter answers an empty address when it is locked or has not granted access (kit code -3).
  if (err?.code === -3) return "locked";
  if (/reject|declin|denied|cancel/.test(message)) return "declined";
  if (/not installed|not available|not connected|no wallet/.test(message)) return "notFound";
  return "unknown";
}

/**
 * Why the wallet threw while it was asked to sign: one answer for allowing USDC (#19), accepting an
 * advance (#20) and repaying (#21), so each words the same wallet trouble the same way. Wallets share
 * no error codes; a network mismatch is named in the message when it is named at all.
 */
export type SignFailure = "declined" | "locked" | "wrongNetwork" | "noAnswer";

export function classifySignError(e: WalletSignError): SignFailure {
  if (/passphrase|wrong network|network mismatch|mainnet|public global/i.test(e.message)) return "wrongNetwork";
  switch (classifyConnectError(e.cause)) {
    case "declined":
      return "declined";
    case "locked":
      return "locked";
    case "wrongNetwork":
      return "wrongNetwork";
    default:
      return "noAnswer";
  }
}

/** True when the creator turned down a signature in the wallet. Not a failure to show, just a stop. */
export function isSignatureDeclined(e: unknown): boolean {
  const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /reject|declin|denied|cancel/.test(message);
}

/**
 * The advance contract's refusals (`docs/interface.md` §7), in the brief's words (§3, rule 4, and the
 * "Prove and accept" board). Shared by #20 and #21. Codes 1 to 6 are admin and upgrade errors a
 * creator can never cause, so they fall to the generic sentence.
 */
export function contractFailureCopy(code: number): FailureCopy {
  switch (code) {
    case 10:
      return { title: "Advances are not open yet", body: "Forepay is not taking AdSense proofs yet. Try again later." };
    case 11:
    case 14:
      return {
        title: "We could not confirm this proof with Google's data",
        body: "Nothing was charged. Prove your revenue again, it takes a minute.",
      };
    case 12:
      return { title: "This proof expired", body: "Prove your revenue again, it takes a minute." };
    case 13:
      return {
        title: "This proof is dated in the future",
        body: "Check the clock on your computer, then prove your revenue again.",
      };
    case 20:
      return {
        title: "This proof was already used for an advance",
        body: "Each three months of revenue backs one advance. You can repay it from the Repayment tab.",
      };
    case 30:
      return {
        title: "We could not read your revenue",
        body: "The figure from AdSense was not a plain amount. Nothing was charged.",
      };
    case 31:
      return {
        title: "There is nothing to borrow yet",
        body: "Your revenue gives an advance under 1 USDC. Your proof was not used, so you can try again next period.",
      };
    case 40:
      return { title: "Advances are paused right now", body: "Try again later. Nothing was charged." };
    case 41:
      return { title: "Your wallet needs to accept USDC first", body: "Allow USDC in your wallet, then try again." };
    case 50:
      return { title: "We could not find this advance", body: "Open the Repayment tab again to load your advances." };
    case 51:
      return { title: "That is more than you owe", body: "Enter an amount up to what is still outstanding." };
    case 52:
      return { title: "Enter an amount above zero", body: "Repayments can be any amount above zero." };
    default:
      return { title: "The transaction did not go through", body: "Nothing was charged. Try again in a moment." };
  }
}
