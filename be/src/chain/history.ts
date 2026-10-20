/**
 * A borrower's history with the advance contract, read from Horizon (#16).
 *
 * Why Horizon and not the RPC: the contract keeps no index by borrower, and the RPC's
 * `getEvents` only reaches back about a week, which an advance taken on day 1 of a
 * 30-day grant outlives. Horizon keeps every operation an account submitted, including
 * the ones that failed on the ledger, with the contract call's arguments and the USDC
 * that moved. That is the whole of what /advances and /transactions need.
 *
 * What it cannot see: a transaction that never reached a ledger (refused by the wallet,
 * by simulation, or by the network). Nothing was charged for those and nothing about
 * them is on chain, so they are not listed.
 *
 * The borrower signs `request_advance` and `repay` from their own wallet, so they are
 * the operation's source and the call appears on their account. A call submitted on a
 * borrower's behalf by another account would not; nothing in Forepay does that.
 */
import { createHash } from "node:crypto";

import { scValToNative, xdr } from "@stellar/stellar-sdk";

import { USDC_ASSET } from "../network.js";

/** The fields of a Horizon operation record (joined with its transaction) read here. */
export interface HorizonOperation {
  id: string;
  paging_token: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful: boolean;
  source_account: string;
  // invoke_host_function
  function?: string;
  parameters?: { type: string; value: string }[];
  asset_balance_changes?: { type: string; asset_code?: string; asset_issuer?: string; from?: string; to?: string; amount: string }[];
  // change_trust
  asset_code?: string;
  asset_issuer?: string;
  limit?: string;
}

export type TransactionKind = "advance" | "repayment" | "trustline";

/** One line of the front end's transaction list. Amounts in stroops, times in seconds. */
export interface LedgerTransaction {
  hash: string;
  kind: TransactionKind;
  /** Always positive; the kind says which way it moved. 0 when nothing moved. */
  amount: bigint;
  at: bigint;
  /**
   * `failed`: the transaction reached the ledger and failed. The network fee (XLM) was
   * spent; no USDC moved.
   */
  status: "completed" | "failed";
  /** 32 bytes as hex; empty for a trustline. */
  nullifier: string;
}

/** A `request_advance` the borrower submitted, before the contract's record is read. */
export interface AdvanceCall {
  hash: string;
  at: bigint;
  successful: boolean;
  nullifier: string;
  borrower: string;
  pubId: string;
  windowStart: string;
  windowEnd: string;
  /** USDC received, in stroops; 0 when it failed. */
  disbursed: bigint;
}

/**
 * `sha256(len ‖ pub_id ‖ len ‖ window_start ‖ len ‖ window_end)`, each length a 4-byte
 * big-endian u32. The same derivation as `claim::nullifier_of` in sc/advance.
 */
export function nullifierFor(pubId: string, windowStart: string, windowEnd: string): string {
  const parts: Buffer[] = [];
  for (const field of [pubId, windowStart, windowEnd]) {
    const bytes = Buffer.from(field, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(bytes.length);
    parts.push(len, bytes);
  }
  return createHash("sha256").update(Buffer.concat(parts)).digest("hex");
}

/** `"12.3400000"` (7 decimals, as Horizon writes amounts) to stroops. */
export function toStroops(amount: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(amount);
  if (!m) throw new Error(`not a Horizon amount: ${amount}`);
  return BigInt(m[1]) * 10_000_000n + BigInt((m[2] ?? "").padEnd(7, "0"));
}

function seconds(iso: string): bigint {
  return BigInt(Math.floor(Date.parse(iso) / 1000));
}

function isUsdc(code?: string, issuer?: string): boolean {
  return code === USDC_ASSET.code && issuer === USDC_ASSET.issuer;
}

/** The contract, function and arguments of an `invoke_host_function` that calls `contract`. */
function contractCall(op: HorizonOperation, contract: string): { fn: string; args: unknown[] } | null {
  if (op.type !== "invoke_host_function" || !op.function?.endsWith("InvokeContract")) return null;
  const params = op.parameters ?? [];
  if (params.length < 2) return null;
  const native = params.map((p) => scValToNative(xdr.ScVal.fromXDR(p.value, "base64")));
  if (native[0] !== contract) return null;
  return { fn: String(native[1]), args: native.slice(2) };
}

/** USDC that moved between `a` and `b`, in either direction, in stroops. */
function usdcMoved(op: HorizonOperation, a: string, b: string): bigint {
  let total = 0n;
  for (const c of op.asset_balance_changes ?? []) {
    if (c.type !== "transfer" || !isUsdc(c.asset_code, c.asset_issuer)) continue;
    if ((c.from === a && c.to === b) || (c.from === b && c.to === a)) total += toStroops(c.amount);
  }
  return total;
}

function hex(v: unknown): string {
  return Buffer.isBuffer(v) || v instanceof Uint8Array ? Buffer.from(v).toString("hex") : "";
}

/** The borrower's `request_advance` calls to `contract`, in the order given. */
export function advanceCalls(ops: HorizonOperation[], borrower: string, contract: string): AdvanceCall[] {
  const out: AdvanceCall[] = [];
  for (const op of ops) {
    const call = contractCall(op, contract);
    if (!call || call.fn !== "request_advance") continue;
    const [callBorrower, , pubId, windowStart, windowEnd] = call.args as string[];
    if (callBorrower !== borrower) continue;
    out.push({
      hash: op.transaction_hash,
      at: seconds(op.created_at),
      successful: op.transaction_successful,
      nullifier: nullifierFor(pubId, windowStart, windowEnd),
      borrower: callBorrower,
      pubId,
      windowStart,
      windowEnd,
      disbursed: op.transaction_successful ? usdcMoved(op, contract, borrower) : 0n,
    });
  }
  return out;
}

/** Advances, repayments and the USDC trustline, newest first. */
export function ledgerTransactions(ops: HorizonOperation[], borrower: string, contract: string): LedgerTransaction[] {
  const out: LedgerTransaction[] = [];
  for (const op of ops) {
    const status = op.transaction_successful ? "completed" : "failed";
    const at = seconds(op.created_at);

    if (op.type === "change_trust") {
      // Only the trustline being opened: a limit of 0 removes it, which the app never does.
      if (op.source_account !== borrower || !isUsdc(op.asset_code, op.asset_issuer) || Number(op.limit) === 0) continue;
      out.push({ hash: op.transaction_hash, kind: "trustline", amount: 0n, at, status, nullifier: "" });
      continue;
    }

    const call = contractCall(op, contract);
    if (!call) continue;
    if (call.fn === "request_advance") {
      const [callBorrower, , pubId, windowStart, windowEnd] = call.args as string[];
      if (callBorrower !== borrower) continue;
      out.push({
        hash: op.transaction_hash,
        kind: "advance",
        amount: op.transaction_successful ? usdcMoved(op, contract, borrower) : 0n,
        at,
        status,
        nullifier: nullifierFor(pubId, windowStart, windowEnd),
      });
    } else if (call.fn === "repay") {
      const [from, nullifier, amount] = call.args as [string, Buffer, bigint];
      if (from !== borrower) continue;
      out.push({ hash: op.transaction_hash, kind: "repayment", amount: BigInt(amount), at, status, nullifier: hex(nullifier) });
    }
  }
  return out.sort((x, y) => (x.at === y.at ? 0 : x.at > y.at ? -1 : 1));
}

export interface HorizonDeps {
  horizonUrl: string;
  fetch?: typeof fetch;
  /** Pages of 200 operations; 5 covers 1,000, far beyond a demo account. */
  maxPages?: number;
  timeoutMs?: number;
}

/**
 * Every operation `account` submitted, failed ones included, newest first. An account
 * that does not exist yet has no history: `[]`, not an error.
 */
export async function fetchOperations(account: string, deps: HorizonDeps): Promise<HorizonOperation[]> {
  const get = deps.fetch ?? fetch;
  const maxPages = deps.maxPages ?? 5;
  const base = deps.horizonUrl.replace(/\/+$/, "");
  let url: string | undefined =
    `${base}/accounts/${account}/operations?order=desc&limit=200&include_failed=true&join=transactions`;
  const ops: HorizonOperation[] = [];
  for (let page = 0; url && page < maxPages; page++) {
    const res = await get(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000) });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Horizon answered ${res.status} for ${account}'s operations`);
    const body = (await res.json()) as { _embedded: { records: HorizonOperation[] }; _links?: { next?: { href: string } } };
    const records = body._embedded.records;
    ops.push(...records);
    url = records.length === 200 ? body._links?.next?.href : undefined;
  }
  return ops;
}
