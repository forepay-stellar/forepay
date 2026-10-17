import { ArrowUpFromLine, Check, Receipt, Timer, Wallet } from "lucide-react";
import { Amount } from "@/components/elements/Amount";
import { IconTile } from "@/components/elements/IconTile";
import { OfferBreakdown } from "@/components/elements/OfferBreakdown";
import { Button } from "@/components/ui/Button";
import { formatUsdc } from "@/lib/format";

/**
 * 2b Review offer: the offer and how it was reached (#20). Every figure is the contract's: `advance` is
 * what `quote` returned for the proven revenue, and the check that came before it was `request_advance`
 * simulated on Stellar, which is what "Revenue verified" stands for.
 */
export function ReviewOffer({
  revenue,
  windowShort,
  windowLong,
  advance,
  capped,
  onAccept,
  onNotNow,
}: {
  /** `$360.00` */
  revenue: string;
  /** `Jul to Sep 2026` */
  windowShort: string;
  /** `July to September` */
  windowLong: string;
  /** Stroops, from `quote`. */
  advance: bigint;
  /**
   * Whether the 100 USDC limit cut the advance, as the contract answered it (`capProbe` in Advance),
   * `null` while that is not known: then neither sentence is claimed.
   */
  capped: boolean | null;
  onAccept: () => void;
  onNotNow: () => void;
}) {
  const amount = formatUsdc(advance);

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        <section
          data-focus
          aria-label={`You can get ${amount}`}
          className="relative flex flex-col gap-3 overflow-hidden rounded-hero bg-brand p-[22px] lg:gap-[18px] lg:p-8"
        >
          <span
            aria-hidden
            className="absolute left-[220px] top-[30px] size-[180px] rounded-full bg-fg-on-brand/12 lg:left-[560px] lg:top-10 lg:size-[300px]"
          />
          <div className="relative flex items-center justify-between">
            <p className="text-[15px] text-fg-on-brand/80">You can get</p>
            <span className="flex items-center gap-1.5 rounded-chip bg-fg-on-brand/18 px-2.5 py-[5px] text-[12px] font-medium text-fg-on-brand">
              <Check className="size-3.5" aria-hidden />
              Revenue verified
            </span>
          </div>
          <p className="relative">
            <Amount
              stroops={advance}
              className="text-[56px] font-semibold leading-[56px] tracking-[-1.7px] text-fg-on-brand lg:text-[88px] lg:leading-[88px] lg:tracking-[-2.6px]"
              decimalsClassName="text-fg-on-brand/55"
              unitClassName="pb-1.5 pl-2.5 text-[18px] font-medium text-fg-on-brand/80 lg:pb-2.5 lg:text-[24px]"
            />
          </p>
          <p className="relative text-[15px] leading-[22px] text-fg-on-brand lg:max-w-[480px]">
            {capped
              ? `The most one advance can be. You earned ${revenue} on AdSense from ${windowLong}.`
              : capped === null
                ? `You earned ${revenue} on AdSense from ${windowLong}.`
                : `A quarter of the ${revenue} you earned on AdSense from ${windowLong}.`}
          </p>
        </section>
        <OfferBreakdown
          revenue={revenue}
          windowShort={windowShort}
          advance={advance}
          note={
            capped
              ? `A quarter of ${revenue} is more than 100 USDC. Each advance is limited to 100 USDC.`
              : capped === null
                ? undefined
                : `25% of ${revenue} is ${amount}.`
          }
        />
      </div>

      <div className="flex flex-col gap-4 lg:w-[420px] lg:shrink-0">
        <section className="hidden flex-col gap-3.5 rounded-card bg-surface p-6 lg:flex" aria-label="If you accept">
          <h2 className="text-[18px] font-semibold text-fg">If you accept</h2>
          <ul className="flex flex-col gap-3.5">
            {[
              { icon: <Wallet aria-hidden />, text: `${amount} arrives in your wallet within seconds` },
              { icon: <ArrowUpFromLine aria-hidden />, text: "You repay any amount, any time" },
              { icon: <Receipt aria-hidden />, text: "Every step is recorded on Stellar, with a receipt" },
            ].map((row) => (
              <li key={row.text} className="flex items-center gap-3">
                <IconTile>{row.icon}</IconTile>
                <span className="flex-1 text-[14px] leading-[20px] text-fg">{row.text}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="flex items-center gap-2.5 rounded-tile bg-brand-subtle px-4 py-3.5 text-[14px] leading-[20px] text-brand-strong">
          <Timer className="size-[18px] shrink-0 text-icon" aria-hidden />
          Your proof stays valid for one hour. Accept before then, or prove again.
        </p>
        <div className="flex flex-col gap-4 lg:gap-2.5">
          <Button size="lg" className="w-full lg:px-6" onClick={onAccept}>
            Accept {amount}
          </Button>
          <Button variant="outline" className="w-full" onClick={onNotNow}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
