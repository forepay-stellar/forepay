"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/Toaster";
import { QueryProvider } from "./QueryProvider";
import { WalletProvider } from "./WalletProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <WalletProvider>
        {children}
        <Toaster />
      </WalletProvider>
    </QueryProvider>
  );
}
