"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWallet } from "@/providers/WalletProvider";

// The root route. No wallet goes to onboarding, a connected wallet to the app (ARCHITECTURE.md §2).
export function RootRedirect() {
  const router = useRouter();
  const { hydrated, isConnected } = useWallet();
  useEffect(() => {
    if (hydrated) router.replace(isConnected ? "/advance" : "/start");
  }, [hydrated, isConnected, router]);
  return <div className="min-h-dvh bg-canvas" />;
}
