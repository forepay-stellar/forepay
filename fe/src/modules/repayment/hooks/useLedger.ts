"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdvances, getTransactions } from "@/lib/api/client";
import { readUsdcBalance } from "@/lib/stellar/balance";

/**
 * What 3a and 3b read, through React Query (ARCHITECTURE.md §4). Keys start with the resource and carry
 * the address, so a wallet switch never shows another wallet's numbers. A refetch of the same key keeps
 * the old figures on screen until the new ones arrive; nothing here is ever written by hand.
 */
export const repaymentKey = (address: string) => ["repayment", address] as const;
export const transactionsKey = (address: string) => ["transactions", address] as const;
export const usdcBalanceKey = (address: string) => ["usdc-balance", address] as const;

export function useAdvances(address: string) {
  return useQuery({ queryKey: repaymentKey(address), queryFn: () => getAdvances(address) });
}

export function useTransactions(address: string) {
  return useQuery({ queryKey: transactionsKey(address), queryFn: () => getTransactions(address) });
}

/** The wallet's USDC, read from the ledger. `null` when it holds no USDC trustline. */
export function useUsdcBalance(address: string) {
  return useQuery({ queryKey: usdcBalanceKey(address), queryFn: () => readUsdcBalance(address) });
}
