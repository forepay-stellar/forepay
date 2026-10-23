import { Amount } from "@/components/elements/Amount";
import { cn } from "@/lib/cn";
import { formatUsdc } from "@/lib/format";

/**
 * Offer breakdown from "05 Product components": how the offer was reached, so it can be checked. Proven
 * revenue, the rate and the limit (both read from the contract's `sizing()`), and the result. The result
 * is the contract's own `quote`, passed in, never worked out here (#20, ARCHITECTURE.md §1).
 */
export function OfferBreakdown({
  revenue,
  windowShort,
  advance,
  rate,
  cap,
  note,
  className,
}: {
  /** The proven figure, `$360.00`. */
  revenue: string;
  /** `Jul to Sep 2026`. A phone drops the year, unless the window crosses one. */
  windowShort: string;
  /** What `quote` returned, in stroops. */
  advance: bigint;
  /** The contract's rate, `× 25%`, from its `sizing()`. The row is left out while it is not known. */
  rate?: string;
  /** The contract's cap per advance, in stroops, from its `sizing()`. Left out while not known. */
  cap?: bigint;
  /** A line under the result, for the capped case. */
  note?: string;
  className?: string;
}) {
  // `Nov 2026 to Jan 2027` keeps its years: without them it would read as one year's months.
  const months = /\d{4}.*\d{4}/.test(windowShort) ? windowShort : windowShort.replace(/ \d{4}$/, "");
  const rows = [
    {
      key: (
        <>
          <span className="hidden md:inline">Your AdSense revenue, {windowShort}</span>
          <span className="md:hidden">AdSense revenue, {months}</span>
        </>
      ),
      value: revenue,
    },
    ...(rate ? [{ key: "Advance rate", value: rate }] : []),
    ...(cap !== undefined ? [{ key: "Limit per advance", value: formatUsdc(cap) }] : []),
  ];
  return (
    <section className={cn("flex w-full flex-col gap-5 rounded-card bg-surface p-6", className)} aria-label="How we got this number">
      <div className="flex flex-col gap-1">
        <h2 className="text-card-title text-fg">How we got this number</h2>
        <p className="text-body text-fg-muted">The same proof always gives the same advance.</p>
      </div>
      {/* Section 08: where a row has no room, its value moves under its label. */}
      <div className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <p key={r.value} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="text-body text-fg-muted">{r.key}</span>
            <span className="text-body font-medium text-fg">{r.value}</span>
          </p>
        ))}
        <div className="h-px w-full bg-divider" />
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-body font-medium text-fg">Your advance</p>
          <p>
            <Amount
              stroops={advance}
              className="text-figure text-fg"
              decimalsClassName="text-fg-subtle"
              unitClassName="pb-0.5 text-small font-medium text-fg-muted"
            />
          </p>
        </div>
        {note && <p className="text-small text-fg-muted">{note}</p>}
      </div>
    </section>
  );
}
