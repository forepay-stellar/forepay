import { Wallet } from "lucide-react";
import { IlloConnectWallet } from "@/components/illustrations/ConnectWallet";
import { OnboardingShell, StepText } from "@/components/layout/OnboardingShell";
import { Button } from "@/components/ui/Button";

/**
 * 1b Connect wallet. The picker, and "Waiting for {wallet}" once one is pressed, open over this page in
 * WalletPickerDialog; meanwhile the button holds its "Connecting" state and cannot be pressed twice.
 */
export function ConnectWallet({
  onBack,
  onConnect,
  connecting,
}: {
  onBack: () => void;
  onConnect: () => void;
  connecting: boolean;
}) {
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
