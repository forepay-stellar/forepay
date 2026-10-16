/** `GBX4…7QPA`: the first and last four characters, as the wallet chip shows an address. */
export function shortAddress(address: string): string {
  if (address.length <= 9) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** USDC has 7 decimals on chain (`docs/interface.md` §5, read from chain, not assumed). */
const STROOPS_PER_USDC = 10_000_000n;

/**
 * A stroop amount split the way the design shows money: whole part solid, two decimals faded
 * (`300` + `.00`). Rounds down to the cent, so the screen never shows more than the ledger holds.
 * Thousands are grouped: `1,240`.
 */
export function usdcParts(stroops: bigint): { whole: string; decimals: string } {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const cents = abs / 100_000n;
  const whole = (cents / 100n).toLocaleString("en-US");
  const decimals = `.${(cents % 100n).toString().padStart(2, "0")}`;
  return { whole: negative ? `-${whole}` : whole, decimals };
}

/** `300.00 USDC`, for places that show the figure as one string. */
export function formatUsdc(stroops: bigint): string {
  const { whole, decimals } = usdcParts(stroops);
  return `${whole}${decimals} USDC`;
}

/** Whole USDC, as a user typed it, to stroops. Up to 7 decimals. Null when it is not a plain amount. */
export function parseUsdc(input: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(input.trim());
  if (!m) return null;
  return BigInt(m[1]) * STROOPS_PER_USDC + BigInt((m[2] ?? "").padEnd(7, "0") || "0");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `12 Oct 2026`. No clock time: a time needs a colon, which the copy rules leave out (brief §3). */
export function formatDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** A ledger timestamp (seconds) as a date. */
export function formatLedgerTime(seconds: bigint | number): string {
  return formatDate(new Date(Number(seconds) * 1000));
}
