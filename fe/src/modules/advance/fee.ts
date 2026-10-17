import { TransactionBuilder } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/network";

/**
 * The most a transaction can cost in network fee, in stroops of XLM: the fee field of the transaction
 * the wallet is asked to sign, after simulation added the resource fee. What 2c shows.
 */
export function maxFee(signableXdr: string): bigint {
  return BigInt(TransactionBuilder.fromXDR(signableXdr, NETWORK_PASSPHRASE).fee);
}
