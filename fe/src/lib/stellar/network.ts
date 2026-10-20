import { Networks } from "@stellar/stellar-sdk";

/**
 * Where the app points on Stellar. Testnet only (SOW §4.1).
 *
 * Each var is read as a literal `process.env.NEXT_PUBLIC_*` expression: Next inlines those textually at
 * build time, and a computed lookup (`process.env[name]`) would inline to `undefined`. Addresses must
 * match `docs/deployments.md` exactly; copy them from there, never retype them.
 */
export const NETWORK_PASSPHRASE = Networks.TESTNET;

export const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "";

/** `CODE:ISSUER`, e.g. `USDC:GBBD47…LFLA5`. A trustline is keyed by this pair, not by the SAC address. */
const USDC_ASSET = process.env.NEXT_PUBLIC_USDC_ASSET ?? "";

export const USDC = (() => {
  const [code, issuer] = USDC_ASSET.split(":");
  return { code: code ?? "", issuer: issuer ?? "" };
})();

/** The advance contract (`docs/deployments.md`). */
export const ADVANCE_CONTRACT_ID = process.env.NEXT_PUBLIC_ADVANCE_CONTRACT_ID ?? "";

const EXPLORER = "https://stellar.expert/explorer/testnet";

/** stellar.expert, the "View on Stellar Expert" link in the wallet menu. */
export function explorerAccountUrl(address: string): string {
  return `${EXPLORER}/account/${address}`;
}

/** A transaction on stellar.expert: every "Receipt" and "View receipt" (brief §3, term table). */
export function explorerTxUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

/** The advance contract on stellar.expert ("View contract" on 3a). */
export function explorerContractUrl(): string {
  return `${EXPLORER}/contract/${ADVANCE_CONTRACT_ID}`;
}

/** Testnet's faucet for XLM. A new account needs a little XLM before it can hold any trustline. */
export function friendbotUrl(address: string): string {
  return `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`;
}
