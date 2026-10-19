"use client";

import { LedgerNote } from "@/components/elements/LedgerNote";
import { LedgerRow } from "@/components/elements/LedgerRow";
import { CannotRead, LoadingLedger, NoAdvance, SkeletonCard } from "@/components/elements/LedgerStates";
import { useAdvances, useTransactions } from "@/lib/api/queries";
import type { AdvanceSummary, LedgerTransaction } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { usdcParts } from "@/lib/format";
import { groupByMonth, historyRows, outstanding, pickAdvance } from "@/lib/ledger";
import { useWallet } from "@/providers/WalletProvider";

/**
 * 3b All transactions (issue #21), reached from "See all" and the History tab: what was advanced, repaid
 * and is left, then every transaction behind the advance by month, newest first. Read from the API
 * (#16) with the same queries as 3a, so the two never disagree.
 *
 * Renders page content only. The AppShell wraps it (#20).
 */
export function History() {
  const { address } = useWallet();
  if (!address) return null;
  return <HistoryScreen address={address} />;
}

function HistoryScreen({ address }: { address: string }) {
  const advances = useAdvances(address);
  const transactions = useTransactions(address);
  const picked = advances.data ? pickAdvance(advances.data) : null;

  let body: React.ReactNode;
  if (advances.isError || transactions.isError) {
    body = (
      <div className="flex w-full justify-center pt-4">
        <CannotRead
          retrying={advances.isFetching || transactions.isFetching}
          onRetry={() => {
            void advances.refetch();
            void transactions.refetch();
          }}
        />
      </div>
    );
  } else if (advances.isPending || transactions.isPending) {
    body = (
      <LoadingLedger>
        <SkeletonCard rows={4} />
      </LoadingLedger>
    );
  } else if (!picked) {
    body = (
      // 16 under the title on a phone, 48 more from a tablet up ("No advance yet" frames).
      <div className="flex w-full justify-center md:pt-12">
        <NoAdvance />
      </div>
    );
  } else {
    body = <Ledger advance={picked.advance} transactions={transactions.data} />;
  }

  return (
    // 28 under the top nav on desktop (Z7FXmJ); the shell leaves that gap to each page.
    <div className="flex w-full flex-col gap-4 md:gap-7 md:pt-7">
      <header className="flex flex-col gap-1.5">
        {picked && !advances.isError && !transactions.isError && (
          <p className="hidden text-[15px] text-brand md:block">Advance {picked.number}</p>
        )}
        <h1 className="text-page-title text-fg">History</h1>
      </header>
      {body}
    </div>
  );
}

function Figure({ label, stroops, tone }: { label: string; stroops: bigint; tone: string }) {
  const { whole, decimals } = usdcParts(stroops);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-tile bg-surface p-3.5 md:p-6">
      <dt className="whitespace-nowrap text-[12px] text-fg-muted md:text-[14px]">{label}</dt>
      {/* The unit under the figure on a phone, beside it from a tablet up, as the 3b frames draw. */}
      <dd className="flex flex-col gap-0.5 md:flex-row md:items-end md:gap-1.5">
        <span className={cn("whitespace-nowrap text-[20px] font-semibold tracking-[-0.8px] md:text-[32px]", tone)}>
          {whole}
          {decimals}
        </span>
        <span className="text-[11px] font-medium text-fg-muted md:text-[14px]">USDC</span>
      </dd>
    </div>
  );
}

function Ledger({ advance, transactions }: { advance: AdvanceSummary; transactions: LedgerTransaction[] }) {
  const months = groupByMonth(historyRows(transactions, advance));
  return (
    <div className="flex w-full flex-col gap-4 md:gap-7">
      {/* Section 08: the tiles share equal columns at least 98 wide (the widest label plus padding on a
          phone); when three do not fit, as at 320, the third moves to a new row at the same width. */}
      <dl className="grid w-full grid-cols-[repeat(auto-fit,minmax(6.125rem,1fr))] gap-2 md:gap-4">
        <Figure label="Advanced" stroops={advance.principal} tone="text-fg" />
        <Figure label="Repaid" stroops={advance.repaid} tone="text-success" />
        <Figure label="Left to repay" stroops={outstanding(advance)} tone="text-brand" />
      </dl>
      {months.map((m) => (
        <section
          key={m.month}
          aria-label={m.month}
          className="flex w-full flex-col gap-1 rounded-card bg-surface px-5 pb-2 pt-5 md:px-6 md:pb-3 md:pt-6"
        >
          <h2 className="text-[14px] font-medium text-fg-muted">{m.month}</h2>
          <ul className="flex w-full flex-col gap-1">
            {m.rows.map((row) => (
              <LedgerRow key={row.key} row={row} />
            ))}
          </ul>
        </section>
      ))}
      <LedgerNote className="hidden md:flex" />
    </div>
  );
}
