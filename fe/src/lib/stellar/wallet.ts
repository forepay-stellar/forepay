import * as e2e from "./wallet-e2e";

export { WalletError, USER_CLOSED_MODAL } from "./wallet-error";

/**
 * Next inlines NEXT_PUBLIC_* at build time, so in a production build this reads `"" === "1"` and every
 * e2e branch below is dead. `wallet-e2e.ts` still travels in the bundle, but it is a few lines, holds
 * no key material and is unreachable.
 */
const E2E = process.env.NEXT_PUBLIC_E2E === "1";

/**
 * The real wallet layer is imported on first use, not at module load. Stellar Wallets Kit writes its
 * theme variables onto `<html>` as soon as it is evaluated, which would make the server-rendered HTML
 * differ from the client's and break hydration. Loading it lazily also keeps it off the first paint.
 */
const real = () => import("./wallet-real");

type Session = { address: string; name: string; id: string };

export async function hasWallet(): Promise<boolean> {
  return E2E ? e2e.hasWallet() : (await real()).hasWallet();
}

export async function connect(onWalletSelected?: (name: string) => void): Promise<Session> {
  return E2E ? e2e.connect(onWalletSelected) : (await real()).connect(onWalletSelected);
}

export async function getAddress(): Promise<string> {
  return E2E ? e2e.getAddress() : (await real()).getAddress();
}

/** `null` when the wallet cannot report its network (see wallet-real.ts). */
export async function getNetworkPassphrase(): Promise<string | null> {
  return E2E ? e2e.getNetworkPassphrase() : (await real()).getNetworkPassphrase();
}

export async function signTransaction(xdr: string): Promise<string> {
  return E2E ? e2e.signTransaction(xdr) : (await real()).signTransaction(xdr);
}

export async function disconnect(): Promise<void> {
  return E2E ? e2e.disconnect() : (await real()).disconnect();
}
