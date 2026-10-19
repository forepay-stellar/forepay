import Link from "next/link";
import { Amount } from "@/components/elements/Amount";
import { IlloFundsReceived } from "@/components/illustrations/FundsReceived";
import { button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ExternalLink } from "@/components/ui/TextLink";
import { cn } from "@/lib/cn";
import { formatLedgerTime, formatUsdc } from "@/lib/format";
import type { OnChainAdvance } from "@/lib/stellar/contract";
import { explorerTxUrl } from "@/lib/stellar/network";
import { DetailRows } from "./DetailRows";

/**
 * 2d Receive: the USDC arrived. The amount is what `request_advance` returned, the date and what is
 * left to repay are the advance as the contract stores it, and the receipt opens the transaction on
 * stellar.expert.
 */
export function FundsReceived({
  amount,
  hash,
  advance,
  advanceFailed,
}: {
  /** Stroops disbursed, the value `request_advance` returned. */
  amount: bigint;
  hash: string;
  /** The stored advance, once read. */
  advance: OnChainAdvance | undefined;
  advanceFailed: boolean;
}) {
  const pending = <SkeletonBlock className="h-4 w-20 rounded-chip" />;
  const missing = <span className="text-fg-muted">Could not load</span>;
  const fromChain = (render: (a: OnChainAdvance) => string) =>
    advance ? render(advance) : advanceFailed ? missing : pending;

  return (
    <section className="flex w-full flex-col items-center gap-4 rounded-card bg-surface p-6 md:w-[560px] md:gap-5 md:p-10">
      <IlloFundsReceived />
      <p>
        <Amount
          stroops={amount}
          sign="+"
          className="text-amount text-success"
          decimalsClassName="text-success-subtle"
          unitClassName="pb-1.5 text-[18px] font-medium text-success-strong"
        />
      </p>
      <h2 className="text-[22px] font-semibold tracking-[-0.5px] text-fg md:text-[26px]">The USDC is in your wallet</h2>
      <p className="text-center text-[15px] leading-[23px] text-fg-muted">
        You can repay any amount, any time, from the Repayment tab.
      </p>
      <DetailRows
        rows={[
          { label: "Received on", value: fromChain((a) => formatLedgerTime(a.openedAt)) },
          { label: "Left to repay", value: fromChain((a) => formatUsdc(a.principal - a.repaid)) },
          { label: "Receipt", value: <ExternalLink href={explorerTxUrl(hash)}>View receipt</ExternalLink> },
        ]}
      />
      <Link href="/repayment" className={cn(button({ size: "lg" }), "w-full py-4")}>
        Go to repayment
      </Link>
    </section>
  );
}
