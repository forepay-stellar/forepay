import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type { AdvanceSummary } from "@/lib/api/types";
import { formatLedgerTime, formatUsdCents, formatUsdc, formatWindow } from "@/lib/format";
import { sizingLabel } from "@/lib/ledger";
import type { Sizing } from "@/lib/stellar/contract";
import { explorerTxUrl } from "@/lib/stellar/network";

// Advance details from "05 Product components": what was advanced, the proven revenue it was sized
// from, how, when, and the proof, "Verified" with its receipt (brief §3, term table).
export function AdvanceDetails({
  advance,
  terms,
  className,
}: {
  advance: AdvanceSummary;
  /**
   * The contract's rate and cap (`sizing()`), for "How it was sized": `"loading"` while it is read (the
   * row holds a placeholder, so the card does not grow later), `undefined` when it could not be read
   * (the row is left out).
   */
  terms: Sizing | "loading" | undefined;
  className?: string;
}) {
  const sized: ReactNode =
    terms === "loading" ? <SkeletonBlock className="h-4 w-28 rounded-[6px]" /> : sizingLabel(advance, terms);
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Advanced", value: formatUsdc(advance.principal) },
    {
      label: `${advance.source} revenue, ${formatWindow(advance.windowStart, advance.windowEnd).short}`,
      value: formatUsdCents(advance.revenueCents),
    },
    ...(sized ? [{ label: "How it was sized", value: sized }] : []),
    { label: "Received on", value: formatLedgerTime(advance.openedAt) },
  ];
  return (
    <section className={cn("flex w-full flex-col gap-5 rounded-card bg-surface p-6", className)}>
      <h2 className="text-card-title text-fg">Advance details</h2>
      <dl className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 text-body">
            <dt className="text-fg-muted">{r.label}</dt>
            <dd className="whitespace-nowrap font-medium text-fg">{r.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 text-body">
          <dt className="text-fg-muted">Revenue proof</dt>
          <dd>
            <a
              href={explorerTxUrl(advance.txHash)}
              target="_blank"
              rel="noreferrer"
              aria-label="Verified, view receipt"
              className="flex items-center gap-1.5 rounded-chip bg-success-subtle px-2.5 py-[5px] text-small font-medium text-success-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Check className="size-3.5" aria-hidden />
              Verified
            </a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
