/**
 * Run the API (#16):  pnpm -C be start      (PORT defaults to 8787)
 *
 * Configuration comes from the environment, or be/.env when present (chmod 600). See
 * be/.env.example. With NODE_ENV=production the server refuses to start without
 * CORS_ORIGINS: a deployed API that allows no origin fails every request from the
 * front end, and the time to find that out is at startup, not at the demo.
 */
import { serve } from "@hono/node-server";
import { rpc } from "@stellar/stellar-sdk";

import { die, loadEnv } from "../cli/env.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

loadEnv(false);

let loaded;
try {
  loaded = loadConfig();
} catch (e) {
  die((e as Error).message);
}

if (process.env.NODE_ENV === "production" && loaded.config.corsOrigins.length === 0) {
  die("CORS_ORIGINS is empty. Set it to the deployed front end's origin, e.g. https://forepay.example");
}
if (!loaded.recorded) {
  console.warn(
    "⚠ contract addresses differ from docs/deployments.md:",
    JSON.stringify({ contracts: loaded.config.contracts, sources: loaded.sources }),
  );
}

const app = createApp({ loaded, rpc: new rpc.Server(loaded.config.rpcUrl) });
serve({ fetch: app.fetch, port: loaded.config.port }, (info) => {
  console.log(`Forepay API on :${info.port} (${loaded.config.network}, CORS: ${loaded.config.corsOrigins.join(", ") || "none"})`);
});
