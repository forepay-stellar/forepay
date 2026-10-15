"use client";

import { useQuery } from "@tanstack/react-query";
import { readUsdcStatus } from "@/lib/stellar/trustline";

/** Whether the connected wallet can receive USDC, read from the ledger, never remembered. */
export function useUsdcStatus(address: string | null | undefined) {
  return useQuery({
    queryKey: ["usdc-status", address],
    queryFn: () => readUsdcStatus(address as string),
    enabled: !!address,
  });
}
