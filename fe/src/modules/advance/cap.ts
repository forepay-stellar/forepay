import { formatUsdc } from "@/lib/format";
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

/** `25%`: the contract's rate. Whole percents, as the rate is today. */
export function ratePercent(s: Sizing): string {
  return `${(s.rateNum * 100n) / s.rateDen}%`;
}

/** `× 25%` for the breakdown, from the contract's rate. */
export function rateLabel(s: Sizing): string {
  return `× ${ratePercent(s)}`;
}

/** The rate as a sentence opens with it: `A quarter` for 25%, as the board words it, `Half`, or `40%`. */
export function shareWords(s: Sizing): string {
  const pct = (s.rateNum * 100n) / s.rateDen;
  if (pct * s.rateDen !== s.rateNum * 100n) return ratePercent(s);
  return pct === 25n ? "A quarter" : pct === 50n ? "Half" : `${pct}%`;
}

/** `100 USDC`, `1 USDC`: a whole amount in a sentence, as the board writes the cap and the minimum. */
export function usdcWords(stroops: bigint): string {
  return stroops % 10_000_000n === 0n ? `${stroops / 10_000_000n} USDC` : formatUsdc(stroops);
}
