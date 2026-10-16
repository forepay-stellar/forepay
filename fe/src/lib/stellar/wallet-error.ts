// Kit-free error helpers. Kept out of `wallet.ts` so UI + tests can import them
// without pulling in Stellar Wallets Kit (which drags in the CommonJS
// `@stellar/freighter-api` and fails to load under the vitest/jsdom ESM env).

/** Code Stellar Wallets Kit rejects with when the user dismisses the picker. */
export const USER_CLOSED_MODAL = -1;

/**
 * Stellar Wallets Kit rejects with plain `{ code, message }` objects (e.g.
 * kit.js `reject({ code: -1, message: "The user closed the modal." })`), not
 * Error instances — an unhandled one surfaces to the user as the useless
 * "[object Object]". Normalising at the wallet boundary gives callers a real
 * Error with a readable message and a `code` to special-case cancellation.
 */
export class WalletError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

/**
 * The kit's answer for a call this wallet does not implement, e.g. `getNetwork` on xBull, Rabet and
 * WalletConnect: `{ code: -3, message: 'xBull does not support the "getNetwork" function' }`. Code -3
 * alone is not enough, Freighter also uses it for an address it will not share.
 */
export function isUnsupportedCall(e: WalletError): boolean {
  return e.code === -3 && /does not support/i.test(e.message);
}

export function toWalletError(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  if (e && typeof e === "object" && "message" in e) {
    const { message, code } = e as { message: unknown; code?: unknown };
    return new WalletError(String(message), typeof code === "number" ? code : undefined);
  }
  return new WalletError(typeof e === "string" && e ? e : "Wallet request failed");
}
