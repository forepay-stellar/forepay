import { Check, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { IlloAllowUsdc } from "@/components/illustrations/AllowUsdc";
import { OnboardingShell, StepText } from "@/components/layout/OnboardingShell";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogSlot } from "@/components/ui/Dialog";
import { TextButton } from "@/components/ui/TextLink";

/**
 * 1c Allow USDC, with the board's "Approving in the wallet" dialog and, once the ledger confirms it,
 * "USDC allowed".
 */
export function AllowUsdc({
  wallet,
  walletName,
  allowed,
  approving,
  onAllow,
  onCancel,
  onUseDifferentWallet,
  onContinue,
}: {
  wallet: ReactNode;
  walletName: string;
  allowed: boolean;
  approving: boolean;
  onAllow: () => void;
  onCancel: () => void;
  onUseDifferentWallet: () => void;
  onContinue: () => void;
}) {
  return (
    <OnboardingShell
      step={2}
      wallet={wallet}
      actions={
        allowed ? (
          <Button size="lg" className="w-full" onClick={onContinue}>
            Prove my revenue
          </Button>
        ) : (
          <>
            <Button size="lg" className="w-full" onClick={onAllow}>
              Allow USDC
            </Button>
            <TextButton onClick={onUseDifferentWallet}>Use a different wallet</TextButton>
          </>
        )
      }
    >
      <IlloAllowUsdc />
      <StepText
        title="Let your wallet receive USDC"
        body="Stellar wallets accept a new currency only after you approve it once. It costs a tiny network fee and nothing else."
      />
      {allowed ? (
        <Alert tone="success" className="w-full" title="Your wallet can receive USDC" body="You are ready to prove your revenue." />
      ) : (
        <dl className="flex w-full flex-col gap-3.5 rounded-tile bg-surface p-[22px]">
          <div className="flex items-center justify-between">
            <dt className="text-[14px] text-fg-muted">Wallet</dt>
            <dd className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
              <Check className="size-[15px] text-success" aria-hidden />
              {walletName} connected
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-[14px] text-fg-muted">USDC</dt>
            <dd className="flex items-center gap-1.5 text-[14px] font-medium text-brand-strong">
              <CircleAlert className="size-[15px] text-brand" aria-hidden />
              Not allowed yet
            </dd>
          </div>
        </dl>
      )}
      <Dialog
        open={approving}
        onClose={onCancel}
        title={`Approve in ${walletName}`}
        body={`${walletName} opened a window. Approve adding USDC to your wallet.`}
      >
        <DialogSlot
          rows={[
            { label: "Asset", value: "USDC" },
            { label: "Network fee", value: "Under 0.01 XLM" },
          ]}
        />
        <Button variant="outline" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </Dialog>
    </OnboardingShell>
  );
}
