import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPending, loadPending, markRefused, onRefused, savePending } from "./pending";

const REQ = {
  revenueUsd: "360.00",
  pubId: "pub-1",
  windowStart: "2026-07-01",
  windowEnd: "2026-09-30",
  timestampS: 1_792_000_000n,
  epoch: 3n,
  signature: "ab".repeat(64),
  recoveryId: 1,
};
const ME = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";

afterEach(() => window.sessionStorage.clear());

describe("the advance left waiting", () => {
  it("comes back as it was sent, bigints included", () => {
    savePending({ address: ME, hash: "h".repeat(64), req: REQ });
    expect(loadPending(ME)).toEqual({ address: ME, hash: "h".repeat(64), req: REQ });
  });

  it("is not another wallet's", () => {
    savePending({ address: ME, hash: "h".repeat(64), req: REQ });
    expect(loadPending("GBOTHER")).toBeNull();
  });

  it("is gone once cleared, and unreadable storage reads as none", () => {
    savePending({ address: ME, hash: "h".repeat(64), req: REQ });
    clearPending();
    expect(loadPending(ME)).toBeNull();
    window.sessionStorage.setItem("forepay.advance.pending", "{not json");
    expect(loadPending(ME)).toBeNull();
  });
});

describe("a send turned down after the creator left", () => {
  const HASH = "h".repeat(64);

  it("is remembered as refused, and a screen waiting on it is told", () => {
    savePending({ address: ME, hash: HASH, req: REQ });
    const told = vi.fn();
    const stop = onRefused(HASH, told);
    markRefused(ME, HASH);
    expect(loadPending(ME)).toEqual({ address: ME, hash: HASH, req: REQ, refused: true });
    expect(told).toHaveBeenCalledTimes(1);
    stop();
    markRefused(ME, HASH);
    expect(told).toHaveBeenCalledTimes(1);
  });

  it("leaves another transaction, or another wallet's, as it was", () => {
    savePending({ address: ME, hash: HASH, req: REQ });
    const told = vi.fn();
    const stop = onRefused(HASH, told);
    markRefused(ME, "o".repeat(64));
    markRefused("GBOTHER", HASH);
    expect(loadPending(ME)?.refused).toBeUndefined();
    expect(told).not.toHaveBeenCalled();
    stop();
  });
});
