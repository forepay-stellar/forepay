import {
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { sourceAccount } from "./account";
import { ADVANCE_CONTRACT_ID as CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from "./network";
import { SubmitError, submitSigned, waitFor } from "./submit";

/**
 * The advance contract, as the app calls it (ARCHITECTURE.md §6). Shared by #20 and #21.
 *
 * Reads simulate and never sign. Writes simulate, are signed in the wallet, then submitted and polled
 * until the ledger answers. A contract refusal becomes a `ContractError` carrying the code from
 * `docs/interface.md` §7, which `contractFailureCopy` in `lib/errors.ts` turns into words.
 *
 * Amounts are i128 stroops on chain (7 decimals for USDC) and `bigint` here. Convert only in
 * `lib/format.ts`.
 */

/** A refusal by the advance contract. `code` is the number in `docs/interface.md` §7. */
export class ContractError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "ContractError";
    this.code = code;
  }
}

/** A write that reached the network but did not succeed, with no contract code to explain it. */
export class TransactionFailedError extends Error {
  /** Whether the ledger took it, and with it the fee. */
  charged: boolean;
  /** Sent, but not confirmed while we waited. It may still land, so nothing is known either way. */
  unconfirmed: boolean;
  /** Unconfirmed because the network gave no answer at all, not because the ledger said "not yet". */
  noAnswer: boolean;
  /** For a ledger's "not yet": that ledger's close time, in seconds (see `SubmitError.ledgerTime`). */
  ledgerTime?: number;
  constructor(message: string, charged: boolean, unconfirmed = false, noAnswer = false, ledgerTime?: number) {
    super(message);
    this.name = "TransactionFailedError";
    this.charged = charged;
    this.unconfirmed = unconfirmed;
    this.noAnswer = noAnswer;
    this.ledgerTime = ledgerTime;
  }
}

/** A simulation the network refused with no contract code to explain it (a host trap, an auth failure). */
export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationError";
  }
}

/** The app was built without an address or URL it needs. Nothing reached the network. */
export class MissingConfigError extends Error {
  constructor(name: string) {
    super(`${name} is not set`);
    this.name = "MissingConfigError";
  }
}

/** One advance, as the contract stores it (`Advance` in sc/advance/src/lib.rs). */
export type OnChainAdvance = {
  borrower: string;
  pubId: string;
  windowStart: string;
  windowEnd: string;
  revenueCents: bigint;
  principal: bigint;
  repaid: bigint;
  openedAt: bigint;
};

let rpcServer: rpc.Server | null = null;

/** One client for this module, built on first use, not once per call (review M10). */
function server() {
  if (!RPC_URL) throw new MissingConfigError("NEXT_PUBLIC_STELLAR_RPC_URL");
  return (rpcServer ??= new rpc.Server(RPC_URL));
}

function contract() {
  if (!CONTRACT_ID) throw new MissingConfigError("NEXT_PUBLIC_ADVANCE_CONTRACT_ID");
  return new Contract(CONTRACT_ID);
}

/** `Error(Contract, #20)` in a simulation or result → 20. */
export function contractCode(message: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(message);
  return m ? Number(m[1]) : null;
}

async function build(source: string, method: string, args: xdr.ScVal[]) {
  const account = await sourceAccount(server(), source);
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract().call(method, ...args))
    .setTimeout(180)
    .build();
}

async function simulate(source: string, method: string, args: xdr.ScVal[]) {
  const tx = await build(source, method, args);
  const sim = await server().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    const code = contractCode(sim.error);
    if (code !== null) throw new ContractError(code, sim.error);
    throw new SimulationError(sim.error);
  }
  return { tx, sim };
}

/** A read. `source` is any funded account; the connected wallet is the natural one. */
async function read<T>(source: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const { sim } = await simulate(source, method, args);
  const value = sim.result?.retval;
  return (value ? scValToNative(value) : undefined) as T;
}

/** About two minutes, one attempt a second: the "Timed out" state on the Prove and accept board. */
const WRITE_ATTEMPTS = 120;

/** `submit.ts`'s outcome in the words the contract's callers use. */
function asTransactionFailed(e: unknown): unknown {
  if (!(e instanceof SubmitError)) return e;
  return new TransactionFailedError(
    e.message,
    e.outcome === "failed",
    e.outcome === "unconfirmed",
    e.noAnswer,
    e.ledgerTime,
  );
}

/** A write, signed in the wallet. Resolves with the transaction hash and the returned value. */
async function write<T>(
  source: string,
  method: string,
  args: xdr.ScVal[],
  signTransaction: (xdr: string) => Promise<string>,
  onSent?: (hash: string, validUntil?: number) => void,
): Promise<{ hash: string; value: T }> {
  const { tx, sim } = await simulate(source, method, args);
  const prepared = rpc.assembleTransaction(tx, sim).build();
  const signed = await signTransaction(prepared.toXDR());
  try {
    const { hash, result } = await submitSigned(server(), signed, { attempts: WRITE_ATTEMPTS, onSent });
    const value = result.returnValue ? scValToNative(result.returnValue) : undefined;
    return { hash, value: value as T };
  } catch (e) {
    throw asTransactionFailed(e);
  }
}

const str = (v: string) => nativeToScVal(v, { type: "string" });
const bytes32 = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));

// ---- Reads ----

/** The advance this attested revenue would size to, in stroops. The figure 2b shows (#20). */
export function quote(source: string, revenueUsd: string): Promise<bigint> {
  return read<bigint>(source, "quote", [str(revenueUsd)]);
}

/** The constants `quote` sizes an advance from (`docs/interface.md` §5, #63), all integers. */
export type Sizing = {
  /** The share of proven revenue advanced: `rateNum / rateDen`, 25 / 100 today. */
  rateNum: bigint;
  rateDen: bigint;
  /** The most one advance can be, in stroops. */
  capStroops: bigint;
  /** The least the contract will send, in stroops. */
  minStroops: bigint;
  /** Stroops per US cent of proven revenue. */
  stroopsPerCent: bigint;
};

/** How the contract sizes an advance: read from it, so no rate or cap is written into the app. */
export async function sizing(source: string): Promise<Sizing> {
  const raw = await read<Record<string, bigint>>(source, "sizing");
  return {
    rateNum: BigInt(raw.rate_num),
    rateDen: BigInt(raw.rate_den),
    capStroops: BigInt(raw.cap_stroops),
    minStroops: BigInt(raw.min_stroops),
    stroopsPerCent: BigInt(raw.stroops_per_cent),
  };
}

/** How much USDC the contract can still lend, in stroops. Below a quote, advances are paused. */
export function liquidity(source: string): Promise<bigint> {
  return read<bigint>(source, "liquidity");
}

/** The advance a nullifier funded, or null. `nullifier` is 32 bytes as hex (#21). */
export async function getAdvance(source: string, nullifier: string): Promise<OnChainAdvance | null> {
  const raw = await read<Record<string, unknown> | undefined>(source, "advance", [bytes32(nullifier)]);
  if (!raw) return null;
  return {
    borrower: raw.borrower as string,
    pubId: raw.pub_id as string,
    windowStart: raw.window_start as string,
    windowEnd: raw.window_end as string,
    revenueCents: raw.revenue_cents as bigint,
    principal: raw.principal as bigint,
    repaid: raw.repaid as bigint,
    openedAt: raw.opened_at as bigint,
  };
}

/** The nullifier an advance for this publisher and window is stored under, as hex (#20, #21). */
export async function nullifierFor(
  source: string,
  pubId: string,
  windowStart: string,
  windowEnd: string,
): Promise<string> {
  const raw = await read<Uint8Array>(source, "nullifier_for", [str(pubId), str(windowStart), str(windowEnd)]);
  return Buffer.from(raw).toString("hex");
}

// ---- Writes ----

/** The arguments `request_advance` takes besides the borrower. They come from the #17 relay. */
export type AdvanceRequest = {
  revenueUsd: string;
  pubId: string;
  windowStart: string;
  windowEnd: string;
  timestampS: bigint;
  epoch: bigint;
  /** 64 bytes, hex. */
  signature: string;
  recoveryId: number;
};

function advanceArgs(borrower: string, req: AdvanceRequest): xdr.ScVal[] {
  return [
    new Address(borrower).toScVal(),
    str(req.revenueUsd),
    str(req.pubId),
    str(req.windowStart),
    str(req.windowEnd),
    nativeToScVal(req.timestampS, { type: "u64" }),
    nativeToScVal(req.epoch, { type: "u64" }),
    xdr.ScVal.scvBytes(Buffer.from(req.signature, "hex")),
    nativeToScVal(req.recoveryId, { type: "u32" }),
  ];
}

/**
 * `request_advance` simulated, never signed or sent: the contract checks the proof, its age, the
 * nullifier, its liquidity and the borrower's trustline exactly as it would for real, and refuses with
 * the same codes. 2a runs it before showing an offer ("Checking your proof"). Resolves with the stroops
 * it would disburse.
 */
export function checkAdvance(borrower: string, req: AdvanceRequest): Promise<bigint> {
  return read<bigint>(borrower, "request_advance", advanceArgs(borrower, req));
}

/**
 * The stroops a landed `request_advance` returned. One that landed without them is not shown as
 * "0 USDC received": it is an answer we did not expect, and History has the truth.
 */
function disbursed(value: unknown): bigint {
  if (typeof value !== "bigint") throw new Error("The ledger answered without the amount disbursed");
  return value;
}

/**
 * Prove, size and disburse in one call (#20). Resolves with the stroops disbursed. `onSent` gets the
 * hash once the network has taken it, so a caller can come back to it (`awaitAdvance`).
 */
export async function requestAdvance(
  borrower: string,
  req: AdvanceRequest,
  signTransaction: (xdr: string) => Promise<string>,
  onSent?: (hash: string, validUntil?: number) => void,
): Promise<{ hash: string; value: bigint }> {
  const args = advanceArgs(borrower, req);
  const { hash, value } = await write<unknown>(borrower, "request_advance", args, signTransaction, onSent);
  return { hash, value: disbursed(value) };
}

/** Wait again for a `request_advance` already sent: the same answer `requestAdvance` would have given. */
export async function awaitAdvance(hash: string): Promise<{ hash: string; value: bigint }> {
  let returned: unknown;
  try {
    const { result } = await waitFor(server(), hash, WRITE_ATTEMPTS);
    returned = result.returnValue ? scValToNative(result.returnValue) : undefined;
  } catch (e) {
    throw asTransactionFailed(e);
  }
  return { hash, value: disbursed(returned) };
}

/** Repay part or all of an advance (#21). Resolves with what is still outstanding, in stroops. */
export function repay(
  from: string,
  nullifier: string,
  amount: bigint,
  signTransaction: (xdr: string) => Promise<string>,
  onSent?: (hash: string, validUntil?: number) => void,
): Promise<{ hash: string; value: bigint }> {
  return write<bigint>(
    from,
    "repay",
    [new Address(from).toScVal(), bytes32(nullifier), nativeToScVal(amount, { type: "i128" })],
    signTransaction,
    onSent,
  );
}

/** Wait again for a `repay` already sent (#21), by its hash. Resolves once the ledger confirms it. */
export async function awaitRepay(hash: string): Promise<{ hash: string }> {
  try {
    await waitFor(server(), hash, WRITE_ATTEMPTS);
    return { hash };
  } catch (e) {
    throw asTransactionFailed(e);
  }
}
