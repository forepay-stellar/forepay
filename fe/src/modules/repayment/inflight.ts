import { useSyncExternalStore } from "react";

/**
 * The repayment that is out and not yet shown by the API (#21), kept outside the screen that sent it.
 *
 * A read of the API that fails swaps the whole ledger for "We could not read…", and the tab bar lets the
 * creator leave: either would lose a repayment the screen held in its own state, unlock the form while
 * it is still being confirmed, and invite paying twice (review B1). So the repayment lives here, and in
 * sessionStorage for a reload, from just before it is sent until the API reports its transaction
 * (review B2). One that Stellar has not confirmed yet stays too, and is still watched (review B3).
 *
 * `landed` is set once the ledger confirms it; from then on only the API has to catch up.
 */
export type Inflight = { address: string; nullifier: string; hash: string; amount: bigint; landed: boolean };

const KEY = "forepay.repayment.inflight";

type Stored = Omit<Inflight, "amount"> & { amount: string };

let current: Inflight | null | undefined;
const listeners = new Set<() => void>();

function read(): Inflight | null {
  if (current !== undefined) return current;
  current = null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Stored;
      current = { ...s, amount: BigInt(s.amount) };
    }
  } catch {
    // Storage unavailable or unreadable: nothing in flight that we know of.
  }
  return current;
}

export function getInflight(): Inflight | null {
  return typeof window === "undefined" ? null : read();
}

export function setInflight(next: Inflight | null): void {
  current = next;
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify({ ...next, amount: next.amount.toString() }));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: kept for this page only.
  }
  for (const l of listeners) l();
}

/** Mark the repayment with this hash as confirmed on the ledger, once. True if this call did it. */
export function markLanded(hash: string): boolean {
  const now = getInflight();
  if (!now || now.hash !== hash || now.landed) return false;
  setInflight({ ...now, landed: true });
  return true;
}

/** Forget the repayment with this hash, if it is still the one in flight. */
export function clearInflight(hash: string): void {
  if (getInflight()?.hash === hash) setInflight(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The repayment in flight for this wallet, kept up to date. */
export function useInflight(address: string): Inflight | null {
  const now = useSyncExternalStore(subscribe, getInflight, () => null);
  return now?.address === address ? now : null;
}
