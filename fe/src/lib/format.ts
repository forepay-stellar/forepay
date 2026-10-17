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

/**
 * An attested revenue figure, as the claim carries it (`360.00`, `1240`, `3.2`), in dollars: `$1,240.00`.
 * Text in, text out, so the figure on screen is exactly the one that was proven, never a float.
 */
export function formatUsd(revenueUsd: string): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(revenueUsd.trim());
  if (!m) return revenueUsd;
  const whole = BigInt(m[1]).toLocaleString("en-US");
  return `$${whole}.${(m[2] ?? "").padEnd(2, "0")}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A revenue window from its `YYYY-MM-DD` ends: `short` is `Jul to Sep 2026` (the offer breakdown),
 * `long` is `July to September` (the sentence on the offer). A window that crosses a new year names
 * both years in both forms, `November 2026 to January 2027`, so it never reads as one year's months.
 */
export function formatWindow(start: string, end: string): { short: string; long: string } {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const startShort = sy === ey ? MONTHS[sm - 1] : `${MONTHS[sm - 1]} ${sy}`;
  return {
    short: `${startShort} to ${MONTHS[em - 1]} ${ey}`,
    long:
      sy === ey
        ? `${MONTH_NAMES[sm - 1]} to ${MONTH_NAMES[em - 1]}`
        : `${MONTH_NAMES[sm - 1]} ${sy} to ${MONTH_NAMES[em - 1]} ${ey}`,
  };
}

/** Stroops per XLM. The network fee is paid in XLM, 7 decimals. */
const STROOPS_PER_XLM = 10_000_000n;

/**
 * The most a transaction can cost in network fee, as the 2c row shows it: `Under 0.01 XLM`, or rounded
 * up to the cent of XLM (`Up to 0.04 XLM`) so the figure is never below what the ledger may take.
 */
export function formatXlmFee(stroops: bigint): string {
  const hundredth = STROOPS_PER_XLM / 100n;
  if (stroops < hundredth) return "Under 0.01 XLM";
  const cents = (stroops + hundredth - 1n) / hundredth;
  return `Up to ${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")} XLM`;
}
