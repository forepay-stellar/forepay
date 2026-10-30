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
  /**
   * Where the revenue was earned (#97), read by #107 from the `request_advance` call. An API from before
   * #107 sends none, and every advance it lists is AdSense's.
   */
  source: "AdSense" | "AdMob";
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

/**
 * `trustline` is the wallet allowing USDC (#19), listed on 3b "All transactions". It belongs to the
 * wallet, not to one advance, so its `nullifier` is empty. Added by #21: agree it with @Lin1er for #16.
 */
export type TransactionKind = "advance" | "repayment" | "trustline";

/** One line of 3a "Transactions" and 3b "All transactions". */
export type LedgerTransaction = {
  hash: string;
  kind: TransactionKind;
  /** Stroops, always positive. The kind says which way it moved. */
  amount: bigint;
  /** Ledger timestamp in seconds. */
  at: bigint;
  /**
   * `failed`: it reached the ledger and failed there, so the network fee was spent and no USDC moved
   * (#16). A transaction that never reached a ledger is not listed.
   */
  status: "completed" | "failed";
  nullifier: string;
};
