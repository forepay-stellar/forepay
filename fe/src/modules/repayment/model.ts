import type { AdvanceSummary, LedgerTransaction } from "@/lib/api/types";
import { formatDate, parseUsdc, usdcParts } from "@/lib/format";

/**
 * The arithmetic of 03 Repayment, kept out of the components so it can be tested on its own. Every
 * input here comes from the API (#16) or the ledger; nothing is remembered from what the screen sent.
 */

/** 0.01 USDC in stroops. Chips round down to the cent so they never ask for a fraction of one. */
const CENT = 100_000n;

/**
 * The advance the screen is about. The contract allows one advance per revenue period, so a creator
 * may hold more than one (ARCHITECTURE.md §9). The screen is built for one: the newest that still has
 * something to repay, or the newest when everything is repaid. `number` counts from the oldest, so the
 * first advance a creator took is always "Advance 1".
 */
export function pickAdvance(advances: AdvanceSummary[]): { advance: AdvanceSummary; number: number } | null {
  if (advances.length === 0) return null;
  const byAge = [...advances].sort((a, b) => (a.openedAt < b.openedAt ? -1 : a.openedAt > b.openedAt ? 1 : 0));
  const open = [...byAge].reverse().find((a) => a.principal > a.repaid);
  const advance = open ?? byAge[byAge.length - 1];
  return { advance, number: byAge.indexOf(advance) + 1 };
}

export function outstanding(advance: AdvanceSummary): bigint {
  const left = advance.principal - advance.repaid;
  return left > 0n ? left : 0n;
}

/** Whole percent repaid, rounded down, so the bar never claims more than the ledger holds. */
export function percentRepaid(advance: AdvanceSummary): number {
  if (advance.principal <= 0n) return 0;
  const p = (advance.repaid * 100n) / advance.principal;
  return Number(p > 100n ? 100n : p);
}

/** `$360.00` from cents, with thousands grouped. */
export function formatUsd(cents: bigint): string {
  return `$${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
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

/** The attested window, `2026-07-01` and `2026-09-30` → `Jul to Sep 2026`. */
export function windowLabel(start: string, end: string): string {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return `${start} to ${end}`;
  if (sy === ey) return `${MONTHS[sm - 1]} to ${MONTHS[em - 1]} ${ey}`;
  return `${MONTHS[sm - 1]} ${sy} to ${MONTHS[em - 1]} ${ey}`;
}

/**
 * "How it was sized" in Advance details. The rule is the contract's (`docs/interface.md` §5, 25% of the
 * proven revenue, capped). The screen only says which side of the cap this advance landed on, by
 * comparing the principal the contract paid with a quarter of the revenue it was sized from.
 */
export function sizingLabel(advance: AdvanceSummary): string {
  const quarterOfRevenue = (advance.revenueCents * CENT) / 4n;
  if (advance.principal < quarterOfRevenue) {
    const { whole, decimals } = usdcParts(advance.principal);
    return `Capped at ${whole}${decimals} USDC`;
  }
  return `25% of ${formatUsd(advance.revenueCents)}`;
}

// ---- The repay form ----

/** What the creator typed, as a string the amount field accepts. Digits and up to 7 decimals. */
export function sanitizeAmountInput(raw: string): string | null {
  const v = raw.replace(",", ".");
  if (v === "") return "";
  if (!/^\d*\.?\d{0,7}$/.test(v)) return null;
  return v.startsWith(".") ? `0${v}` : v;
}

/** Stroops back to a plain string for the amount field: `300000000` → `30.00`, never grouped. */
export function amountInputString(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  let decimals = (stroops % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  if (decimals.length < 2) decimals = decimals.padEnd(2, "0");
  return `${whole}.${decimals}`;
}

/** The typed amount in stroops, or null when nothing (or zero) is typed. */
export function typedAmount(input: string): bigint | null {
  const v = input.endsWith(".") ? input.slice(0, -1) : input;
  if (v === "") return null;
  const stroops = parseUsdc(v);
  return stroops && stroops > 0n ? stroops : null;
}

/**
 * The amount field shows money the way the design does: what was typed solid, the rest of `0.00`
 * faded. `30` → `30` + `.00`, `30.5` → `30.5` + `0`, nothing → `` + `0.00`.
 */
export function amountDisplay(input: string): { typed: string; ghost: string } {
  if (input === "") return { typed: "", ghost: "0.00" };
  const dot = input.indexOf(".");
  if (dot === -1) return { typed: input, ghost: ".00" };
  const decimals = input.length - dot - 1;
  return { typed: input, ghost: decimals >= 2 ? "" : "0".repeat(2 - decimals) };
}

export type Chip = "quarter" | "half" | "full";

/** 25% and 50% of what is left, rounded down to the cent. Full is exactly what is left. */
export function chipAmount(chip: Chip, left: bigint): bigint {
  if (chip === "full") return left;
  const part = chip === "quarter" ? left / 4n : left / 2n;
  return (part / CENT) * CENT;
}

export type AmountCheck =
  | { kind: "empty" }
  | { kind: "ok"; amount: bigint }
  /** The contract refuses this with 51 RepaymentExceedsOutstanding, so the form stops it first. */
  | { kind: "overOutstanding"; amount: bigint }
  /** The wallet cannot cover it. Only checked when the balance was read; no trustline holds zero. */
  | { kind: "overBalance"; amount: bigint };

export function checkAmount(input: string, left: bigint, balance: bigint | null | undefined): AmountCheck {
  const amount = typedAmount(input);
  if (amount === null) return { kind: "empty" };
  if (amount > left) return { kind: "overOutstanding", amount };
  if (balance !== undefined && amount > (balance ?? 0n)) return { kind: "overBalance", amount };
  return { kind: "ok", amount };
}

// ---- Transactions ----

/** One line of the lists, from the API, or the repayment the wallet just sent. */
export type Row =
  | { kind: "advance" | "repayment"; key: string; hash: string; amount: bigint; at: bigint; failed: boolean }
  | { kind: "proof"; key: string; hash: string; revenueCents: bigint; at: bigint; failed: false }
  | { kind: "trustline"; key: string; hash: string; at: bigint; failed: boolean }
  | { kind: "pending"; key: string; hash: string; amount: bigint };

function fromLedger(t: LedgerTransaction): Row {
  if (t.kind === "trustline") return { kind: "trustline", key: t.hash, hash: t.hash, at: t.at, failed: t.status === "failed" };
  return { kind: t.kind, key: t.hash, hash: t.hash, amount: t.amount, at: t.at, failed: t.status === "failed" };
}

const byTimeThenKind = (rank: Record<string, number>) => (a: Row, b: Row) => {
  const at = (r: Row) => ("at" in r ? r.at : 0n);
  if (at(a) !== at(b)) return at(a) < at(b) ? -1 : 1;
  return (rank[a.kind] ?? 0) - (rank[b.kind] ?? 0);
};

/**
 * 3a "Transactions": the advance and its repayments, the latest four, oldest of them first, as the
 * design lists them. A repayment the wallet has sent and Stellar has not confirmed yet goes last.
 */
export function latestRows(transactions: LedgerTransaction[], nullifier: string, limit = 4): Row[] {
  const rows = transactions
    .filter((t) => t.nullifier === nullifier && (t.kind === "advance" || t.kind === "repayment"))
    .map(fromLedger)
    .sort(byTimeThenKind({ advance: 0, repayment: 1 }));
  return rows.slice(-limit);
}

/**
 * 3b "All transactions": everything behind this advance, newest first. The proof row is the advance's
 * own transaction (the contract verifies the proof and pays out in one call), so it shares its receipt.
 * Allowing USDC belongs to the wallet, not to one advance, so it is listed whatever the advance.
 */
export function historyRows(transactions: LedgerTransaction[], advance: AdvanceSummary): Row[] {
  const rows: Row[] = transactions
    .filter((t) => t.kind === "trustline" || t.nullifier === advance.nullifier)
    .map(fromLedger);
  rows.push({
    kind: "proof",
    key: `proof-${advance.txHash}`,
    hash: advance.txHash,
    revenueCents: advance.revenueCents,
    at: advance.openedAt,
    failed: false,
  });
  // Oldest first with ties in the order they happened (allow USDC, prove, receive), then reversed.
  return rows.sort(byTimeThenKind({ trustline: 0, proof: 1, advance: 2, repayment: 3 })).reverse();
}

/** Rows grouped under `October 2026`, newest month first. Rows keep their order. */
export function groupByMonth(rows: Row[]): { month: string; rows: Row[] }[] {
  const groups: { month: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const d = new Date(Number("at" in row ? row.at : 0n) * 1000);
    const month = `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
}

/** `Today` for a row from today, otherwise `20 Oct 2026`. No clock time (brief §3, rule 6). */
export function rowDate(at: bigint, now: Date = new Date()): string {
  const label = formatDate(new Date(Number(at) * 1000));
  return label === formatDate(now) ? "Today" : label;
}
