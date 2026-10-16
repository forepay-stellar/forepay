import { WalletError } from "./wallet-error";

/**
 * The wallet layer Playwright drives (ported from Sorosense). A browser extension cannot be automated
 * without loading it and a seed phrase into the test browser, so `wallet.ts` swaps this module in when
 * NEXT_PUBLIC_E2E === "1" and the app signs without a popup.
 *
 * `signTransaction` hands the transaction back unsigned. Playwright answers the RPC calls itself, so
 * nothing ever reaches a real network, and the module holds no key material. Outside an e2e run the
 * dispatcher never selects it.
 */

/** A well-formed Stellar public key. Deterministic, so specs can assert on the wallet chip. */
export const E2E_ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
const DEFAULT_WALLET_NAME = "Freighter";
export const E2E_WALLET_ID = "e2e";

// Real Freighter keeps its connection in the extension, alive across reloads. The stub mirrors that in
// localStorage; a module-scope flag would reset on every hard load.
const CONNECTED_KEY = "forepay.e2e.connected";

/**
 * A spec can make the wallet misbehave the way a real one does, by setting this key:
 * `wrong-network`, `no-network-api` (cannot report its network, like xBull and Rabet), `declined`,
 * `locked`, `no-wallet`, `broken` (an error nothing recognises), `decline-sign` (connects, then
 * turns down every signature) or `locked-sign` (connects, then is locked when asked to sign).
 */
const SCENARIO_KEY = "forepay.e2e.scenario";
/** And pretend to be another wallet, e.g. `xBull`. */
const WALLET_NAME_KEY = "forepay.e2e.wallet";

function scenario(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(SCENARIO_KEY);
}

function walletName(): string {
  return (typeof window !== "undefined" && window.localStorage.getItem(WALLET_NAME_KEY)) || DEFAULT_WALLET_NAME;
}

function isConnected(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(CONNECTED_KEY) === "1";
}

function requireConnected(): void {
  if (!isConnected()) throw new Error("no e2e wallet connected");
}

export async function hasWallet(): Promise<boolean> {
  return scenario() !== "no-wallet";
}

export async function connect(
  onWalletSelected?: (name: string) => void,
): Promise<{ address: string; name: string; id: string }> {
  const name = walletName();
  onWalletSelected?.(name);
  // The same shapes Freighter rejects with, through the kit (see lib/errors.ts).
  if (scenario() === "declined") throw new WalletError("The user rejected this request.", -4);
  if (scenario() === "locked") {
    throw new WalletError(`Getting the address from ${name} is not allowed, please request access first.`, -3);
  }
  if (scenario() === "broken") throw new WalletError("Unhandled error from the wallet");
  window.localStorage.setItem(CONNECTED_KEY, "1");
  return { address: E2E_ADDRESS, name, id: E2E_WALLET_ID };
}

export async function getAddress(): Promise<string> {
  requireConnected();
  // What Freighter answers for a silent address request while it is locked. Only Freighter is asked
  // silently; for xBull and Rabet the real layer trusts the address it remembered.
  if (scenario() === "locked" && walletName() === DEFAULT_WALLET_NAME) {
    throw new WalletError(`Getting the address from ${walletName()} is not allowed, please request access first.`, -3);
  }
  return E2E_ADDRESS;
}

export async function getNetworkPassphrase(): Promise<string | null> {
  if (scenario() === "wrong-network") return "Public Global Stellar Network ; September 2015";
  if (scenario() === "no-network-api") return null;
  return "Test SDF Network ; September 2015";
}

export async function signTransaction(xdr: string): Promise<string> {
  requireConnected();
  if (scenario() === "decline-sign") throw new WalletError("The user rejected this request.", -4);
  if (scenario() === "locked-sign") throw new WalletError(`${walletName()} is locked`);
  return xdr;
}

export async function disconnect(): Promise<void> {
  window.localStorage.removeItem(CONNECTED_KEY);
}
