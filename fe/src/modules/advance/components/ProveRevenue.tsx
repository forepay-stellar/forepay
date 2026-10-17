import { Check, CircleAlert, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { IlloProvingRevenue } from "@/components/illustrations/ProvingRevenue";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import type { UsdcStatus } from "@/lib/stellar/trustline";

/**
 * 2a Prove revenue. What will be read (AdSense revenue for the last three months, nothing else), what
 * will not, and the button that opens the Reclaim session. Desktop adds the two lists and the wallet
 * card; a phone keeps the card, the button and the rule.
 */
export function ProveRevenue({
  walletName,
  usdc,
  onProve,
}: {
  walletName: string;
  /** Read from the ledger. `undefined` while loading, `"error"` when the read failed. */
  usdc: UsdcStatus | "error" | undefined;
  onProve: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row">
      <section className="flex flex-1 flex-col gap-4 rounded-card bg-surface p-5 lg:flex-row lg:items-center lg:gap-8 lg:p-10">
        <div className="flex h-[170px] w-full shrink-0 items-center justify-center rounded-tile bg-brand-subtle lg:h-[240px] lg:w-[280px]">
          <IlloProvingRevenue />
        </div>
        <div className="flex flex-1 flex-col gap-4 lg:gap-[18px]">
          <h2 className="text-[20px] font-semibold tracking-[-0.3px] text-fg lg:text-[28px] lg:tracking-[-0.6px]">
            See how much you can get
          </h2>
          <p className="text-[15px] leading-[23px] text-fg-muted lg:text-[16px] lg:leading-[24px]">
            Log in to AdSense in a secure window. We read your revenue for the last three months and nothing else.
          </p>
          <div className="hidden gap-6 lg:flex">
            <List
              head="What we read"
              // Not named months: the window comes from the contract's claim template and moves to the
              // next period, and 2a shows before any proof says which (review S8).
              items={["Revenue from the last three complete months", "Your AdSense publisher ID"]}
              icon={<Check className="size-4 text-success" aria-hidden />}
            />
            <List
              head="What we never see"
              items={["Your Google password", "Your other Google data"]}
              icon={<EyeOff className="size-4 text-fg-muted" aria-hidden />}
            />
          </div>
          <Button size="lg" className="w-full py-4 lg:w-auto lg:self-start" onClick={onProve}>
            Prove my revenue
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:w-[380px] lg:shrink-0">
        <section className="hidden flex-col gap-4 rounded-card bg-surface p-6 lg:flex" aria-label="Your wallet">
          <h2 className="text-[18px] font-semibold text-fg">Your wallet</h2>
          <dl className="flex flex-col gap-4">
            <Row label="Wallet" value={<Ok>{walletName}</Ok>} />
            <Row label="Network" value={<Ok>Stellar testnet</Ok>} />
            <Row label="Can receive USDC" value={<UsdcValue usdc={usdc} />} />
          </dl>
        </section>
        <section className="flex flex-col gap-1.5 rounded-tile bg-brand-subtle p-[18px] lg:gap-2.5 lg:rounded-card lg:p-6">
          <h2 className="text-[15px] font-semibold text-brand-strong lg:text-[16px]">How your advance is set</h2>
          <p className="text-[14px] leading-[20px] text-brand-strong lg:leading-[21px]">
            A quarter of your proven revenue, up to 100 USDC.
            <span className="hidden lg:inline"> The same proof always gives the same number.</span>
          </p>
        </section>
      </div>
    </div>
  );
}

function List({ head, items, icon }: { head: string; items: string[]; icon: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-2.5">
      <p className="text-[13px] font-medium text-fg-muted">{head}</p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 whitespace-nowrap text-[14px] text-fg">
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
    <div className="flex items-center justify-between">
      <dt className="text-[14px] text-fg-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Ok({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
      <Check className="size-[15px] text-success" aria-hidden />
      {children}
    </span>
  );
}

function UsdcValue({ usdc }: { usdc: UsdcStatus | "error" | undefined }) {
  if (usdc === undefined) return <SkeletonBlock className="h-4 w-10 rounded-chip" />;
  if (usdc === "ready") return <Ok>Yes</Ok>;
  return (
    <span className="flex items-center gap-1.5 text-[14px] font-medium text-brand-strong">
      <CircleAlert className="size-[15px] text-brand" aria-hidden />
      {usdc === "error" ? "Could not check" : "Not allowed yet"}
    </span>
  );
}
