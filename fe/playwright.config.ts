import { defineConfig, devices } from "@playwright/test";

// End to end runs with the test wallet (NEXT_PUBLIC_E2E=1) and with every Stellar RPC call and #16 API
// call answered by the spec itself (tests/e2e/rpc.ts, tests/e2e/api.ts), so a run never touches testnet
// or a real API and never needs a browser extension.
// PW_PORT (and the port after it, for the relay build) lets two worktrees run their e2e suites side by side.
const PORT = Number(process.env.PW_PORT ?? 3219);
const RELAY_PORT = PORT + 1;
const RELAY_SPEC = /relay\.spec\.ts$/;

/** One dev server. `proving` sets the Reclaim seam: the mock (no relay) or the relay. */
function server(port: number, distDir: string, proving: Record<string, string>) {
  return {
    command: `npx next dev --port ${port}`,
    port,
    // Never reuse whatever already listens on the port: it may be another app entirely.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: distDir,
      NEXT_PUBLIC_E2E: "1",
      // The Reclaim mock or the stubbed relay, whatever .env.local says.
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "",
      ...proving,
      NEXT_PUBLIC_STELLAR_RPC_URL: "https://rpc.e2e.invalid",
      NEXT_PUBLIC_API_URL: "https://api.e2e.invalid",
      // Advance contract (dev), from docs/deployments.md. The stub answers for it; nothing is sent.
      NEXT_PUBLIC_ADVANCE_CONTRACT_ID: "CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID",
      NEXT_PUBLIC_USDC_ASSET: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  };
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Playwright's own Chromium (`npx playwright install chromium`, once). Google Chrome can hold a run
  // open after it ends while an update is pending; PW_CHANNEL=chrome still uses it when wanted.
  use: { baseURL: `http://localhost:${PORT}`, channel: process.env.PW_CHANNEL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testIgnore: RELAY_SPEC, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } } },
    { name: "mobile", testIgnore: RELAY_SPEC, use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    // The real proving seam (#17), on a second build whose relay and Google client are set. The relay
    // and Google's sign-in are answered by the spec (tests/e2e/relay.spec.ts).
    {
      name: "relay-desktop",
      testMatch: RELAY_SPEC,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 }, baseURL: `http://localhost:${RELAY_PORT}` },
    },
    {
      name: "relay-mobile",
      testMatch: RELAY_SPEC,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: `http://localhost:${RELAY_PORT}` },
    },
  ],
  webServer: [
    server(PORT, ".next-e2e", { NEXT_PUBLIC_RELAY_URL: "" }),
    server(RELAY_PORT, ".next-e2e-relay", {
      NEXT_PUBLIC_RELAY_URL: "https://relay.e2e.invalid",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "e2e.apps.googleusercontent.com",
    }),
  ],
});
