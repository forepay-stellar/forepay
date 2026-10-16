/** What a Reclaim session reports while it runs, and how it can end. Shared by the real seam and the mock. */
import type { AdvanceRequest } from "@/lib/stellar/contract";

export type ProveStage =
  /** A Reclaim window is open. The creator logs in to AdSense there, not on our page. */
  | "waiting"
  /** The login worked. The revenue figure is being turned into a proof. */
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

/** The relay is configured, but its client is not written yet (#17). */
export class RelayNotReadyError extends Error {
  constructor() {
    super("NEXT_PUBLIC_RELAY_URL is set, but the #17 relay client is not built yet");
    this.name = "RelayNotReadyError";
  }
}
