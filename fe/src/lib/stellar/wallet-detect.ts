/**
 * Is any browser wallet installed? Kit-free, so it can be tested without Stellar Wallets Kit.
 *
 * The kit reports xBull as always available, because xBull falls back to its web app, so its own
 * `isAvailable` cannot tell "installed" from "not installed". Only an injected `window.xBullSDK` means
 * the extension is there. Freighter and Rabet answer truthfully.
 */
export const FREIGHTER = "freighter";
export const RABET = "rabet";
export const XBULL = "xbull";

export function anyBrowserWallet(
  wallets: { id: string; isAvailable: boolean }[],
  xBullExtensionInjected: boolean,
): boolean {
  const available = (id: string) => wallets.some((w) => w.id === id && w.isAvailable);
  return available(FREIGHTER) || available(RABET) || xBullExtensionInjected;
}
