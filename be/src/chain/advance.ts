/**
 * Read an advance's current state from the contract (#16): `advance(nullifier)`.
 *
 * The figures the front end shows (principal, repaid, window) come from here, the
 * contract's own record, not from summing Horizon's history: a repayment the history
 * missed or double-counted would otherwise show a balance the contract does not hold.
 *
 * A read is a simulation. Nothing is signed and nothing is charged; the source account
 * only has to be well-formed.
 */
import { Account, Contract, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";

/** The contract's `Advance` record, as the API serves it. Amounts in stroops. */
export interface AdvanceRecord {
  borrower: string;
  pubId: string;
  windowStart: string;
  windowEnd: string;
  revenueCents: bigint;
  principal: bigint;
  repaid: bigint;
  openedAt: bigint;
}

/** The slice of the RPC client a read needs. */
export interface SimulateLike {
  simulateTransaction: rpc.Server["simulateTransaction"];
}

// Any valid account works as a simulation source; it never signs and needs no balance.
const READ_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));

export async function readAdvance(
  server: SimulateLike,
  networkPassphrase: string,
  contract: string,
  nullifierHex: string,
): Promise<AdvanceRecord | null> {
  if (!/^[0-9a-f]{64}$/.test(nullifierHex)) throw new Error(`not a 32-byte hex nullifier: ${nullifierHex}`);
  const tx = new TransactionBuilder(new Account(READ_SOURCE, "0"), { fee: "100", networkPassphrase })
    .addOperation(new Contract(contract).call("advance", nativeToScVal(Buffer.from(nullifierHex, "hex"), { type: "bytes" })))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`advance(${nullifierHex.slice(0, 8)}…) failed: ${sim.error.split("\n")[0]}`);
  const retval = sim.result?.retval;
  if (!retval) throw new Error("advance() returned nothing");
  const a = scValToNative(retval) as null | {
    borrower: string;
    pub_id: string;
    window_start: string;
    window_end: string;
    revenue_cents: bigint;
    principal: bigint;
    repaid: bigint;
    opened_at: bigint;
  };
  if (a === null || a === undefined) return null;
  return {
    borrower: a.borrower,
    pubId: a.pub_id,
    windowStart: a.window_start,
    windowEnd: a.window_end,
    revenueCents: BigInt(a.revenue_cents),
    principal: BigInt(a.principal),
    repaid: BigInt(a.repaid),
    openedAt: BigInt(a.opened_at),
  };
}
