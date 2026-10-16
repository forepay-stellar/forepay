import { parseUsdc } from "@/lib/format";
import { CENT } from "@/lib/ledger";

/**
 * The repay form's rules (3a "Make a repayment", board row 2), kept out of the component so they can be
 * tested on its own. Chips round down to the cent so they never ask for a fraction of one.
 */

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
 * The amount field shows money the way the design does (brief §3, "decimals faded"): the whole part
 * solid, the decimals faded, padded to two. `30` → `30` + `.00`, `30.5` → `30` + `.50`, nothing → `0.00`
 * all faded.
 */
export function amountDisplay(input: string): { whole: string; decimals: string } {
  if (input === "") return { whole: "", decimals: "0.00" };
  const dot = input.indexOf(".");
  if (dot === -1) return { whole: input, decimals: ".00" };
  const typed = input.slice(dot);
  return { whole: input.slice(0, dot), decimals: typed.length >= 3 ? typed : typed.padEnd(3, "0") };
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
