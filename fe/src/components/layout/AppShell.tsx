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
 * Three layouts, from section 08 of the design ("Layout and responsive"):
 * - Phone, under 768: the 64px header, the screen 16px below it with a 16px gutter, and the tab bar
 *   pinned to the bottom, so the screen keeps 120px free underneath to scroll clear of it.
 * - Tablet, 768 to 1023: the top nav, a 32px gutter, and one column up to 640 wide, centred.
 * - Desktop, 1024 and up: the top nav, content up to 1200 wide and centred, a 40px gutter (80 from
 *   1280). Each screen lays out its main and side columns inside that.
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
    <div className="flex min-h-dvh flex-col bg-canvas pb-[120px] md:px-8 md:pb-16 lg:px-10 xl:px-20">
      <TopNav wallet={wallet} />
      <MobileHeader wallet={wallet} />
      {/* The gap under the top nav is the page's own: 32 on 2a to 2d, 28 on 3a and 3b. */}
      <main className="mx-auto flex w-full flex-1 flex-col px-4 pt-4 md:max-w-[640px] md:px-0 md:pt-0 lg:max-w-[1200px]">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
