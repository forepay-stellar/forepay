import { afterEach, describe, expect, it } from "vitest";
import { clearPending, loadPending, savePending } from "./pending";

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
