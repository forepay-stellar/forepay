import { Account, Keypair, rpc, xdr } from "@stellar/stellar-sdk";

/**
 * The account a transaction is built on, read with `getLedgerEntries` rather than the SDK's
 * `getAccount`. That helper catches every failure, a timeout or a 503 included, and rethrows it as
 * "Account not found", so a node that did not answer would read as an account that does not exist.
 * Here a transport failure throws as itself, and only an empty answer means the account is not there.
 * Used by every write: the USDC trustline (#19), `request_advance` (#20) and `repay` (#21).
 */
export async function sourceAccount(server: rpc.Server, address: string): Promise<Account> {
  const accountId = Keypair.fromPublicKey(address).xdrPublicKey();
  const key = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId }));
  const { entries } = await server.getLedgerEntries(key);
  const entry = entries[0];
  if (!entry) throw new Error(`Account not found: ${address}`);
  return new Account(address, entry.val.account().seqNum().toString());
}
