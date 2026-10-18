import type { Sizing } from "@/lib/stellar/contract";

/** `"360.00"` → 36000n: the attested revenue figure in US cents. */
export function revenueCents(revenueUsd: string): bigint {
  const [whole, frac = ""] = revenueUsd.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

/**
 * Whether the cap cut this advance: the share of revenue the contract's own constants give is more than
 * its cap. At exactly $400.00 the quarter is the cap itself, and the cap did nothing (#20 review S5).
 * The figure shown is still `quote`'s; this only says which sentence describes it.
 */
export function isCapped(s: Sizing, revenueUsd: string): boolean {
  const uncapped = (revenueCents(revenueUsd) * s.stroopsPerCent * s.rateNum) / s.rateDen;
  return uncapped > s.capStroops;
}

/** `× 25%` for the breakdown, from the contract's rate. Whole percents, as the rate is today. */
export function rateLabel(s: Sizing): string {
  return `× ${(s.rateNum * 100n) / s.rateDen}%`;
}
