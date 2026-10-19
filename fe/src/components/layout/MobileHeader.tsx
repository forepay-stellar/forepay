import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Logo";
import { NetworkChip } from "@/components/ui/NetworkChip";

/** Mobile header from "05 Product components": the mark, Testnet and the wallet. The tabs sit at the bottom. */
export function MobileHeader({ wallet }: { wallet: ReactNode }) {
  return (
    <header className="flex h-16 items-center justify-between px-4 md:hidden">
      <Mark />
      <div className="flex items-center gap-2">
        <NetworkChip />
        {wallet}
      </div>
    </header>
  );
}
