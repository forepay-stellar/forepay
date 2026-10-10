/**
 * The read-only API the front end needs (#16).
 *
 *   GET /health   liveness: the process is up. No dependencies, always cheap.
 *   GET /ready    readiness: the Stellar RPC answers. 503 when it does not.
 *   GET /config   the network and contract addresses this API is actually pointed
 *                 at, where each came from, and whether they match the record.
 *
 * The chain-state routes (an advance's status, a repayment position, whether a
 * nullifier is spent) are added once #6 freezes the contract interface: building them
 * against a moving interface is how the API and the contract drift apart.
 *
 * The app is built from injected config and RPC so tests run without a network.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import type { LoadedConfig } from "./config.js";

/** The slice of the Stellar RPC client the API uses. */
export interface RpcLike {
  getHealth(): Promise<{ status: string; latestLedger?: number }>;
}

export interface AppDeps {
  loaded: LoadedConfig;
  rpc: RpcLike;
  /** Readiness check timeout. */
  readyTimeoutMs?: number;
}

export function createApp({ loaded, rpc, readyTimeoutMs = 5000 }: AppDeps) {
  const { config, sources, recorded } = loaded;
  const allowed = new Set(config.corsOrigins);
  const app = new Hono();

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      // Echo only an exact, configured origin. An unknown origin gets no
      // Access-Control-Allow-Origin at all, so the browser refuses the response.
      origin: (origin) => (allowed.has(origin) ? origin : null),
      allowMethods: ["GET", "OPTIONS"],
      maxAge: 600,
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/ready", async (c) => {
    try {
      const health = await Promise.race([
        rpc.getHealth(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), readyTimeoutMs)),
      ]);
      if (health.status !== "healthy") return c.json({ status: "unavailable", rpc: health.status }, 503);
      return c.json({ status: "ok", latestLedger: health.latestLedger ?? null });
    } catch (e) {
      return c.json({ status: "unavailable", rpc: (e as Error).message }, 503);
    }
  });

  app.get("/config", (c) =>
    c.json({
      network: config.network,
      networkPassphrase: config.networkPassphrase,
      rpcUrl: config.rpcUrl,
      contracts: config.contracts,
      sources,
      recorded,
    }),
  );

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}
