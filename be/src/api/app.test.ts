/**
 * Forepay #16: config loading, CORS and the routes, with no network. The RPC is a
 * stub, so /ready's failure modes can be forced.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ProveError } from "../adsense/account.js";
import type { AdvanceRecord } from "../chain/advance.js";
import type { HorizonOperation } from "../chain/history.js";
import { RECORDED } from "../network.js";
import { ProofJobs } from "../relay/jobs.js";
import type { AdvanceRequestJson } from "../relay/prove.js";
import { createApp, type ChainLike, type Prover, type RpcLike } from "./app.js";
import { loadConfig, parseOrigin } from "./config.js";

const FRONT_END = "https://app.forepay.example";
// A valid contract address that is not one of the recorded ones.
const OTHER_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

const healthy: RpcLike = { getHealth: async () => ({ status: "healthy", latestLedger: 123 }) };

// Real Horizon records for the rehearsal account; its advances went to the dev contract.
const OPS = (
  JSON.parse(readFileSync(join(import.meta.dirname, "../chain/fixtures/horizon-ops.json"), "utf8")) as {
    records: HorizonOperation[];
  }
).records;
const BORROWER = "GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2";
const DEV = "CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4";

/** The contract's record for an advance, as `advance(nullifier)` returned it on the dev contract. */
function record(pubId: string, openedAt: bigint, repaid = 10_000_000n): AdvanceRecord {
  return {
    borrower: BORROWER,
    pubId,
    windowStart: "2026-07-01",
    windowEnd: "2026-09-30",
    revenueCents: 400n,
    principal: 10_000_000n,
    repaid,
    openedAt,
  };
}

const RECORDS: Record<string, AdvanceRecord> = {
  "1d124817f351c4a88ed2fe92a2f79812f2bfa41e0610a5bbb84f7a5e892e68f5": record("pub-h1792261997", 1792262007n),
  d0cd01df330362b23508edf7e386950549da634b756d1c29aa242cfc9c88c839: record("pub-h1792084434", 1792084442n, 2_500_000n),
};

const fixtureChain: ChainLike = {
  operations: async () => OPS,
  readAdvance: async (_contract, nullifier) => RECORDS[nullifier] ?? null,
};

function app(env: Record<string, string> = {}, rpc: RpcLike = healthy, readyTimeoutMs?: number, chain = fixtureChain) {
  return createApp({ loaded: loadConfig({ CORS_ORIGINS: FRONT_END, ...env }), rpc, chain, readyTimeoutMs });
}

test("with no overrides, /config reports exactly the recorded addresses", async () => {
  const res = await app().request("/config");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    network: "testnet",
    networkPassphrase: RECORDED.networkPassphrase,
    rpcUrl: RECORDED.rpcUrl,
    horizonUrl: RECORDED.horizonUrl,
    contracts: RECORDED.contracts,
    sources: {
      rpcUrl: "recorded",
      horizonUrl: "recorded",
      reclaimVerifier: "recorded",
      usdcSac: "recorded",
      advance: "recorded",
    },
    recorded: true,
    relay: false,
  });
});

test("a stale override is visible: source env, recorded false", async () => {
  const body = (await (await app({ RECLAIM_VERIFIER_ID: OTHER_CONTRACT }).request("/config")).json()) as {
    contracts: Record<string, string>;
    sources: Record<string, string>;
    recorded: boolean;
  };
  assert.equal(body.contracts.reclaimVerifier, OTHER_CONTRACT);
  assert.equal(body.sources.reclaimVerifier, "env");
  assert.equal(body.recorded, false);
});

test("bad configuration is refused at load, not discovered later", () => {
  assert.throws(() => loadConfig({ USDC_SAC_ID: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" }), /not a contract address/);
  assert.throws(() => loadConfig({ STELLAR_RPC_URL: "http://soroban-testnet.stellar.org" }), /https/);
  assert.throws(() => loadConfig({ HORIZON_URL: "http://horizon-testnet.stellar.org" }), /https/);
  assert.throws(() => loadConfig({ STELLAR_NETWORK_PASSPHRASE: "Public Global Stellar Network ; September 2015" }), /only testnet/);
  assert.throws(() => loadConfig({ PORT: "99999" }), /PORT/);
});

test("CORS origins must be exact: no wildcard, no path, https unless localhost", () => {
  assert.equal(parseOrigin("https://app.forepay.example"), "https://app.forepay.example");
  assert.equal(parseOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const bad of ["*", "https://app.forepay.example/", "https://app.forepay.example/path", "http://app.forepay.example", "app.forepay.example"]) {
    assert.throws(() => parseOrigin(bad), /CORS origin/, bad);
  }
});

test("the configured front-end origin is allowed", async () => {
  const res = await app().request("/config", { headers: { Origin: FRONT_END } });
  assert.equal(res.headers.get("access-control-allow-origin"), FRONT_END);
});

test("any other origin gets no CORS grant at all", async () => {
  for (const origin of ["https://evil.example", "http://localhost:3000", "https://app.forepay.example.evil.example"]) {
    const res = await app().request("/config", { headers: { Origin: origin } });
    assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
  }
});

test("a preflight from the front end succeeds, for GET and the relay's POST only", async () => {
  const res = await app().request("/config", {
    method: "OPTIONS",
    headers: { Origin: FRONT_END, "Access-Control-Request-Method": "GET" },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), FRONT_END);
  assert.match(res.headers.get("access-control-allow-methods") ?? "", /^GET,POST,OPTIONS$/);
});

test("/health is up without touching the RPC", async () => {
  const broken: RpcLike = { getHealth: async () => { throw new Error("must not be called"); } };
  const res = await app({}, broken).request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("/ready reports the RPC, and 503 when it is down, unhealthy or slow", async () => {
  const ok = await app().request("/ready");
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: "ok", latestLedger: 123 });

  const down: RpcLike = { getHealth: async () => { throw new Error("ECONNREFUSED"); } };
  assert.equal((await app({}, down).request("/ready")).status, 503);

  const unhealthy: RpcLike = { getHealth: async () => ({ status: "unhealthy" }) };
  assert.equal((await app({}, unhealthy).request("/ready")).status, 503);

  const slow: RpcLike = { getHealth: () => new Promise((r) => setTimeout(() => r({ status: "healthy" }), 200)) };
  const res = await app({}, slow, 20).request("/ready");
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: "unavailable", rpc: "timeout" });
});

test("unknown routes are JSON 404s", async () => {
  const res = await app().request("/advances/1");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not found" });
});

test("/advances: the contract's record of each advance, newest first, amounts as strings", async () => {
  const res = await app({ ADVANCE_CONTRACT_ID: DEV }).request(`/advances?borrower=${BORROWER}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  // Only the two advances the contract has a record for are listed; the other calls in
  // the fixture have none in this stub, and an advance without a record is not shown.
  assert.deepEqual(await res.json(), [
    {
      nullifier: "1d124817f351c4a88ed2fe92a2f79812f2bfa41e0610a5bbb84f7a5e892e68f5",
      borrower: BORROWER,
      windowStart: "2026-07-01",
      windowEnd: "2026-09-30",
      revenueCents: "400",
      principal: "10000000",
      repaid: "10000000",
      openedAt: "1792262007",
      txHash: "1e066220909da8dfdfc92d1926a377a4dc2a08b12adaca2c88cef8f394a60f25",
    },
    {
      nullifier: "d0cd01df330362b23508edf7e386950549da634b756d1c29aa242cfc9c88c839",
      borrower: BORROWER,
      windowStart: "2026-07-01",
      windowEnd: "2026-09-30",
      revenueCents: "400",
      principal: "10000000",
      repaid: "2500000",
      openedAt: "1792084442",
      txHash: "9a94cf083543b58d79b60431de305f3912099ca9337ada4793ef1e38546f8ad0",
    },
  ]);
});

test("/advances only lists records the contract holds for this borrower", async () => {
  const someoneElse: ChainLike = {
    operations: async () => OPS,
    readAdvance: async (_c, n) => (RECORDS[n] ? { ...RECORDS[n], borrower: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" } : null),
  };
  const res = await app({ ADVANCE_CONTRACT_ID: DEV }, healthy, undefined, someoneElse).request(`/advances?borrower=${BORROWER}`);
  assert.deepEqual(await res.json(), []);
});

test("/transactions: every kind, as strings, newest first", async () => {
  const res = await app({ ADVANCE_CONTRACT_ID: DEV }).request(`/transactions?borrower=${BORROWER}`);
  assert.equal(res.status, 200);
  const rows = (await res.json()) as { kind: string; amount: string; at: string; status: string; nullifier: string }[];
  assert.deepEqual([...new Set(rows.map((r) => r.kind))].sort(), ["advance", "repayment", "trustline"]);
  for (const r of rows) {
    assert.match(r.amount, /^\d+$/);
    assert.match(r.at, /^\d+$/);
  }
  assert.ok(rows.every((r, i) => i === 0 || BigInt(rows[i - 1].at) >= BigInt(r.at)));
});

test("history routes refuse a borrower that is not a G… address", async () => {
  for (const q of ["", "?borrower=", `?borrower=${DEV}`, "?borrower=GABC"]) {
    for (const route of ["/advances", "/transactions"]) {
      const res = await app().request(`${route}${q}`);
      assert.equal(res.status, 400, `${route}${q}`);
    }
  }
});

test("history routes answer 502 when the chain cannot be read, without leaking why", async () => {
  const down: ChainLike = {
    operations: async () => {
      throw new Error("Horizon answered 503 for GA2C…");
    },
    readAdvance: async () => null,
  };
  const original = console.error;
  console.error = () => {};
  try {
    for (const route of ["/advances", "/transactions"]) {
      const res = await app({}, healthy, undefined, down).request(`${route}?borrower=${BORROWER}`);
      assert.equal(res.status, 502);
      assert.deepEqual(await res.json(), { error: "the chain could not be read; try again" });
    }
  } finally {
    console.error = original;
  }
});

// --- the proof relay (#17) ---

const REQUEST: AdvanceRequestJson = {
  revenueUsd: "1234.56",
  pubId: "pub-1234567890123456",
  windowStart: "2026-07-01",
  windowEnd: "2026-09-30",
  timestampS: "1791590340",
  epoch: "1",
  signature: "ab".repeat(64),
  recoveryId: 1,
};
const TOKEN = "ya29.a0-test-token";

function relayApp(prover?: Prover, maxQueued?: number) {
  return createApp({
    loaded: loadConfig({ CORS_ORIGINS: FRONT_END }),
    rpc: healthy,
    chain: fixtureChain,
    prover,
    jobs: new ProofJobs({ log: () => {}, maxQueued }),
  });
}

function post(body: unknown, origin = FRONT_END) {
  return new Request("http://api/proofs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function finished(api: ReturnType<typeof relayApp>, id: string) {
  for (let i = 0; i < 100; i++) {
    const job = (await (await api.request(`/proofs/${id}`)).json()) as { stage: string };
    if (job.stage === "done" || job.stage === "failed") return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail("job did not finish");
}

test("POST /proofs answers 202 with a job; polling it ends in request_advance's arguments", async () => {
  const seen: unknown[] = [];
  const api = relayApp(async (input, onStep) => {
    seen.push(input);
    onStep("proving");
    return REQUEST;
  });
  const res = await api.request(post({ borrower: BORROWER, accessToken: TOKEN }));
  assert.equal(res.status, 202);
  assert.equal(res.headers.get("access-control-allow-origin"), FRONT_END);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const job = (await res.json()) as { id: string; stage: string };
  assert.match(job.id, /^[0-9a-f-]{36}$/);
  assert.equal(res.headers.get("location"), `/proofs/${job.id}`);

  const done = await finished(api, job.id);
  assert.deepEqual({ ...done, createdAt: 0 }, { id: job.id, stage: "done", createdAt: 0, request: REQUEST });
  assert.deepEqual(seen, [{ borrower: BORROWER, accessToken: TOKEN, publisherId: undefined }]);
  assert.ok(!JSON.stringify(done).includes(TOKEN));
});

test("a failed proof reports its code, and the token never appears in it", async () => {
  const api = relayApp(async () => {
    throw new ProveError("token", `Google refused ${TOKEN}`);
  });
  const job = (await (await api.request(post({ borrower: BORROWER, accessToken: TOKEN }))).json()) as { id: string };
  const done = (await finished(api, job.id)) as { error?: { code: string; message: string } };
  assert.deepEqual(done.error, { code: "token", message: "Google refused [redacted]" });
});

test("POST /proofs refuses what is not a proof request", async () => {
  const api = relayApp(async () => REQUEST);
  const cases: [unknown, number][] = [
    ["not json", 400],
    [{ accessToken: TOKEN }, 400],
    [{ borrower: DEV, accessToken: TOKEN }, 400],
    [{ borrower: BORROWER }, 400],
    [{ borrower: BORROWER, accessToken: "" }, 400],
    [{ borrower: BORROWER, accessToken: "x" }, 400],
    [{ borrower: BORROWER, accessToken: TOKEN, publisherId: "pub-1" }, 400],
    [{ borrower: BORROWER, accessToken: "x".repeat(9000) }, 413],
  ];
  for (const [body, status] of cases) {
    const res = await api.request(post(body));
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 80));
  }
});

test("a second proof for the same borrower while one runs is 409 running, without the running job's id", async () => {
  let release!: () => void;
  const api = relayApp(
    () =>
      new Promise((res) => {
        release = () => res(REQUEST);
      }),
  );
  assert.equal((await api.request(post({ borrower: BORROWER, accessToken: TOKEN }))).status, 202);
  const res = await api.request(post({ borrower: BORROWER, accessToken: TOKEN }));
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; id?: string };
  assert.equal(body.code, "running");
  assert.equal(body.id, undefined);
  await new Promise((r) => setTimeout(r, 0));
  release();
});

test("a full queue is 503 busy, with Retry-After", async () => {
  let release!: () => void;
  const api = relayApp(
    () =>
      new Promise((res) => {
        release = () => res(REQUEST);
      }),
    1,
  );
  const [SECOND, THIRD] = ["GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H", "GB4L3CM64YHTTOKQDLQHFM4G6L5V6H3TNFZZW44SYRHJUIFOOE4RGWQS"];
  assert.equal((await api.request(post({ borrower: BORROWER, accessToken: TOKEN }))).status, 202);
  assert.equal((await api.request(post({ borrower: SECOND, accessToken: TOKEN }))).status, 202);
  const res = await api.request(post({ borrower: THIRD, accessToken: TOKEN }));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Retry-After"), "120");
  assert.equal(((await res.json()) as { code: string }).code, "busy");
  release();
});

test("without a prover the relay is off: 503 unconfigured, and /config says so", async () => {
  const api = relayApp();
  const res = await api.request(post({ borrower: BORROWER, accessToken: TOKEN }));
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code: string }).code, "unconfigured");
  assert.equal(((await (await api.request("/config")).json()) as { relay: boolean }).relay, false);
  assert.equal(((await (await relayApp(async () => REQUEST).request("/config")).json()) as { relay: boolean }).relay, true);
});

test("unknown proof jobs are 404", async () => {
  assert.equal((await relayApp(async () => REQUEST).request("/proofs/00000000-0000-0000-0000-000000000000")).status, 404);
});

test("CORS preflight allows the front end to POST JSON, and nobody else", async () => {
  const preflight = (origin: string) =>
    relayApp(async () => REQUEST).request("/proofs", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
  const ok = await preflight(FRONT_END);
  assert.equal(ok.headers.get("access-control-allow-origin"), FRONT_END);
  assert.match(ok.headers.get("access-control-allow-methods") ?? "", /POST/);
  assert.match((ok.headers.get("access-control-allow-headers") ?? "").toLowerCase(), /content-type/);
  assert.equal((await preflight("https://evil.example")).headers.get("access-control-allow-origin"), null);
});
