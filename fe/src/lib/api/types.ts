/**
 * What the front end reads from the #16 API (ARCHITECTURE.md §6). Shared by #20 and #21.
 *
 * PROVISIONAL: #16 has not defined these routes yet. The shapes follow the contract's own `Advance`
 * struct and `docs/interface.md`, and must be agreed with @Lin1er before #16 lands. Change them here
 * only; screens import these types and nothing else from the API.
 */

/** One advance, with what has been repaid. Amounts in stroops (7 decimals). */
export type AdvanceSummary = {
  /** 32 bytes as hex. `repay` takes it (ARCHITECTURE.md §10, question 1). */
  nullifier: string;
  borrower: string;
  /** The attested three-month window, `YYYY-MM-DD`. */
  windowStart: string;
  windowEnd: string;
  /** The proven revenue the advance was sized from, in cents. */
  revenueCents: bigint;
  principal: bigint;
  repaid: bigint;
  /** Ledger timestamp of the disbursement, in seconds. */
  openedAt: bigint;
  /** The disbursement transaction. */
  txHash: string;
};

export type TransactionKind = "advance" | "repayment";

/** One line of 3a "Transactions" and 3b "All transactions". */
export type LedgerTransaction = {
  hash: string;
  kind: TransactionKind;
  /** Stroops, always positive. The kind says which way it moved. */
  amount: bigint;
  /** Ledger timestamp in seconds. */
  at: bigint;
  /** A failed repayment is shown, struck through, with "not charged" (3a states). */
  status: "completed" | "failed";
  nullifier: string;
};
