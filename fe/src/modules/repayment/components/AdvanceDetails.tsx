import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AdvanceSummary } from "@/lib/api/types";
import { formatLedgerTime, formatUsdc } from "@/lib/format";
import { formatUsd, sizingLabel, windowLabel } from "@/lib/ledger";
import { explorerTxUrl } from "@/lib/stellar/network";

// Advance details from "05 Product components": what was advanced, the proven revenue it was sized
// from, how, when, and the proof, "Verified" with its receipt (brief §3, term table).
export function AdvanceDetails({ advance, className }: { advance: AdvanceSummary; className?: string }) {
  const rows: { label: string; value: string }[] = [
    { label: "Advanced", value: formatUsdc(advance.principal) },
    { label: `AdSense revenue, ${windowLabel(advance.windowStart, advance.windowEnd)}`, value: formatUsd(advance.revenueCents) },
    { label: "How it was sized", value: sizingLabel(advance) },
    { label: "Received on", value: formatLedgerTime(advance.openedAt) },
  ];
  return (
    <section className={cn("flex w-full flex-col gap-5 rounded-card bg-surface p-6", className)}>
      <h2 className="text-[18px] font-semibold tracking-[-0.2px] text-fg">Advance details</h2>
      <dl className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 text-[14px]">
            <dt className="text-fg-muted">{r.label}</dt>
            <dd className="whitespace-nowrap font-medium text-fg">{r.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 text-[14px]">
          <dt className="text-fg-muted">Revenue proof</dt>
          <dd>
            <a
              href={explorerTxUrl(advance.txHash)}
              target="_blank"
              rel="noreferrer"
              aria-label="Verified, view receipt"
              className="flex items-center gap-1.5 rounded-chip bg-success-subtle px-2.5 py-[5px] text-[12px] font-medium text-success-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
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
