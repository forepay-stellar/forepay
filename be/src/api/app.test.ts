/**
 * Forepay #16: config loading, CORS and the routes, with no network. The RPC is a
 * stub, so /ready's failure modes can be forced.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { RECORDED } from "../network.js";
import { createApp, type RpcLike } from "./app.js";
import { loadConfig, parseOrigin } from "./config.js";

const FRONT_END = "https://app.forepay.example";
// A valid contract address that is not one of the recorded ones.
const OTHER_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

const healthy: RpcLike = { getHealth: async () => ({ status: "healthy", latestLedger: 123 }) };

function app(env: Record<string, string> = {}, rpc: RpcLike = healthy, readyTimeoutMs?: number) {
  return createApp({ loaded: loadConfig({ CORS_ORIGINS: FRONT_END, ...env }), rpc, readyTimeoutMs });
}

test("with no overrides, /config reports exactly the recorded addresses", async () => {
  const res = await app().request("/config");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    network: "testnet",
    networkPassphrase: RECORDED.networkPassphrase,
    rpcUrl: RECORDED.rpcUrl,
    contracts: RECORDED.contracts,
    sources: { rpcUrl: "recorded", reclaimVerifier: "recorded", usdcSac: "recorded", advance: "recorded" },
    recorded: true,
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

test("a preflight from the front end succeeds, for GET only", async () => {
  const res = await app().request("/config", {
    method: "OPTIONS",
    headers: { Origin: FRONT_END, "Access-Control-Request-Method": "GET" },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), FRONT_END);
  assert.match(res.headers.get("access-control-allow-methods") ?? "", /^GET,OPTIONS$/);
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
