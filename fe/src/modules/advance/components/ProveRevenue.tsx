import { Check, CircleAlert, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { IlloProvingRevenue } from "@/components/illustrations/ProvingRevenue";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import type { Sizing } from "@/lib/stellar/contract";
import { shareWords, usdcWords } from "../cap";
import type { UsdcStatus } from "@/lib/stellar/trustline";

/**
 * 2a Prove revenue. What will be read (AdSense revenue for the last three months, nothing else), what
 * will not, and the button that opens the Reclaim session. From a tablet up it adds the two lists and
 * the wallet card; a phone keeps the card, the button and the rule.
 *
 * Section 08: on a tablet the side cards sit in a row under the Prove card; from 1024 they make the side
 * column, 320 wide and 360 from 1200. The two lists sit side by side only where the text column has
 * room for both.
 */
export function ProveRevenue({
  walletName,
  usdc,
  terms,
  onProve,
}: {
  walletName: string;
  /**
   * The contract's rate and cap, from `sizing()`: `"loading"` while it is read (a placeholder line),
   * `undefined` when it could not be (the line names no figure).
   */
  terms?: Sizing | "loading";
  /** Read from the ledger. `undefined` while loading, `"error"` when the read failed. */
  usdc: UsdcStatus | "error" | undefined;
  onProve: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-card bg-surface p-5 md:flex-row md:items-center md:gap-8 md:p-10">
        <div className="flex h-[170px] w-full shrink-0 items-center justify-center rounded-tile bg-brand-subtle md:h-[240px] md:w-[200px] xl:w-[280px]">
          <IlloProvingRevenue />
        </div>
        <div className="@container flex min-w-0 flex-1 flex-col gap-4 md:gap-[18px]">
          <h2 className="text-card-title text-fg">See how much you can get</h2>
          <p className="text-body text-fg-muted">
            Log in to AdSense in a secure window. We read your revenue for the last three months and nothing else.
          </p>
          {/* Side by side only where each list keeps its longest item ("Revenue from the last three
              complete months", about 360 in Body) on one line: two of them and the 24 gap. */}
          <div className="hidden flex-col gap-4 md:flex @[46.5rem]:flex-row @[46.5rem]:gap-6">
            <List
              head="What we read"
              // Not named months (review S8): the window is not chain data before the advance. It is
              // what the #17 relay asks AdSense for, so 2a can name it once the relay exists.
              items={["Revenue from the last three complete months", "Your AdSense publisher ID"]}
              icon={<Check className="size-4 text-success" aria-hidden />}
            />
            <List
              head="What we never see"
              items={["Your Google password", "Your other Google data"]}
              icon={<EyeOff className="size-4 text-fg-muted" aria-hidden />}
            />
          </div>
          <Button size="lg" className="w-full py-4 md:w-auto md:self-start" onClick={onProve}>
            Prove my revenue
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:[&>*]:flex-1 lg:items-stretch lg:w-[320px] lg:shrink-0 lg:flex-col lg:[&>*]:flex-none wide:w-[360px]">
        <section className="hidden flex-col gap-4 rounded-card bg-surface p-6 md:flex" aria-label="Your wallet">
          <h2 className="text-card-title text-fg">Your wallet</h2>
          <dl className="flex flex-col gap-4">
            <Row label="Wallet" value={<Ok>{walletName}</Ok>} />
            <Row label="Network" value={<Ok>Stellar testnet</Ok>} />
            <Row label="Can receive USDC" value={<UsdcValue usdc={usdc} />} />
          </dl>
        </section>
        <section className="flex flex-col gap-1.5 rounded-tile bg-brand-subtle p-[18px] md:gap-2.5 md:rounded-card md:p-6">
          <h2 className="text-body font-semibold text-brand-strong">How your advance is set</h2>
          {/* While the rate loads, bars in the shape of the sentence: invisible words of the same length
              and no figure (every figure is the contract's), so the bars wrap as the sentence will at any
              width and the card keeps its height. */}
          <p
            aria-hidden={terms === "loading" || undefined}
            className="text-body text-brand-strong"
          >
            {terms === "loading" ? (
              <span className="animate-pulse rounded-[6px] bg-brand-strong/15 text-transparent [box-decoration-break:clone] motion-reduce:animate-none">
                A part of the revenue you have proven, up to a cap
                <span className="hidden md:inline"> The same proof always gives the same number.</span>
              </span>
            ) : (
              <>
                {terms
                  ? `${shareWords(terms)} of your proven revenue, up to ${usdcWords(terms.capStroops)}.`
                  : "A share of your proven revenue, up to a limit per advance."}
                <span className="hidden md:inline"> The same proof always gives the same number.</span>
              </>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

function List({ head, items, icon }: { head: string; items: string[]; icon: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <p className="text-small font-medium text-fg-muted">{head}</p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          // A long item wraps to a second line (section 08), its icon on the first.
          <li key={item} className="flex items-start gap-2 text-body text-fg [&_svg]:mt-0.5 [&_svg]:shrink-0">
            {icon}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <dt className="text-body text-fg-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Ok({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-body font-medium text-fg">
      <Check className="size-[15px] text-success" aria-hidden />
      {children}
    </span>
  );
}

function UsdcValue({ usdc }: { usdc: UsdcStatus | "error" | undefined }) {
  if (usdc === undefined) return <SkeletonBlock className="h-4 w-10 rounded-chip" />;
  if (usdc === "ready") return <Ok>Yes</Ok>;
  return (
    <span className="flex items-center gap-1.5 text-body font-medium text-brand-strong">
      <CircleAlert className="size-[15px] text-brand" aria-hidden />
      {usdc === "error" ? "Could not check" : "Not allowed yet"}
    </span>
  );
}
