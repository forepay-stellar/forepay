import type { ReactNode } from "react";
import { ErrorPanel } from "@/components/elements/ErrorPanel";
import { IlloAllowUsdc } from "@/components/illustrations/AllowUsdc";
import { IlloConnectWallet } from "@/components/illustrations/ConnectWallet";
import { IlloNothingCharged } from "@/components/illustrations/NothingCharged";
import { IlloSessionCancelled } from "@/components/illustrations/SessionCancelled";
import { OnboardingShell } from "@/components/layout/OnboardingShell";
import { Button } from "@/components/ui/Button";
import { failureCopy, type ConnectedFailure } from "@/lib/errors";

/**
 * A wallet is connected but cannot go on yet: it has no XLM, the ledger did not answer, the wallet
 * would not sign, or allowing USDC did not go through. None of these are drawn on the board; they follow its error panel and the
 * brief's copy rules. Shown in place of 1c.
 */
export function ConnectedFailurePanel({
  failure,
  walletName,
  wallet,
  busy,
  onRetry,
  onFund,
  onUseDifferentWallet,
}: {
  failure: ConnectedFailure;
  walletName: string;
  wallet: ReactNode;
  busy: boolean;
  onRetry: () => void;
  onFund: () => void;
  onUseDifferentWallet: () => void;
}) {
  const copy = failureCopy(failure, walletName);
  const useDifferent = (
    <Button variant="outline" onClick={onUseDifferentWallet}>
      Use a different wallet
    </Button>
  );

  const content = (() => {
    switch (failure) {
      case "unfunded":
      case "fundFailed":
        return {
          illustration: <IlloAllowUsdc />,
          actions: (
            <>
              <Button onClick={onFund} loading={busy} loadingLabel="Adding test XLM">
                {failure === "unfunded" ? "Get test XLM" : "Try again"}
              </Button>
              {useDifferent}
            </>
          ),
        };
      case "readFailed":
      case "trustlineUnconfirmed":
        return {
          illustration: <IlloConnectWallet />,
          actions: (
            <Button onClick={onRetry} loading={busy} loadingLabel="Checking">
              {failure === "readFailed" ? "Try again" : "Check again"}
            </Button>
          ),
        };
      case "trustlineFailed":
        // "Nothing charged" is true only here: the network never took the transaction.
        return {
          illustration: <IlloNothingCharged data-illo="nothing-charged" />,
          actions: <Button onClick={onRetry}>Try again</Button>,
        };
      case "trustlineCharged":
        return {
          illustration: <IlloSessionCancelled data-illo="not-allowed" />,
          actions: <Button onClick={onRetry}>Try again</Button>,
        };
      case "signLocked":
      case "signWrongNetwork":
      case "signNoAnswer":
        // The wallet would not sign, so nothing was sent. Asking again, or another wallet, is the way on.
        return {
          illustration: <IlloConnectWallet />,
          actions: (
            <>
              <Button onClick={onRetry}>Try again</Button>
              {useDifferent}
            </>
          ),
        };
    }
  })();

  return (
    <OnboardingShell step={2} wallet={wallet} narrow>
      <ErrorPanel
        centered
        stacked={failure === "unfunded" || failure === "fundFailed"}
        illustration={content.illustration}
        title={copy.title}
        body={copy.body}
        actions={content.actions}
      />
    </OnboardingShell>
  );
}
