import Link from "next/link";
import type { ReactNode } from "react";
import { ErrorPanel } from "@/components/elements/ErrorPanel";
import { IlloAdvancesPaused } from "@/components/illustrations/AdvancesPaused";
import { IlloAllowUsdc } from "@/components/illustrations/AllowUsdc";
import { IlloConnectWallet } from "@/components/illustrations/ConnectWallet";
import { IlloNoAdvanceYet } from "@/components/illustrations/NoAdvanceYet";
import { IlloNothingCharged } from "@/components/illustrations/NothingCharged";
import { IlloProofAlreadyUsed } from "@/components/illustrations/ProofAlreadyUsed";
import { IlloProofExpired } from "@/components/illustrations/ProofExpired";
import { IlloProofNotConfirmed } from "@/components/illustrations/ProofNotConfirmed";
import { IlloSessionCancelled } from "@/components/illustrations/SessionCancelled";
import { Button, button } from "@/components/ui/Button";
import { contractFailureCopy, noTrustlineBeforeOfferCopy, proveFailureCopy, tooSmallCopy } from "@/lib/errors";
import type { Sizing } from "@/lib/stellar/contract";
import { ratePercent, usdcWords } from "../cap";
import type { AdvanceFailure } from "../failures";

/**
 * What a panel's buttons ask for. `prove` starts a new Reclaim session, `back` leaves the failure,
 * `reviewOffer` returns to 2b (the proof is still good), `retry` does again what failed (the check or
 * the accept), `allowUsdc` adds the USDC trustline.
 */
export type FailureAction = "prove" | "back" | "reviewOffer" | "retry" | "allowUsdc";

/**
 * Every failure on the "Prove and accept / States and interactions" board, rows 2 to 4, each with its
 * own illustration, words and next step. Never "Something went wrong" (#20).
 */
export function FailurePanel({
  failure,
  walletName,
  beforeOffer,
  allowing,
  terms,
  onAction,
}: {
  failure: AdvanceFailure;
  /** The contract's rate and minimum, from `sizing()`, for "not enough revenue". */
  terms?: Sizing;
  walletName: string;
  /** Found while checking the proof, before any offer was shown. */
  beforeOffer: boolean;
  /** Allowing USDC is waiting on the wallet. */
  allowing: boolean;
  onAction: (action: FailureAction) => void;
}) {
  const a = {
    onProve: () => onAction("prove"),
    onBack: () => onAction("back"),
    onReviewOffer: () => onAction("reviewOffer"),
    onRetry: () => onAction("retry"),
    onAllowUsdc: () => onAction("allowUsdc"),
  };
  const back = (
    <Button variant="outline" onClick={a.onBack}>
      Back
    </Button>
  );
  const proveAgain = <Button onClick={a.onProve}>Prove again</Button>;

  let illustration: ReactNode;
  let actions: ReactNode;
  // Side by side on a phone only for "Try again" or "Prove again" with "Back": the pairs that fit at 320.
  let row = false;
  let copy;

  if ("code" in failure) {
    copy = contractFailureCopy(failure.code);
    switch (failure.code) {
      case 11:
      case 14:
      case 30:
        illustration = <IlloProofNotConfirmed data-illo="proof-not-confirmed" />;
        actions = failure.code === 30 ? back : <>{proveAgain}{back}</>;
        row = true;
        break;
      case 12:
      case 13:
        illustration = <IlloProofExpired data-illo="proof-expired" />;
        actions = <>{proveAgain}{back}</>;
        row = true;
        break;
      case 20:
        illustration = <IlloProofAlreadyUsed data-illo="proof-already-used" />;
        actions = back;
        break;
      case 41:
        if (beforeOffer) copy = noTrustlineBeforeOfferCopy();
        illustration = <IlloAllowUsdc data-illo="allow-usdc" />;
        actions = (
          <>
            <Button onClick={a.onAllowUsdc} loading={allowing} loadingLabel={`Approve in ${walletName}`}>
              Allow USDC
            </Button>
            <Button variant="outline" onClick={a.onBack} disabled={allowing}>
              Not now
            </Button>
          </>
        );
        break;
      case 10:
      case 40:
        illustration = <IlloAdvancesPaused data-illo="advances-paused" />;
        actions = back;
        break;
      default:
        // A refusal a creator cannot cause (admin and upgrade codes): the transaction did not happen.
        illustration = <IlloNothingCharged data-illo="nothing-charged" />;
        actions = <>{<Button onClick={a.onRetry}>Try again</Button>}{back}</>;
        row = true;
    }
  } else if (failure.kind === "tooSmall") {
    copy = tooSmallCopy(
      failure.revenue,
      terms && { share: ratePercent(terms), minimum: usdcWords(terms.minStroops) },
    );
    illustration = <IlloNoAdvanceYet data-illo="no-advance-yet" />;
    actions = back;
  } else {
    copy = proveFailureCopy(failure.kind, walletName);
    switch (failure.kind) {
      case "cancelled":
        illustration = <IlloSessionCancelled data-illo="session-cancelled" />;
        actions = <Button onClick={a.onProve}>Prove my revenue</Button>;
        break;
      case "googleSignIn":
      case "noAdsense":
      case "relayFailed":
      case "proofRunning":
      case "relayUnreachable":
      case "googleUnavailable":
      case "popupBlocked":
        illustration = <IlloSessionCancelled data-illo="session-cancelled" />;
        actions = (
          <>
            <Button onClick={a.onProve}>Prove my revenue</Button>
            {back}
          </>
        );
        break;
      case "declined":
        illustration = <IlloSessionCancelled data-illo="session-cancelled" />;
        actions = <Button onClick={a.onReviewOffer}>Review offer again</Button>;
        break;
      case "refused":
      case "unreachable":
      case "simulationFailed":
      case "walletNoAnswer":
        illustration = <IlloNothingCharged data-illo="nothing-charged" />;
        actions = (
          <>
            <Button onClick={a.onRetry}>Try again</Button>
            {back}
          </>
        );
        row = true;
        break;
      case "charged":
        illustration = <IlloSessionCancelled data-illo="session-cancelled" />;
        actions = (
          <>
            <Button onClick={a.onRetry}>Try again</Button>
            {back}
          </>
        );
        row = true;
        break;
      case "unconfirmed":
        illustration = <IlloNothingCharged data-illo="nothing-charged" />;
        actions = (
          <>
            <Link href="/history" className={button()}>
              Open History
            </Link>
            <Button variant="outline" onClick={a.onRetry}>
              Try again
            </Button>
          </>
        );
        break;
      case "walletLocked":
      case "walletWrongNetwork":
        illustration = <IlloConnectWallet data-illo="connect-wallet" />;
        actions = (
          <>
            <Button onClick={a.onRetry}>Try again</Button>
            {back}
          </>
        );
        row = true;
        break;
      case "relayNotReady":
      case "notConfigured":
        illustration = <IlloAdvancesPaused data-illo="advances-paused" />;
        actions = back;
        break;
      case "unexpected":
        illustration = <IlloNothingCharged data-illo="nothing-charged" />;
        actions = back;
        break;
      case "sentUnreachable":
        illustration = <IlloConnectWallet data-illo="connect-wallet" />;
        actions = (
          <>
            <Button onClick={a.onRetry}>Try again</Button>
            <Link href="/history" className={button({ variant: "outline" })}>
              Open History
            </Link>
          </>
        );
        break;
    }
  }

  return <ErrorPanel illustration={illustration} title={copy.title} body={copy.body} actions={actions} row={row} />;
}
