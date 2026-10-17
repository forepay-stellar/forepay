import type { AdvanceRequest } from "@/lib/stellar/contract";

/**
 * A `request_advance` that is out but not confirmed yet, kept for the length of the browser tab. The
 * tab bar lets the creator leave /advance while "Sending your USDC" shows, and the USDC lands either
 * way, so the screen they come back to waits on the same transaction and shows 2d with its receipt,
 * instead of starting over and having the proof refused as already used (code 20).
 *
 * The request is the relay's attested values: no secret, nothing a wallet would not show.
 */
export type PendingAdvance = { address: string; hash: string; req: AdvanceRequest };

const KEY = "forepay.advance.pending";

type Stored = { address: string; hash: string; req: Omit<AdvanceRequest, "timestampS" | "epoch"> & { timestampS: string; epoch: string } };

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

export function clearPending(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
