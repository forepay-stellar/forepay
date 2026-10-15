"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useWallet } from "@/providers/WalletProvider";

// Ported from Sorosense `AuthGate`. Wait for the saved session to be re-checked before deciding, or a
// hard reload would bounce a valid session out to onboarding.
export function WalletGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { hydrated, isConnected } = useWallet();
  useEffect(() => {
    if (hydrated && !isConnected) router.replace("/start");
  }, [hydrated, isConnected, router]);
  if (!hydrated || !isConnected) return <div className="min-h-dvh bg-canvas" />;
  return <>{children}</>;
}
