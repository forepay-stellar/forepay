import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Logo";
import { NetworkChip } from "@/components/ui/NetworkChip";
import { SegmentedTabs } from "./TabBar";

/** Top nav from "05 Product components": wordmark, Advance / Repayment / History, Testnet and the wallet. */
export function TopNav({ wallet }: { wallet: ReactNode }) {
  return (
    // From 768 (section 08): the tablet has the top nav too, across the full gutter-to-gutter width; on
    // desktop it lines up with the 1200 content.
    // Nothing in it shrinks: the wordmark, tabs and chips keep the sizes drawn, and the tabs tighten
    // below 834 so the row fits from 768 (see `--breakpoint-nav`).
    <header className="mx-auto hidden h-[90px] w-full items-center justify-between gap-2 md:flex nav:gap-3 lg:max-w-[1200px] [&>*]:shrink-0">
      <Wordmark />
      <SegmentedTabs />
      <div className="flex items-center gap-3">
        <NetworkChip />
        {wallet}
      </div>
    </header>
  );
}
