import { afterEach, describe, expect, it, vi } from "vitest";

describe("proveRevenue", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the mock while no relay is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_RELAY_URL", "");
    const { proveRevenue } = await import("./index");
    const stages: string[] = [];
    const session = proveRevenue("GA6H", "adsense", (s) => stages.push(s));
    expect(stages).toEqual(["waiting"]);
    session.abandon();
  });

  it("says the relay is not ready rather than pretending, when the Google client id is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_RELAY_URL", "https://relay.example");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    const { proveRevenue, RelayNotReadyError } = await import("./index");
    await expect(proveRevenue("GA6H", "adsense", () => {}).result).rejects.toBeInstanceOf(RelayNotReadyError);
  });
});
