import type { AdvanceRequest } from "@/lib/stellar/contract";
import { ReclaimCancelledError, type ProveSession, type ProveStage } from "./session";

/**
 * A stand-in for the Reclaim session and the #17 relay, used while NEXT_PUBLIC_RELAY_URL is unset.
 *
 * It walks through the stages the real session has (window open and waiting, then reading), with the
 * delays a real one takes, and returns fixed values in the shape `request_advance` takes. The signature
 * is not a real attestor signature, so on testnet the contract refuses the proof. Only the e2e RPC stub
 * accepts it.
 *
 * Two localStorage keys steer it, for trying each state by hand and in e2e:
 * - `forepay.mock.revenue`: the attested figure, `360.00` by default (`1240.00` caps, `3.20` is too small).
 * - `forepay.mock.reclaim`: `cancel` closes the window instead of finishing.
 */
const E2E = process.env.NEXT_PUBLIC_E2E === "1";
const WAITING_MS = E2E ? 800 : 3000;
const READING_MS = E2E ? 800 : 2500;

function setting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const MOCK_PUB_ID = "pub-4021783466891204";

export function mockProveRevenue(_borrower: string, onStage: (stage: ProveStage) => void): ProveSession {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abandoned = false;
  let settle: { resolve: (r: AdvanceRequest) => void; reject: (e: unknown) => void } | undefined;
  const result = new Promise<AdvanceRequest>((resolve, reject) => {
    settle = { resolve, reject };
  });

  function waitForLogin() {
    clearTimeout(timer);
    onStage("waiting");
    timer = setTimeout(() => {
      if (abandoned) return;
      if (setting("forepay.mock.reclaim") === "cancel") return settle?.reject(new ReclaimCancelledError());
      onStage("reading");
      timer = setTimeout(() => {
        if (abandoned) return;
        settle?.resolve({
          revenueUsd: setting("forepay.mock.revenue") ?? "360.00",
          pubId: MOCK_PUB_ID,
          windowStart: "2026-07-01",
          windowEnd: "2026-09-30",
          timestampS: BigInt(Math.floor(Date.now() / 1000)),
          epoch: 1n,
          signature: "5a".repeat(64),
          recoveryId: 0,
        });
      }, READING_MS);
    }, WAITING_MS);
  }

  waitForLogin();
  return {
    result,
    reopen: waitForLogin,
    abandon: () => {
      abandoned = true;
      clearTimeout(timer);
    },
  };
}
