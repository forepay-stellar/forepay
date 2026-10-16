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
import { NETWORK_PASSPHRASE, RPC_URL } from "./network";

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
const CONTRACT_ID = process.env.NEXT_PUBLIC_ADVANCE_CONTRACT_ID ?? "";

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
  constructor(message: string, charged: boolean) {
    super(message);
    this.name = "TransactionFailedError";
    this.charged = charged;
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

function server() {
  if (!RPC_URL) throw new Error("NEXT_PUBLIC_STELLAR_RPC_URL is not set");
  return new rpc.Server(RPC_URL);
}

function contract() {
  if (!CONTRACT_ID) throw new Error("NEXT_PUBLIC_ADVANCE_CONTRACT_ID is not set");
  return new Contract(CONTRACT_ID);
}

/** `Error(Contract, #20)` in a simulation or result → 20. */
export function contractCode(message: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(message);
  return m ? Number(m[1]) : null;
}

async function build(source: string, method: string, args: xdr.ScVal[]) {
  const account = await server().getAccount(source);
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
    throw new Error(sim.error);
  }
  return { tx, sim };
}

/** A read. `source` is any funded account; the connected wallet is the natural one. */
async function read<T>(source: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const { sim } = await simulate(source, method, args);
  const value = sim.result?.retval;
  return (value ? scValToNative(value) : undefined) as T;
}

/** A write, signed in the wallet. Resolves with the transaction hash and the returned value. */
async function write<T>(
  source: string,
  method: string,
  args: xdr.ScVal[],
  signTransaction: (xdr: string) => Promise<string>,
): Promise<{ hash: string; value: T }> {
  const { tx, sim } = await simulate(source, method, args);
  const prepared = rpc.assembleTransaction(tx, sim).build();
  const signed = await signTransaction(prepared.toXDR());
  const sent = await server().sendTransaction(TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE));
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new TransactionFailedError(`The network did not accept the transaction (${sent.status})`, false);
  }
  const result = await server().pollTransaction(sent.hash, { attempts: 30 });
  if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    const value = result.returnValue ? scValToNative(result.returnValue) : undefined;
    return { hash: sent.hash, value: value as T };
  }
  if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new TransactionFailedError("The transaction failed on the ledger", true);
  }
  throw new TransactionFailedError(`The transaction was not confirmed (${result.status})`, false);
}

const str = (v: string) => nativeToScVal(v, { type: "string" });
const bytes32 = (hex: string) => xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));

// ---- Reads ----

/** The advance this attested revenue would size to, in stroops. The figure 2b shows (#20). */
export function quote(source: string, revenueUsd: string): Promise<bigint> {
  return read<bigint>(source, "quote", [str(revenueUsd)]);
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

/** Prove, size and disburse in one call (#20). Resolves with the stroops disbursed. */
export function requestAdvance(
  borrower: string,
  req: AdvanceRequest,
  signTransaction: (xdr: string) => Promise<string>,
): Promise<{ hash: string; value: bigint }> {
  return write<bigint>(
    borrower,
    "request_advance",
    [
      new Address(borrower).toScVal(),
      str(req.revenueUsd),
      str(req.pubId),
      str(req.windowStart),
      str(req.windowEnd),
      nativeToScVal(req.timestampS, { type: "u64" }),
      nativeToScVal(req.epoch, { type: "u64" }),
      xdr.ScVal.scvBytes(Buffer.from(req.signature, "hex")),
      nativeToScVal(req.recoveryId, { type: "u32" }),
    ],
    signTransaction,
  );
}

/** Repay part or all of an advance (#21). Resolves with what is still outstanding, in stroops. */
export function repay(
  from: string,
  nullifier: string,
  amount: bigint,
  signTransaction: (xdr: string) => Promise<string>,
): Promise<{ hash: string; value: bigint }> {
  return write<bigint>(
    from,
    "repay",
    [new Address(from).toScVal(), bytes32(nullifier), nativeToScVal(amount, { type: "i128" })],
    signTransaction,
  );
}
