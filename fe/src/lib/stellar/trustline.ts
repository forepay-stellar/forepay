import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, RPC_URL, USDC } from "./network";
import { SubmitError, submitSigned } from "./submit";

/**
 * Can this wallet receive USDC? (#19)
 *
 * A disbursement to a `G…` account with no USDC trustline fails at the contract (`41 NoTrustline`,
 * #12), so this is checked right after connecting, before the creator proves anything.
 *
 * Read with `getLedgerEntries`, not the SDK's `getAccountEntry` / `getTrustline` helpers. Those catch
 * **every** failure, a timeout included, and rethrow it as "not found", which would read a slow node as
 * "this wallet holds nothing" (the Sterun bug #19 warns about). `getLedgerEntries` answers a missing
 * entry with an empty list and lets a transport failure throw, so the two never mix.
 */
export type UsdcStatus =
  /** The account has never been funded with XLM, so it does not exist on chain yet. */
  | "unfunded"
  /** The account exists and holds no USDC trustline. */
  | "missing"
  /** The trustline exists. The advance can reach this wallet. */
  | "ready";

let rpcServer: rpc.Server | null = null;

/** One client for this module, built on first use (review M10). */
function server() {
  if (!RPC_URL) throw new Error("NEXT_PUBLIC_STELLAR_RPC_URL is not set");
  return (rpcServer ??= new rpc.Server(RPC_URL));
}

function usdcAsset() {
  if (!USDC.code || !USDC.issuer) throw new Error("NEXT_PUBLIC_USDC_ASSET is not set as CODE:ISSUER");
  return new Asset(USDC.code, USDC.issuer);
}

export async function readUsdcStatus(address: string): Promise<UsdcStatus> {
  const accountId = Keypair.fromPublicKey(address).xdrAccountId();
  const accountKey = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId }));
  const trustlineKey = xdr.LedgerKey.trustline(
    new xdr.LedgerKeyTrustLine({ accountId, asset: usdcAsset().toTrustLineXDRObject() }),
  );

  // One request for both keys. Anything that is not a clean answer throws to the caller.
  const { entries } = await server().getLedgerEntries(accountKey, trustlineKey);
  const has = (type: xdr.LedgerEntryType) => entries.some((e) => e.key.switch() === type);

  if (!has(xdr.LedgerEntryType.account())) return "unfunded";
  if (!has(xdr.LedgerEntryType.trustline())) return "missing";
  return "ready";
}

/**
 * A `changeTrust` that did not go through.
 * - `refused`: the network never took it, so nothing was charged.
 * - `failed`: the ledger took it and it failed there, so the fee was spent.
 * - `unconfirmed`: sent, but not confirmed while we waited. It may still land.
 */
export class TrustlineError extends Error {
  outcome: "refused" | "failed" | "unconfirmed";
  constructor(message: string, outcome: TrustlineError["outcome"]) {
    super(message);
    this.name = "TrustlineError";
    this.outcome = outcome;
  }
}

/**
 * Build, sign in the wallet and submit a `changeTrust` for USDC. Resolves with the transaction hash
 * once the ledger has confirmed it. Throws the wallet's own error if the creator declines, and a
 * `TrustlineError` if the network refuses it or it fails on the ledger.
 */
export async function addUsdcTrustline(
  address: string,
  signTransaction: (xdr: string) => Promise<string>,
): Promise<string> {
  const rpcServer = server();
  const account = await rpcServer.getAccount(address);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: usdcAsset() }))
    .setTimeout(180)
    .build();

  const signedXdr = await signTransaction(tx.toXDR());
  try {
    const { hash } = await submitSigned(rpcServer, signedXdr, { attempts: 30 });
    return hash;
  } catch (e) {
    if (e instanceof SubmitError) throw new TrustlineError(e.message, e.outcome);
    throw e;
  }
}
