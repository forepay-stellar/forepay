// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const readUsdcStatus = vi.fn();
vi.mock("./trustline", () => ({ readUsdcStatus }));
const { FriendbotError, fundWithFriendbot } = await import("./friendbot");

const ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";

function friendbot(status: number) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  readUsdcStatus.mockReset();
});

describe("fundWithFriendbot", () => {
  it("waits until the ledger shows the new account", async () => {
    friendbot(200);
    readUsdcStatus.mockResolvedValueOnce("unfunded").mockResolvedValueOnce("missing");
    await fundWithFriendbot(ADDRESS, { intervalMs: 0 });
    expect(readUsdcStatus).toHaveBeenCalledTimes(2);
  });

  it("accepts a refusal when the ledger shows the account exists anyway", async () => {
    // Friendbot answers an already-funded account with a generic 500.
    friendbot(500);
    readUsdcStatus.mockResolvedValue("missing");
    await expect(fundWithFriendbot(ADDRESS, { intervalMs: 0 })).resolves.toBeUndefined();
  });

  it("throws FriendbotError when it refuses and the account is still unfunded", async () => {
    friendbot(500);
    readUsdcStatus.mockResolvedValue("unfunded");
    await expect(fundWithFriendbot(ADDRESS, { intervalMs: 0 })).rejects.toBeInstanceOf(FriendbotError);
  });

  it("throws FriendbotError when Friendbot cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(fundWithFriendbot(ADDRESS, { intervalMs: 0 })).rejects.toBeInstanceOf(FriendbotError);
  });

  it("throws FriendbotError when the account never appears, without waiting after the last try", async () => {
    friendbot(200);
    readUsdcStatus.mockResolvedValue("unfunded");
    const started = Date.now();
    await expect(fundWithFriendbot(ADDRESS, { attempts: 2, intervalMs: 300 })).rejects.toBeInstanceOf(FriendbotError);
    // One wait between the two reads, none after the second.
    expect(Date.now() - started).toBeLessThan(550);
    expect(readUsdcStatus).toHaveBeenCalledTimes(2);
  });

  it("lets a ledger read failure through as itself, not as a faucet failure", async () => {
    friendbot(200);
    const timeout = new Error("timeout");
    readUsdcStatus.mockRejectedValue(timeout);
    await expect(fundWithFriendbot(ADDRESS, { intervalMs: 0 })).rejects.toBe(timeout);
  });
});
