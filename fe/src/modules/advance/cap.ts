/**
 * The revenue figure one cent lower, `"400.00"` → `"399.99"`, or null at zero. An offer at the limit
 * was cut by it only if this figure quotes at the limit too: at exactly $400.00 the quarter is 100 USDC
 * and the limit did nothing (review S5). The contract answers both, so nothing here sizes an advance.
 */
export function centBelow(revenueUsd: string): string | null {
  const [whole, frac = ""] = revenueUsd.split(".");
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
  if (cents <= 0n) return null;
  const below = cents - 1n;
  return `${below / 100n}.${(below % 100n).toString().padStart(2, "0")}`;
}
