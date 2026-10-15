import { Wallet } from "lucide-react";
import { IlloConnectWallet } from "@/components/illustrations/ConnectWallet";
import { OnboardingShell, StepText } from "@/components/layout/OnboardingShell";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

/**
 * 1b Connect wallet. While the chosen wallet asks for permission it becomes the "Connecting" state of
 * the board: the spinner, where to look, and a button that cannot be pressed twice.
 */
export function ConnectWallet({
  onBack,
  onConnect,
  connecting,
  waitingFor,
}: {
  onBack: () => void;
  onConnect: () => void;
  connecting: boolean;
  waitingFor: string | null;
}) {
  if (waitingFor) {
    return (
      <OnboardingShell step={1} onBack={onBack}>
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 lg:py-10">
          <Spinner />
          <p className="text-[16px] font-semibold text-fg">Waiting for {waitingFor}</p>
          <p className="text-[14px] text-fg-muted">Approve the connection in the wallet window.</p>
          <Button loading loadingLabel="Connecting">
            Connect wallet
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={1}
      onBack={onBack}
      actions={
        <Button
          size="lg"
          className="w-full"
          icon={<Wallet aria-hidden />}
          onClick={onConnect}
          loading={connecting}
          loadingLabel="Connecting"
        >
          Connect wallet
        </Button>
      }
    >
      <IlloConnectWallet />
      <StepText
        title="Connect your wallet"
        body="Your advance is sent to this wallet, and your revenue proof is tied to it. Nothing leaves your wallet without your approval."
        extra="Works with Freighter, xBull and Rabet in your browser, and with mobile wallets through WalletConnect."
      />
    </OnboardingShell>
  );
}
