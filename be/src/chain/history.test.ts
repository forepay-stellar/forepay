/**
 * Forepay #16: reading a borrower's history from Horizon. The fixture is real Horizon
 * output for the #10/#23 rehearsal account against the dev contract, so the parsing is
 * tested against what Horizon actually returns, not what we assume it returns.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  advanceCalls,
  fetchOperations,
  ledgerTransactions,
  nullifierFor,
  toStroops,
  type HorizonOperation,
} from "./history.js";

const FIXTURE = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/horizon-ops.json"), "utf8")) as {
  records: HorizonOperation[];
};
const OPS = FIXTURE.records;
const BORROWER = "GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2";
const DEV = "CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4";
const PRODUCTION = "CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS";

test("the nullifier is the one the contract computed on chain (#61)", () => {
  // `is_spent` returns true for this value on the dev contract.
  assert.equal(
    nullifierFor("pub-h1792084434", "2026-07-01", "2026-09-30"),
    "d0cd01df330362b23508edf7e386950549da634b756d1c29aa242cfc9c88c839",
  );
});

test("length prefixes keep field boundaries: moving a character between fields changes it", () => {
  assert.notEqual(nullifierFor("pub-1", "2026-07-01", "2026-09-30"), nullifierFor("pub-12", "026-07-01", "2026-09-30"));
});

test("Horizon amounts become stroops exactly", () => {
  assert.equal(toStroops("1.0000000"), 10_000_000n);
  assert.equal(toStroops("0.75"), 7_500_000n);
  assert.equal(toStroops("922337203685.4775807"), 9_223_372_036_854_775_807n);
  assert.throws(() => toStroops("1.00000001"), /not a Horizon amount/);
  assert.throws(() => toStroops("-1"), /not a Horizon amount/);
});

test("request_advance calls are read with their arguments, nullifier and the USDC received", () => {
  const calls = advanceCalls(OPS, BORROWER, DEV);
  assert.ok(calls.length >= 3);
  const c = calls.find((x) => x.hash === "9a94cf083543b58d79b60431de305f3912099ca9337ada4793ef1e38546f8ad0");
  assert.deepEqual(c, {
    hash: "9a94cf083543b58d79b60431de305f3912099ca9337ada4793ef1e38546f8ad0",
    at: 1792084442n,
    successful: true,
    nullifier: "d0cd01df330362b23508edf7e386950549da634b756d1c29aa242cfc9c88c839",
    borrower: BORROWER,
    pubId: "pub-h1792084434",
    windowStart: "2026-07-01",
    windowEnd: "2026-09-30",
    disbursed: 10_000_000n,
  });
});

test("calls to another contract are not this contract's history", () => {
  assert.deepEqual(advanceCalls(OPS, BORROWER, PRODUCTION), []);
  assert.deepEqual(
    ledgerTransactions(OPS, BORROWER, PRODUCTION).map((t) => t.kind),
    ["trustline"],
  );
});

test("transactions: advances, repayments and the trustline, newest first, nothing else", () => {
  const txs = ledgerTransactions(OPS, BORROWER, DEV);
  const kinds = new Set(txs.map((t) => t.kind));
  assert.deepEqual([...kinds].sort(), ["advance", "repayment", "trustline"]);
  for (let i = 1; i < txs.length; i++) assert.ok(txs[i - 1].at >= txs[i].at, "newest first");

  const repay = txs.find((t) => t.hash === "886194f0c74f16719dd096f2b3cda8f6c78af265392a473b5d55aea0d951ed66");
  assert.deepEqual(repay, {
    hash: "886194f0c74f16719dd096f2b3cda8f6c78af265392a473b5d55aea0d951ed66",
    kind: "repayment",
    amount: 7_500_000n,
    at: 1792262032n,
    status: "completed",
    nullifier: "1d124817f351c4a88ed2fe92a2f79812f2bfa41e0610a5bbb84f7a5e892e68f5",
  });

  const trust = txs.filter((t) => t.kind === "trustline");
  assert.equal(trust.length, 1);
  assert.equal(trust[0].nullifier, "");
  assert.equal(trust[0].amount, 0n);
});

test("a transaction that failed on the ledger is listed as failed, with nothing moved for an advance", () => {
  const byHash = (h: string) => {
    const op = OPS.find((o) => o.transaction_hash === h);
    assert.ok(op, h);
    return op;
  };
  const repay = byHash("886194f0c74f16719dd096f2b3cda8f6c78af265392a473b5d55aea0d951ed66");
  const advance = byHash("9a94cf083543b58d79b60431de305f3912099ca9337ada4793ef1e38546f8ad0");
  const failed = [
    { ...repay, transaction_hash: "f1".repeat(32), transaction_successful: false, asset_balance_changes: [] },
    { ...advance, transaction_hash: "f2".repeat(32), transaction_successful: false, asset_balance_changes: [] },
  ];
  const txs = ledgerTransactions(failed, BORROWER, DEV);
  assert.deepEqual(
    txs.map((t) => [t.kind, t.status, t.amount]),
    [
      ["repayment", "failed", 7_500_000n], // what was attempted; no USDC moved
      ["advance", "failed", 0n],
    ],
  );
  assert.equal(advanceCalls(failed, BORROWER, DEV)[0].successful, false);
});

test("another account's calls are not listed for this borrower", () => {
  const other = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  assert.deepEqual(advanceCalls(OPS, other, DEV), []);
  assert.deepEqual(ledgerTransactions(OPS, other, DEV), []);
});

test("fetchOperations pages through Horizon, and an unknown account has no history", async () => {
  const page = (n: number, next?: string) =>
    new Response(JSON.stringify({ _embedded: { records: Array.from({ length: n }, (_, i) => ({ id: String(i) })) }, _links: { next: next ? { href: next } : undefined } }));
  const urls: string[] = [];
  const fake = (async (url: string) => {
    urls.push(url);
    return urls.length === 1 ? page(200, "https://h.example/next") : page(3);
  }) as unknown as typeof fetch;
  const ops = await fetchOperations(BORROWER, { horizonUrl: "https://h.example/", fetch: fake });
  assert.equal(ops.length, 203);
  assert.equal(urls[0], `https://h.example/accounts/${BORROWER}/operations?order=desc&limit=200&include_failed=true&join=transactions`);
  assert.equal(urls[1], "https://h.example/next");

  const missing = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
  assert.deepEqual(await fetchOperations(BORROWER, { horizonUrl: "https://h.example", fetch: missing }), []);

  const down = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(fetchOperations(BORROWER, { horizonUrl: "https://h.example", fetch: down }), /Horizon answered 503/);
});
