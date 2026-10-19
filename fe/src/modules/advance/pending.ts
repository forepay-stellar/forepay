import type { AdvanceRequest } from "@/lib/stellar/contract";

/**
 * A `request_advance` that is out but not confirmed yet, kept for the length of the browser tab. The
 * tab bar lets the creator leave /advance while "Sending your USDC" shows, and the USDC lands either
 * way, so the screen they come back to waits on the same transaction and shows 2d with its receipt,
 * instead of starting over and having the proof refused as already used (code 20).
 *
 * The request is the relay's attested values: no secret, nothing a wallet would not show.
 */
export type PendingAdvance = {
  address: string;
  hash: string;
  req: AdvanceRequest;
  /**
   * The network turned the send down after the creator left the page: it never reached a ledger, so
   * there is nothing to wait for, and the screen they come back to says so at once.
   */
  refused?: boolean;
};

const KEY = "forepay.advance.pending";
/** Told on the window when a remembered send is turned down, for a screen already waiting on it. */
const REFUSED_EVENT = "forepay:advance-refused";

type Stored = Omit<PendingAdvance, "req"> & {
  req: Omit<AdvanceRequest, "timestampS" | "epoch"> & { timestampS: string; epoch: string };
};

export function savePending(p: PendingAdvance): void {
  const stored: Stored = {
    ...p,
    req: { ...p.req, timestampS: p.req.timestampS.toString(), epoch: p.req.epoch.toString() },
  };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage unavailable: leaving the page while sending loses the receipt, as before.
  }
}

/** The transaction this wallet left waiting, if any. One for another wallet is not this one's. */
export function loadPending(address: string): PendingAdvance | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (s.address !== address) return null;
    return { ...s, req: { ...s.req, timestampS: BigInt(s.req.timestampS), epoch: BigInt(s.req.epoch) } };
  } catch {
    return null;
  }
}

/**
 * The send of `hash` was turned down before any ledger, answered to a screen the creator has left.
 * Remember that instead of the wait, and tell a screen already waiting on it.
 */
export function markRefused(address: string, hash: string): void {
  const p = loadPending(address);
  if (!p || p.hash !== hash) return;
  savePending({ ...p, refused: true });
  window.dispatchEvent(new CustomEvent(REFUSED_EVENT, { detail: hash }));
}

/** Call `then` once if the send of `hash` is turned down meanwhile. Returns the way to stop listening. */
export function onRefused(hash: string, then: () => void): () => void {
  const listener = (e: Event) => {
    if ((e as CustomEvent<string>).detail === hash) then();
  };
  window.addEventListener(REFUSED_EVENT, listener);
  return () => window.removeEventListener(REFUSED_EVENT, listener);
}

export function clearPending(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
