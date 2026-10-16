import { defineConfig, devices } from "@playwright/test";

// End to end runs with the test wallet (NEXT_PUBLIC_E2E=1) and with every Stellar RPC call answered by
// the spec itself, so a run never touches testnet and never needs a browser extension.
// PW_PORT lets two worktrees run their e2e suites side by side.
const PORT = Number(process.env.PW_PORT ?? 3219);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Playwright's own Chromium (`npx playwright install chromium`, once). Google Chrome can hold a run
  // open after it ends while an update is pending; PW_CHANNEL=chrome still uses it when wanted.
  use: { baseURL: `http://localhost:${PORT}`, channel: process.env.PW_CHANNEL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    port: PORT,
    // Never reuse whatever already listens on the port: it may be another app entirely.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_E2E: "1",
      // The Reclaim mock, whatever .env.local says.
      NEXT_PUBLIC_RELAY_URL: "",
      NEXT_PUBLIC_STELLAR_RPC_URL: "https://rpc.e2e.invalid",
      NEXT_PUBLIC_USDC_ASSET: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  },
});
