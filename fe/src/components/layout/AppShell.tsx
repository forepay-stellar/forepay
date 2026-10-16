"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { WalletChip } from "@/components/elements/WalletChip";
import { useWallet } from "@/providers/WalletProvider";
import { MobileHeader } from "./MobileHeader";
import { TabBar } from "./TabBar";
import { TopNav } from "./TopNav";

/**
 * The frame of every screen after onboarding (Advance, Repayment, History).
 *
 * Desktop (lg, 1440 frame): an 80px margin, the 90px top nav, then the screen 32px below it. A phone
 * (390 frame): the 64px header, the screen 16px below it with a 16px margin, and the tab bar pinned to
 * the bottom, so the screen keeps 120px free underneath to scroll clear of it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { address, walletName, disconnect } = useWallet();
  if (!address) return null;

  const wallet = (
    <WalletChip
      address={address}
      walletName={walletName}
      onDisconnect={async () => {
        await disconnect();
        router.replace("/start");
      }}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pb-[120px] lg:px-20 lg:pb-16">
      <TopNav wallet={wallet} />
      <MobileHeader wallet={wallet} />
      {/* The gap under the top nav is the page's own: 32 on 2a to 2d, 28 on 3a and 3b. */}
      <main className="flex flex-1 flex-col px-4 pt-4 lg:px-0 lg:pt-0">{children}</main>
      <TabBar />
    </div>
  );
}
