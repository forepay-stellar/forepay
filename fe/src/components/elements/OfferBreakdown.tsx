import { Amount } from "@/components/elements/Amount";
import { cn } from "@/lib/cn";
import { formatUsdc } from "@/lib/format";

/** 100 USDC in stroops. The contract's `ADVANCE_CAP_STROOPS` (docs/interface.md §5), shown as the limit row. */
export const ADVANCE_CAP = 1_000_000_000n;

/**
 * Offer breakdown from "05 Product components": how the offer was reached, so it can be checked. Proven
 * revenue, × 25%, the 100 USDC limit, and the result. The result is the contract's own `quote`, passed
 * in, never worked out here (#20, ARCHITECTURE.md §1).
 */
export function OfferBreakdown({
  revenue,
  windowShort,
  advance,
  note,
  className,
}: {
  /** The proven figure, `$360.00`. */
  revenue: string;
  /** `Jul to Sep 2026`. A phone drops the year. */
  windowShort: string;
  /** What `quote` returned, in stroops. */
  advance: bigint;
  /** A line under the result, for the capped case. */
  note?: string;
  className?: string;
}) {
  const months = windowShort.replace(/ \d{4}$/, "");
  const rows = [
    {
      key: (
        <>
          <span className="hidden lg:inline">Your AdSense revenue, {windowShort}</span>
          <span className="lg:hidden">AdSense revenue, {months}</span>
        </>
      ),
      value: revenue,
    },
    { key: "Advance rate", value: "× 25%" },
    { key: "Limit per advance", value: formatUsdc(ADVANCE_CAP) },
  ];
  return (
    <section className={cn("flex w-full flex-col gap-5 rounded-card bg-surface p-6", className)} aria-label="How we got this number">
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-semibold tracking-[-0.2px] text-fg">How we got this number</h2>
        <p className="text-[14px] text-fg-muted">The same proof always gives the same advance.</p>
      </div>
      <div className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <p key={r.value} className="flex items-center justify-between gap-4">
            <span className="text-[14px] text-fg-muted">{r.key}</span>
            <span className="text-[14px] font-medium text-fg">{r.value}</span>
          </p>
        ))}
        <div className="h-px w-full bg-divider" />
        <div className="flex items-end justify-between gap-4">
          <p className="text-[15px] font-medium text-fg">Your advance</p>
          <p>
            <Amount
              stroops={advance}
              className="text-[36px] font-semibold leading-[36px] tracking-[-1.1px] text-fg"
              decimalsClassName="text-fg-subtle"
              unitClassName="pb-1 text-[16px] font-medium text-fg-muted"
            />
          </p>
        </div>
        {note && <p className="text-[13px] leading-[19px] text-fg-muted">{note}</p>}
      </div>
    </section>
  );
}
