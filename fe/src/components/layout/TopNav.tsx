import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Logo";
import { NetworkChip } from "@/components/ui/NetworkChip";
import { SegmentedTabs } from "./TabBar";

/** Top nav from "05 Product components": wordmark, Advance / Repayment / History, Testnet and the wallet. */
export function TopNav({ wallet }: { wallet: ReactNode }) {
  return (
    <header className="hidden h-[90px] items-center justify-between lg:flex">
      <Wordmark />
      <SegmentedTabs />
      <div className="flex items-center gap-3">
        <NetworkChip />
        {wallet}
      </div>
    </header>
  );
}
