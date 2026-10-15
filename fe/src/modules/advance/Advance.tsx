"use client";

import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand/Logo";
import { WalletChip } from "@/components/elements/WalletChip";
import { NetworkChip } from "@/components/ui/NetworkChip";
import { useWallet } from "@/providers/WalletProvider";

/**
 * Placeholder for 02 Prove and accept. #20 replaces this whole module with 2a to 2d; it exists so
 * onboarding has somewhere to land and the wallet chip and its menu can be used after connecting.
 */
export function Advance() {
  const router = useRouter();
  const { address, walletName, disconnect } = useWallet();
  if (!address) return null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-4 lg:px-20">
      <header className="flex h-[60px] items-center justify-between lg:h-[90px]">
        <Wordmark />
        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline-flex">
            <NetworkChip />
          </span>
          <WalletChip
            address={address}
            walletName={walletName}
            onDisconnect={async () => {
              await disconnect();
              router.replace("/start");
            }}
          />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p className="text-[15px] text-fg-muted">Proving your revenue opens here next.</p>
      </main>
    </div>
  );
}
