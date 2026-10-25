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
  // The connect reasons that also mean something at signing carry over; anything else is no answer.
  const reason = classifyConnectError(e.cause);
  return reason === "declined" || reason === "locked" || reason === "wrongNetwork" ? reason : "noAnswer";
}

/** True when the creator turned down a signature in the wallet. Not a failure to show, just a stop. */
export function isSignatureDeclined(e: unknown): boolean {
  const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /reject|declin|denied|cancel/.test(message);
}

/**
 * The advance contract's refusals (`docs/interface.md` §7), in the brief's words (§3, rule 4, and the
 * "Prove and accept / States and interactions" board, word for word). Shared by #20 and #21. Codes 1 to 6 are admin and upgrade errors a
 * creator can never cause, so they fall to the generic sentence.
 */
export function contractFailureCopy(code: number): FailureCopy {
  switch (code) {
    case 10:
      return { title: "Advances are not open yet", body: "Forepay is not taking AdSense proofs yet. Try again later." };
    case 11:
    case 14:
      return {
        title: "We could not confirm this proof",
        body: "The revenue could not be matched to Google's data. Try proving again. If it keeps happening, log out of AdSense and back in first.",
      };
    case 12:
      return {
        title: "This proof expired",
        body: "A revenue proof is good for one hour. Prove your revenue again, it takes about a minute.",
      };
    case 13:
      return {
        title: "This proof is dated in the future",
        body: "Check the clock on your computer, then prove your revenue again.",
      };
    case 20:
      return {
        title: "This proof was already used",
        body: "Each three month revenue period can fund one advance. A new period opens when the next quarter ends.",
      };
    case 30:
      return {
        title: "We could not read your revenue",
        body: "The figure from AdSense was not a plain amount. Nothing was charged.",
      };
    case 31:
      return {
        title: "Not enough revenue yet",
        body: "Your revenue gives less than the smallest advance we can send. Your proof was not used.",
      };
    case 40:
      return {
        title: "Advances are paused right now",
        body: "There is not enough USDC in Forepay to send this advance. Your proof was not used. Try again later.",
      };
    case 41:
      return {
        title: "Your wallet needs to accept USDC first",
        body: "Approve USDC in your wallet, then accept the offer again. Your proof is still valid.",
      };
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

/**
 * Everything that can stop 02 Prove and accept that is not a contract code (#20). Contract refusals go
 * through `contractFailureCopy`.
 * - `cancelled`: the creator closed the Reclaim window before the proof was made.
 * - `declined`: the creator turned the signature down in the wallet.
 * - `refused`: the network never took the transaction, so nothing was charged.
 * - `charged`: the ledger took it and it failed there, so the network fee was spent.
 * - `unconfirmed`: sent, but not confirmed within two minutes. It may still land.
 * - `unreachable`: Stellar did not answer (a network or RPC failure).
 * - `simulationFailed`: Stellar answered, but could not run the request, with no contract code to say why.
 * - `notConfigured`: this build is missing an address it needs, so nothing reached the network.
 * - `walletLocked`, `walletWrongNetwork`, `walletNoAnswer`: the wallet could not sign, for that reason.
 * - `relayNotReady`: proofs are meant to come from the #17 relay, and this build cannot reach it.
 * - `googleSignIn`: Google refused the sign-in the relay was handed, for example an expired one.
 * - `noAdsense`: the Google account has no approved AdSense account the relay can read.
 * - `relayFailed`: the relay could not make the proof (busy, or failed on its side). Nothing was saved.
 * - `proofRunning`: a proof for this wallet is already running, started from a tab that lost it.
 * - `proofGone`: the proof this tab was waiting on ended while the creator was away, and is no longer kept.
 * - `relayUnreachable`: the relay did not answer. Not Stellar: nothing on chain was asked.
 * - `googleUnavailable`: Google's sign-in did not load.
 * - `popupBlocked`: the browser blocked Google's sign-in window. The creator closed nothing.
 */
export type ProveFailure =
  | "cancelled"
  | "declined"
  | "refused"
  | "charged"
  | "unconfirmed"
  | "sentUnreachable"
  | "unreachable"
  | "unexpected"
  | "simulationFailed"
  | "notConfigured"
  | "walletLocked"
  | "walletWrongNetwork"
  | "walletNoAnswer"
  | "relayNotReady"
  | "googleSignIn"
  | "noAdsense"
  | "relayFailed"
  | "proofRunning"
  | "proofGone"
  | "relayUnreachable"
  | "googleUnavailable"
  | "popupBlocked";

export function proveFailureCopy(kind: ProveFailure, walletName = "Freighter"): FailureCopy {
  switch (kind) {
    case "cancelled":
      return {
        title: "You closed the AdSense window",
        body: "Nothing was read or saved. Start again when you are ready.",
      };
    case "declined":
      return {
        title: `You declined in ${walletName}`,
        body: "Nothing was sent. Your offer is still here for the next hour.",
      };
    case "refused":
      return {
        title: "The transaction did not go through",
        body: "Nothing was charged and no USDC moved. Try again in a moment.",
      };
    case "charged":
      return {
        title: "The transaction did not go through",
        body: "Stellar kept the tiny network fee, but no USDC moved. Try again in a moment.",
      };
    case "unconfirmed":
      return {
        title: "This took too long",
        body: "We stopped waiting. Check History before you try again. The same proof can never pay out twice.",
      };
    case "sentUnreachable":
      // Coming back to an advance already sent, with no answer from Stellar. It was sent, so this does
      // not say nothing was charged, and Try again waits on the same transaction: nothing is sent twice.
      return {
        title: "We could not reach Stellar",
        body: "Your advance was already sent. Check your connection, then try again to see whether it landed.",
      };
    case "unreachable":
      return {
        title: "We could not reach Stellar",
        body: "Nothing was charged. Check your connection, then try again.",
      };
    case "unexpected":
      // Not the network: an answer nothing here recognises (an account that is not there, a reply in
      // a shape we did not expect). Trying again would meet it again, so this does not offer that.
      return {
        title: "We got an answer we did not expect",
        body: "Nothing was charged. Go back and start again. If it keeps happening, reconnect your wallet.",
      };
    case "simulationFailed":
      return {
        title: "Stellar could not run this request",
        body: "Nothing was charged and no USDC moved. Try again in a moment.",
      };
    case "notConfigured":
      return {
        title: "Forepay is not set up on this page",
        body: "This copy of the app is missing a Stellar address. Nothing was charged.",
      };
    case "walletLocked":
      return {
        title: `Unlock ${walletName} first`,
        body: `Open ${walletName}, enter your password, then accept the offer again.`,
      };
    case "walletWrongNetwork":
      return {
        title: "Switch your wallet to testnet",
        body: `Forepay runs on Stellar testnet. Change the network in ${walletName}, then accept the offer again.`,
      };
    case "walletNoAnswer":
      return {
        title: `${walletName} did not answer`,
        body: "Nothing was sent. Try again, or reconnect your wallet from the wallet menu.",
      };
    case "relayNotReady":
      return {
        title: "Proving revenue is not open yet",
        body: "Forepay cannot read AdSense revenue yet. Try again later.",
      };
    case "googleSignIn":
      return {
        title: "Google did not let us read AdSense",
        body: "Sign in again and allow Forepay to see your AdSense reports. Nothing was saved.",
      };
    case "noAdsense":
      return {
        title: "We found no approved AdSense account",
        body: "Sign in with the Google account that owns an approved AdSense account, then try again.",
      };
    case "relayFailed":
      return {
        title: "We could not finish your proof",
        body: "Nothing was saved or charged. Try again in a few minutes.",
      };
    case "proofRunning":
      return {
        title: "Your proof is already being made",
        body: "We started one for this wallet earlier. Nothing was charged. Try again in a few minutes to pick it up.",
      };
    case "proofGone":
      return {
        title: "Your earlier proof has ended",
        body: "It finished while you were away, and is no longer kept. Prove your revenue again, it takes about a minute. Nothing was charged.",
      };
    case "relayUnreachable":
      return {
        title: "We could not reach Forepay",
        body: "Nothing was saved or charged. Check your connection, then try again.",
      };
    case "googleUnavailable":
      return {
        title: "Google sign-in did not load",
        body: "Nothing was read or saved. Check your connection, then try again.",
      };
    case "popupBlocked":
      return {
        title: "Your browser blocked the Google window",
        body: "Allow pop-ups for Forepay, then try again. Nothing was read or saved.",
      };
  }
}

/**
 * "Your wallet needs to accept USDC first", found while checking the proof, before any offer was shown.
 * The board's words for it ("accept the offer again") belong to an accept.
 */
export function noTrustlineBeforeOfferCopy(): FailureCopy {
  return {
    title: contractFailureCopy(41).title,
    body: "Approve USDC in your wallet, then we will show your offer. Your proof is still valid.",
  };
}

/**
 * "Not enough revenue yet", with the creator's own figure (`$3.20`), as the board shows it. The rate
 * and the minimum are the contract's (`share`, `minimum`: `25%`, `1 USDC`), and left out when unknown.
 */
export function tooSmallCopy(revenue: string, terms?: { share: string; minimum: string }): FailureCopy {
  return {
    title: contractFailureCopy(31).title,
    body: terms
      ? `${terms.share} of ${revenue} is under ${terms.minimum}, the smallest advance we can send. Your proof was not used.`
      : `${revenue} is too little for the smallest advance we can send. Your proof was not used.`,
  };
}
