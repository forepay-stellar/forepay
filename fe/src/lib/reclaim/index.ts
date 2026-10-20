/**
 * Proving AdSense revenue, and getting back the attested values `request_advance` takes
 * (ARCHITECTURE.md §2, `lib/reclaim/`). The seam between the app and the #17 relay.
 *
 * With NEXT_PUBLIC_RELAY_URL and NEXT_PUBLIC_GOOGLE_CLIENT_ID set, the creator signs in with Google's
 * own popup and the relay makes the proof (`relay.ts`). No Reclaim SDK runs in the browser. While
 * NEXT_PUBLIC_RELAY_URL is empty, a mock walks through the same stages with realistic delays and
 * returns fixed values. Everything after this seam (quote, request_advance, signing, errors) is real.
 */
import { mockProveRevenue } from "./mock";
import { googleSignIn, preloadGoogleSignIn, relayProveRevenue, sessionJobs } from "./relay";
import { RelayNotReadyError, type ProveSession, type ProveStage } from "./session";

export {
  ReclaimCancelledError,
  RelayError,
  RelayNotReadyError,
  type ProveSession,
  type ProveStage,
  type RelayErrorCode,
} from "./session";

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function proveRevenue(borrower: string, onStage: (stage: ProveStage) => void): ProveSession {
  if (!RELAY_URL) return mockProveRevenue(borrower, onStage);
  if (!GOOGLE_CLIENT_ID) return { result: Promise.reject(new RelayNotReadyError()), reopen: () => {}, abandon: () => {} };
  return relayProveRevenue(borrower, onStage, { relayUrl: RELAY_URL, signIn: googleSignIn(GOOGLE_CLIENT_ID) });
}

/** A proof the relay is still making for this wallet, started from this tab before the creator left. */
export function proofRunning(borrower: string): boolean {
  return !!RELAY_URL && !!GOOGLE_CLIENT_ID && sessionJobs.load(borrower) !== null;
}

/** Load Google's sign-in ahead of "Prove my revenue", so the popup opens inside the press. */
export function preloadSignIn(): void {
  if (RELAY_URL && GOOGLE_CLIENT_ID) preloadGoogleSignIn();
}
