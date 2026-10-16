/**
 * Proving AdSense revenue with Reclaim, and getting back the attested values `request_advance` takes
 * (ARCHITECTURE.md §2, `lib/reclaim/`). The seam between the app and the #17 relay.
 *
 * The Reclaim session and the relay do not exist yet (#17), and which Reclaim SDK runs in the browser
 * depends on how the relay is built (ARCHITECTURE.md §3), so none is installed. Until
 * NEXT_PUBLIC_RELAY_URL is set, a mock walks through the same stages with realistic delays and
 * returns fixed values. Everything after this seam (quote, request_advance, signing, errors) is real.
 */
import { mockProveRevenue } from "./mock";
import { RelayNotReadyError, type ProveSession, type ProveStage } from "./session";

export { ReclaimCancelledError, RelayNotReadyError, type ProveSession, type ProveStage } from "./session";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "";

/** True while proofs come from the mock, so the UI and the docs can say so. */
export const PROOFS_ARE_MOCKED = !RELAY_URL;

export function proveRevenue(borrower: string, onStage: (stage: ProveStage) => void): ProveSession {
  if (PROOFS_ARE_MOCKED) return mockProveRevenue(borrower, onStage);
  return { result: Promise.reject(new RelayNotReadyError()), reopen: () => {}, abandon: () => {} };
}
