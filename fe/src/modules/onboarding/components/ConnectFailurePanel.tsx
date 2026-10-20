import { ErrorPanel } from "@/components/elements/ErrorPanel";
import { IlloConnectWallet } from "@/components/illustrations/ConnectWallet";
import { IlloSessionCancelled } from "@/components/illustrations/SessionCancelled";
import { IlloWrongNetwork } from "@/components/illustrations/WrongNetwork";
import { OnboardingShell } from "@/components/layout/OnboardingShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { failureCopy, type ConnectFailure } from "@/lib/errors";
import { FREIGHTER_URL } from "../links";

/** Row 3 of the onboarding board: when connecting does not work. Shown in place of 1b. */
export function ConnectFailurePanel({
  failure,
  walletName,
  onRetry,
  onBack,
  onDismiss,
}: {
  failure: ConnectFailure;
  walletName: string;
  onRetry: () => void;
  /** Back to 1a. */
  onBack: () => void;
  /** Close the panel and return to 1b. */
  onDismiss: () => void;
}) {
  const copy = failureCopy(failure, walletName);
  const panels = {
    wrongNetwork: { illustration: <IlloWrongNetwork />, centered: false, label: "Try again" },
    declined: { illustration: <IlloSessionCancelled />, centered: true, label: "Connect wallet" },
    locked: { illustration: <IlloConnectWallet />, centered: false, label: "Connect wallet" },
    unknown: { illustration: <IlloConnectWallet />, centered: true, label: "Try again" },
  } as const;

  // "Install a Stellar wallet" carries its own Back, so the page does not add a second one.
  if (failure === "notFound") {
    return (
      <OnboardingShell step={1} narrow>
        <ErrorPanel
          centered
          illustration={<IlloConnectWallet />}
          title={copy.title}
          body={copy.body}
          actions={
            <>
              <ButtonLink href={FREIGHTER_URL}>Get Freighter</ButtonLink>
              <Button variant="outline" onClick={onDismiss}>
                Back
              </Button>
            </>
          }
        />
      </OnboardingShell>
    );
  }

  const panel = panels[failure];
  return (
    <OnboardingShell step={1} narrow onBack={onBack}>
      <ErrorPanel
        centered={panel.centered}
        illustration={panel.illustration}
        title={copy.title}
        body={copy.body}
        actions={<Button onClick={onRetry}>{panel.label}</Button>}
      />
    </OnboardingShell>
  );
}
