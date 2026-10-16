import { Asset, Keypair, rpc, xdr } from "@stellar/stellar-sdk";
import { RPC_URL, USDC } from "./network";

/**
 * How much USDC the wallet holds, in stroops (#21, "amount above wallet balance").
 *
 * Read with `getLedgerEntries`, the way `trustline.ts` reads the trustline, and never with the SDK's
 * balance helpers: those turn a timeout into "not found", which here would read a slow node as "this
 * wallet holds nothing" and block a creator who can pay. A transport failure throws to the caller.
 *
 * `null` means the wallet holds no USDC trustline at all. A classic trustline balance is an Int64 with
 * the asset's 7 decimals, so it is already in stroops.
 */
export async function readUsdcBalance(address: string): Promise<bigint | null> {
  if (!RPC_URL) throw new Error("NEXT_PUBLIC_STELLAR_RPC_URL is not set");
  if (!USDC.code || !USDC.issuer) throw new Error("NEXT_PUBLIC_USDC_ASSET is not set as CODE:ISSUER");
  const accountId = Keypair.fromPublicKey(address).xdrAccountId();
  const key = xdr.LedgerKey.trustline(
    new xdr.LedgerKeyTrustLine({ accountId, asset: new Asset(USDC.code, USDC.issuer).toTrustLineXDRObject() }),
  );
  const { entries } = await new rpc.Server(RPC_URL).getLedgerEntries(key);
  const entry = entries.find((e) => e.key.switch() === xdr.LedgerEntryType.trustline());
  if (!entry) return null;
  return BigInt(entry.val.trustLine().balance().toString());
}
