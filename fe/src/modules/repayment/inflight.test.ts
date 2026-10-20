import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ME = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
const entry = { address: ME, nullifier: "n".repeat(64), hash: "h".repeat(64), amount: 300_000_000n, landed: false };

// The store keeps its value in module state; each test starts from a fresh copy.
const load = () => import("./inflight");
beforeEach(() => vi.resetModules());
afterEach(() => window.sessionStorage.clear());

describe("the repayment in flight", () => {
  it("survives a reload, bigint included", async () => {
    (await load()).setInflight(entry);
    vi.resetModules();
    expect((await load()).getInflight()).toEqual(entry);
  });

  it("is marked landed once, and only for its own hash", async () => {
    const { setInflight, markLanded, getInflight } = await load();
    setInflight(entry);
    expect(markLanded("x".repeat(64))).toBe(false);
    expect(markLanded(entry.hash)).toBe(true);
    expect(markLanded(entry.hash)).toBe(false);
    expect(getInflight()?.landed).toBe(true);
  });

  it("is cleared only by its own hash", async () => {
    const { setInflight, clearInflight, getInflight } = await load();
    setInflight(entry);
    clearInflight("x".repeat(64));
    expect(getInflight()).not.toBeNull();
    clearInflight(entry.hash);
    expect(getInflight()).toBeNull();
    expect(window.sessionStorage.getItem("forepay.repayment.inflight")).toBeNull();
  });
});
