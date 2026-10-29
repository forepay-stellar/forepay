/**
 * Run the API (#16):  pnpm -C be start      (PORT defaults to 8787)
 *
 * Configuration comes from the environment, or be/.env when present (chmod 600). See
 * be/.env.example. With NODE_ENV=production the server refuses to start without
 * CORS_ORIGINS: a deployed API that allows no origin fails every request from the
 * front end, and the time to find that out is at startup, not at the demo.
 *
 * The proof relay (#17) is on when RECLAIM_APP_ID and RECLAIM_APP_SECRET are set and
 * the circuit files are present (`pnpm -C be zk:files`). Without them the read routes
 * still serve and POST /proofs answers 503, which /config reports as `relay: false`.
 */
import { serve } from "@hono/node-server";
import { ReclaimClient } from "@reclaimprotocol/zk-fetch";
import { rpc } from "@stellar/stellar-sdk";

import { googleGet } from "../adsense/account.js";
import { die, keepSecret, loadEnv, optional, scrub } from "../cli/env.js";
import { readAdvance } from "../chain/advance.js";
import { fetchOperations } from "../chain/history.js";
import { ZK_ENGINE, hasZkFiles } from "../reclaim/zk-files.js";
import { ProofJobs } from "../relay/jobs.js";
import { proveRevenue, toAdvanceRequest } from "../relay/prove.js";
import { createApp, type Prover } from "./app.js";
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

function relay(): Prover | undefined {
  const appId = optional("RECLAIM_APP_ID");
  const appSecret = keepSecret(optional("RECLAIM_APP_SECRET"));
  if (!appId || !appSecret) {
    console.warn("⚠ proof relay off: RECLAIM_APP_ID / RECLAIM_APP_SECRET are not set");
    return undefined;
  }
  if (!hasZkFiles()) {
    console.warn("⚠ proof relay off: the ZK circuit files are missing. Run: pnpm -C be zk:files");
    return undefined;
  }
  const client = new ReclaimClient(appId, appSecret, false, 2);
  const deps = {
    owner: appId,
    google: googleGet,
    zkFetch: ((url, options, secretOptions) => client.zkFetch(url, { ...options, zkEngine: ZK_ENGINE }, secretOptions)) as Parameters<
      typeof proveRevenue
    >[0]["zkFetch"],
  };
  return async (input, onStep) => toAdvanceRequest(await proveRevenue(deps, input, onStep));
}

const server = new rpc.Server(loaded.config.rpcUrl);
const { horizonUrl, networkPassphrase } = loaded.config;
const app = createApp({
  loaded,
  rpc: server,
  chain: {
    operations: (account) => fetchOperations(account, { horizonUrl }),
    readAdvance: (contract, nullifier) => readAdvance(server, networkPassphrase, contract, nullifier),
  },
  prover: relay(),
  jobs: new ProofJobs({ scrub }),
});
serve({ fetch: app.fetch, port: loaded.config.port }, (info) => {
  console.log(`Forepay API on :${info.port} (${loaded.config.network}, CORS: ${loaded.config.corsOrigins.join(", ") || "none"})`);
});
