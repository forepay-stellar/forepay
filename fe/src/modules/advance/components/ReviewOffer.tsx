import { ArrowUpFromLine, Check, Receipt, Timer, Wallet } from "lucide-react";
import { Amount } from "@/components/elements/Amount";
import { IconTile } from "@/components/elements/IconTile";
import { OfferBreakdown } from "@/components/elements/OfferBreakdown";
import type { Sizing } from "@/lib/stellar/contract";
import { rateLabel, ratePercent, shareWords, usdcWords } from "../cap";
import { Button } from "@/components/ui/Button";
import { formatUsdc } from "@/lib/format";

/**
 * 2b Review offer: the offer and how it was reached (#20). Every figure is the contract's: `advance` is
 * what `quote` returned for the proven revenue, and the check that came before it was `request_advance`
 * simulated on Stellar, which is what "Revenue verified" stands for.
 */
export function ReviewOffer({
  revenue,
  sourceName = "AdSense",
  windowShort,
  windowLong,
  advance,
  capped,
  terms,
  onAccept,
  onNotNow,
}: {
  /** `$360.00` */
  revenue: string;
  /** Where it was earned, `AdSense` or `AdMob` (#97). */
  sourceName?: string;
  /** `Jul to Sep 2026` */
  windowShort: string;
  /** `July to September` */
  windowLong: string;
  /** Stroops, from `quote`. */
  advance: bigint;
  /**
   * Whether the contract's cap cut the advance (`isCapped`, from its `sizing()`), `null` while that is
   * not known: then neither sentence is claimed.
   */
  capped: boolean | null;
  /** The contract's rate and cap, for the breakdown's rows. Left out while they are not known. */
  terms: Sizing | undefined;
  onAccept: () => void;
  onNotNow: () => void;
}) {
  const amount = formatUsdc(advance);

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section
          data-focus
          aria-label={`You can get ${amount}`}
          className="relative flex flex-col gap-3 overflow-hidden rounded-hero bg-brand p-[22px] md:gap-[18px] md:p-8"
        >
          <span
            aria-hidden
            className="absolute left-[220px] top-[30px] size-[180px] rounded-full bg-fg-on-brand/12 md:left-[560px] md:top-10 md:size-[300px]"
          />
          <div className="relative flex items-center justify-between">
            <p className="text-body text-fg-on-brand/80">You can get</p>
            <span className="flex items-center gap-1.5 rounded-chip bg-fg-on-brand/18 px-2.5 py-[5px] text-small font-medium text-fg-on-brand">
              <Check className="size-3.5" aria-hidden />
              Revenue verified
            </span>
          </div>
          <p className="relative">
            <Amount
              stroops={advance}
              className="text-hero text-fg-on-brand"
              decimalsClassName="text-fg-on-brand/55"
              unitClassName="pb-1.5 pl-2.5 text-card-title font-medium text-fg-on-brand/80 md:pb-2.5"
            />
          </p>
          <p className="relative text-body text-fg-on-brand md:max-w-[480px]">
            {capped
              ? `The most one advance can be. You earned ${revenue} on ${sourceName} from ${windowLong}.`
              : capped === null || !terms
                ? `You earned ${revenue} on ${sourceName} from ${windowLong}.`
                : `${shareWords(terms)} of the ${revenue} you earned on ${sourceName} from ${windowLong}.`}
          </p>
        </section>
        <OfferBreakdown
          rate={terms && rateLabel(terms)}
          cap={terms?.capStroops}
          revenue={revenue}
          sourceName={sourceName}
          windowShort={windowShort}
          advance={advance}
          note={
            // Every figure here is the contract's (`sizing()`); without it, no note.
            !terms || capped === null
              ? undefined
              : capped
                ? `${shareWords(terms)} of ${revenue} is more than ${usdcWords(terms.capStroops)}. Each advance is limited to ${usdcWords(terms.capStroops)}.`
                : `${ratePercent(terms)} of ${revenue} is ${amount}.`
          }
        />
      </div>

      {/* Section 08: under the offer on a tablet; from 1024 a side column, 320 wide and 360 from 1200. */}
      <div className="flex flex-col gap-4 lg:w-[320px] lg:shrink-0 wide:w-[360px]">
        <section className="hidden flex-col gap-3.5 rounded-card bg-surface p-6 md:flex" aria-label="If you accept">
          <h2 className="text-card-title text-fg">If you accept</h2>
          <ul className="flex flex-col gap-3.5">
            {[
              { icon: <Wallet aria-hidden />, text: `${amount} arrives in your wallet within seconds` },
              { icon: <ArrowUpFromLine aria-hidden />, text: "You repay any amount, any time" },
              { icon: <Receipt aria-hidden />, text: "Every step is recorded on Stellar, with a receipt" },
            ].map((row) => (
              <li key={row.text} className="flex items-center gap-3">
                <IconTile>{row.icon}</IconTile>
                <span className="flex-1 text-body text-fg">{row.text}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="flex items-center gap-2.5 rounded-tile bg-brand-subtle px-4 py-3.5 text-small text-brand-strong">
          <Timer className="size-[18px] shrink-0 text-icon" aria-hidden />
          Your proof stays valid for one hour. Accept before then, or prove again.
        </p>
        <div className="flex flex-col gap-4 md:gap-2.5">
          <Button size="lg" className="w-full md:px-6" onClick={onAccept}>
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
