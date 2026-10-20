/**
 * The read-only API the front end needs (#16).
 *
 *   GET /health   liveness: the process is up. No dependencies, always cheap.
 *   GET /ready    readiness: the Stellar RPC answers. 503 when it does not.
 *   GET /config   the network and contract addresses this API is actually pointed
 *                 at, where each came from, and whether they match the record.
 *   GET /advances?borrower=G…      every advance the wallet took, newest first, with
 *                 the contract's current record of each (principal, repaid, window).
 *   GET /transactions?borrower=G…  advances, repayments and the USDC trustline,
 *                 newest first, failed ones included.
 *
 * Amounts are stroops and times are seconds, both as decimal strings: JSON numbers
 * lose precision past 2^53 and an i128 can exceed that.
 *
 * The app is built from injected config and chain access so tests run without a network.
 */
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { StrKey } from "@stellar/stellar-sdk";

import type { AdvanceRecord } from "../chain/advance.js";
import { advanceCalls, ledgerTransactions, type HorizonOperation } from "../chain/history.js";
import type { LoadedConfig } from "./config.js";

/** The slice of the Stellar RPC client the API uses. */
export interface RpcLike {
  getHealth(): Promise<{ status: string; latestLedger?: number }>;
}

/** Chain reads the history routes need: Horizon's operations, the contract's records. */
export interface ChainLike {
  operations(account: string): Promise<HorizonOperation[]>;
  readAdvance(contract: string, nullifierHex: string): Promise<AdvanceRecord | null>;
}

export interface AppDeps {
  loaded: LoadedConfig;
  rpc: RpcLike;
  chain: ChainLike;
  /** Readiness check timeout. */
  readyTimeoutMs?: number;
}

export function createApp({ loaded, rpc, chain, readyTimeoutMs = 5000 }: AppDeps) {
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
      horizonUrl: config.horizonUrl,
      contracts: config.contracts,
      sources,
      recorded,
    }),
  );

  /** The borrower and the advance contract a history route needs, or the error response. */
  function historyScope(c: Context): { borrower: string; contract: string } | Response {
    const borrower = c.req.query("borrower") ?? "";
    if (!StrKey.isValidEd25519PublicKey(borrower)) {
      return c.json({ error: "borrower must be a Stellar account address (G…)" }, 400);
    }
    const contract = config.contracts.advance;
    if (!contract) return c.json({ error: "no advance contract is configured" }, 503);
    c.header("Cache-Control", "no-store");
    return { borrower, contract };
  }

  app.get("/advances", async (c) => {
    const scope = historyScope(c);
    if (scope instanceof Response) return scope;
    const { borrower, contract } = scope;
    const ops = await upstream(() => chain.operations(borrower));
    // Newest first, so the first call per nullifier is the one that funded it.
    const funded = new Map<string, string>();
    for (const call of advanceCalls(ops, borrower, contract)) {
      if (call.successful && !funded.has(call.nullifier)) funded.set(call.nullifier, call.hash);
    }
    const records = await upstream(() =>
      Promise.all([...funded.keys()].map((n) => chain.readAdvance(contract, n))),
    );
    const rows = [...funded.entries()]
      .map(([nullifier, txHash], i) => ({ nullifier, txHash, record: records[i] }))
      // The contract's record is the authority: no record, or someone else's, is not listed.
      .filter((r): r is { nullifier: string; txHash: string; record: AdvanceRecord } => r.record?.borrower === borrower)
      .sort((a, b) => (a.record.openedAt === b.record.openedAt ? 0 : a.record.openedAt > b.record.openedAt ? -1 : 1));
    return c.json(
      rows.map(({ nullifier, txHash, record }) => ({
        nullifier,
        borrower: record.borrower,
        windowStart: record.windowStart,
        windowEnd: record.windowEnd,
        revenueCents: String(record.revenueCents),
        principal: String(record.principal),
        repaid: String(record.repaid),
        openedAt: String(record.openedAt),
        txHash,
      })),
    );
  });

  app.get("/transactions", async (c) => {
    const scope = historyScope(c);
    if (scope instanceof Response) return scope;
    const ops = await upstream(() => chain.operations(scope.borrower));
    return c.json(
      ledgerTransactions(ops, scope.borrower, scope.contract).map((t) => ({
        ...t,
        amount: String(t.amount),
        at: String(t.at),
      })),
    );
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    if (err instanceof UpstreamError) return c.json({ error: "the chain could not be read; try again" }, 502);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}

/** Horizon or the RPC failed: a 502 the front end can retry, not a 500 bug. */
class UpstreamError extends Error {}

async function upstream<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    throw new UpstreamError((e as Error).message, { cause: e });
  }
}
