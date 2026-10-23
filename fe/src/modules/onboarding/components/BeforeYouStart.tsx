import { ChartColumn, Wallet } from "lucide-react";
import { IconTile } from "@/components/elements/IconTile";
import { IlloNoAdvanceYet } from "@/components/illustrations/NoAdvanceYet";
import { OnboardingShell, StepText } from "@/components/layout/OnboardingShell";
import { Button } from "@/components/ui/Button";
import { ExternalLink } from "@/components/ui/TextLink";
import { FREIGHTER_URL } from "../links";

/** 1a Before you start. */
export function BeforeYouStart({ onStart }: { onStart: () => void }) {
  return (
    <OnboardingShell
      step={0}
      actions={
        <>
          <Button size="lg" className="w-full" onClick={onStart}>
            Get started
          </Button>
          <ExternalLink href={FREIGHTER_URL}>No wallet yet? Get Freighter</ExternalLink>
        </>
      }
    >
      <IlloNoAdvanceYet />
      <StepText
        title="Get paid early on the AdSense revenue you already earn"
        body="Prove your AdSense revenue from the last three months and get up to 100 USDC on Stellar testnet. Repay whenever you like."
      />
      <div className="flex w-full flex-col gap-3.5 rounded-tile bg-surface p-[22px]">
        <p className="text-small font-medium text-fg-muted">You will need</p>
        <div className="flex items-center gap-3">
          <IconTile>
            <ChartColumn aria-hidden />
          </IconTile>
          <p className="flex-1 text-body text-fg">
            An AdSense account with revenue in the last three months
          </p>
        </div>
        <div className="flex items-center gap-3">
          <IconTile>
            <Wallet aria-hidden />
          </IconTile>
          <p className="flex-1 text-body text-fg">A Stellar wallet set to testnet</p>
        </div>
      </div>
    </OnboardingShell>
  );
}
