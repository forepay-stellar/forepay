/** What a Reclaim session reports while it runs, and how it can end. Shared by the real seam and the mock. */
import type { AdvanceRequest } from "@/lib/stellar/contract";

export type ProveStage =
  /** Google's sign-in window is open. The creator signs in to AdSense there, not on our page. */
  | "waiting"
  /** The sign-in worked. The relay is turning the revenue figure into a proof (#17). */
  | "reading";

export type ProveSession = {
  /** The attested values, once the proof exists. Rejects with `ReclaimCancelledError` if the window was closed. */
  result: Promise<AdvanceRequest>;
  /** "Open the window again", for a creator who lost the Reclaim window behind another one. */
  reopen: () => void;
  /** Stop listening, for a creator who leaves the screen. The result never settles after this. */
  abandon: () => void;
};

/** The creator closed the Reclaim window before the proof was made. Nothing was read or saved. */
export class ReclaimCancelledError extends Error {
  constructor() {
    super("The Reclaim session was closed before a proof was made");
    this.name = "ReclaimCancelledError";
  }
}

/** The relay is configured without the Google OAuth client id the sign-in needs (#17). */
export class RelayNotReadyError extends Error {
  constructor() {
    super("NEXT_PUBLIC_RELAY_URL is set, but NEXT_PUBLIC_GOOGLE_CLIENT_ID is not");
    this.name = "RelayNotReadyError";
  }
}

/**
 * Why the relay could not make the proof, by whose move it is (docs/api.md):
 * - `token`: Google refused the sign-in, for example an expired one. Signing in again fixes it.
 * - `account`: no approved AdSense account behind that Google account.
 * - `busy`: the relay is proving for someone else, or already for this wallet.
 * - `provider`, `prove`, `audit`, `internal`: the relay's side. Trying again may work.
 */
export type RelayErrorCode = "token" | "account" | "busy" | "provider" | "prove" | "audit" | "internal";

export class RelayError extends Error {
  constructor(
    readonly code: RelayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RelayError";
  }
}
