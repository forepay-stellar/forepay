import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReclaimCancelledError, type ProveStage } from "./session";
import { mockProveRevenue } from "./mock";

describe("mockProveRevenue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("waits for the login, reads, then returns the arguments request_advance takes", async () => {
    const stages: ProveStage[] = [];
    const session = mockProveRevenue("GA6H", "adsense", (s) => stages.push(s));
    expect(stages).toEqual(["waiting"]);
    await vi.runAllTimersAsync();
    const req = await session.result;
    expect(stages).toEqual(["waiting", "reading"]);
    expect(req.revenueUsd).toBe("360.00");
    expect(req.windowStart).toBe("2026-07-01");
    expect(req.signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it("returns the figure set for trying the other offer variants", async () => {
    window.localStorage.setItem("forepay.mock.revenue", "1240.00");
    const session = mockProveRevenue("GA6H", "adsense", () => {});
    await vi.runAllTimersAsync();
    expect((await session.result).revenueUsd).toBe("1240.00");
  });

  it("can close the window instead of finishing", async () => {
    window.localStorage.setItem("forepay.mock.reclaim", "cancel");
    const session = mockProveRevenue("GA6H", "adsense", () => {});
    const settled = session.result.catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await settled).toBeInstanceOf(ReclaimCancelledError);
  });

  it("goes back to waiting when the window is opened again", async () => {
    const stages: ProveStage[] = [];
    const session = mockProveRevenue("GA6H", "adsense", (s) => stages.push(s));
    session.reopen();
    expect(stages).toEqual(["waiting", "waiting"]);
    session.abandon();
  });

  it("answers AdMob the relay's way, micros beside the exact decimal", async () => {
    window.localStorage.setItem("forepay.mock.revenue", "3.20");
    const session = mockProveRevenue("GA6H", "admob", () => {});
    await vi.runAllTimersAsync();
    expect(await session.result).toMatchObject({ source: "admob", revenueMicros: "3200000", revenueUsd: "3.20" });
  });
});
