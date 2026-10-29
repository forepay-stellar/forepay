/**
 * Forepay #17: from an access token to `request_advance`'s arguments, with the
 * borrower inside the signed claim, and every way it can stop before the attestor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ProveError } from "../adsense/account.js";
import { recoverSigner } from "../adsense/audit.js";
import { CONTEXT_MESSAGE } from "../adsense/request.js";
import { createSignDataForClaim, messageDigest } from "../reclaim/claim-digest.js";
import { ALICE, ATTESTOR, BOB, NOW, PUB, Q3, TOKEN, fakeGoogle, fakeZkFetch, report } from "./fake-reclaim.js";
import { proveRevenue, toAdvanceRequest, type ProveDeps, type ProveStep } from "./prove.js";

function deps(o: Partial<ProveDeps> = {}): ProveDeps {
  return { google: fakeGoogle(), zkFetch: fakeZkFetch(), now: () => NOW, attestor: ATTESTOR, ...o };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ProveError, String(e));
    return e.code;
  }
  assert.fail("expected a ProveError");
}

test("a proof comes back as request_advance's arguments, signed by the attestor", async () => {
  const steps: ProveStep[] = [];
  const zk = fakeZkFetch();
  const proven = await proveRevenue(deps({ zkFetch: zk }), { borrower: ALICE, accessToken: TOKEN }, (s) => steps.push(s));
  assert.deepEqual(steps, ["checking", "proving", "auditing"]);

  const req = toAdvanceRequest(proven);
  assert.deepEqual({ ...req, signature: "…" }, {
    revenueUsd: "1234.56",
    pubId: PUB,
    windowStart: "2026-07-01",
    windowEnd: "2026-09-30",
    timestampS: String(Math.floor(NOW.getTime() / 1000) - 60),
    epoch: "1",
    signature: "…",
    recoveryId: req.recoveryId,
  });
  // The signature and recovery id are the ones verify_proof takes: they recover the attestor.
  const c = proven.proof.claimData;
  const digest = messageDigest(createSignDataForClaim({ identifier: c.identifier, owner: c.owner, timestampS: c.timestampS, epoch: c.epoch }));
  assert.equal(recoverSigner(digest, Buffer.from(req.signature, "hex"), req.recoveryId), ATTESTOR);
  assert.match(req.signature, /^[0-9a-f]{128}$/);
});

test("the borrower goes into the claim before signing, and the token only into the secret headers", async () => {
  const zk = fakeZkFetch();
  await proveRevenue(deps({ zkFetch: zk }), { borrower: ALICE, accessToken: TOKEN });
  const [url, options, secretOptions] = zk.calls[0];
  assert.deepEqual(options.context, { contextAddress: ALICE, contextMessage: CONTEXT_MESSAGE });
  assert.deepEqual(secretOptions.headers, { Authorization: `Bearer ${TOKEN}` });
  assert.ok(!JSON.stringify([url, options, secretOptions.responseMatches, secretOptions.responseRedactions]).includes(TOKEN));
});

test("a proof whose signed context names someone else is refused, not returned", async () => {
  const zk = fakeZkFetch({ context: { contextAddress: BOB } });
  assert.equal(await code(proveRevenue(deps({ zkFetch: zk }), { borrower: ALICE, accessToken: TOKEN })), "audit");
});

test("a proof that carries the token is refused", async () => {
  const zk = fakeZkFetch({ context: { leaked: `Bearer ${TOKEN}` } });
  assert.equal(await code(proveRevenue(deps({ zkFetch: zk }), { borrower: ALICE, accessToken: TOKEN })), "audit");
});

test("an account that is not READY stops before the attestor", async () => {
  const zk = fakeZkFetch();
  const google = fakeGoogle({ state: "CLOSED" });
  assert.equal(await code(proveRevenue(deps({ google, zkFetch: zk }), { borrower: ALICE, accessToken: TOKEN })), "account");
  assert.equal(zk.calls.length, 0);
  assert.ok(!google.calls.some((u) => u.includes("reports:generate")));
});

test("no AdSense account, or several, is the creator's to resolve", async () => {
  assert.equal(await code(proveRevenue(deps({ google: fakeGoogle({ accounts: [] }) }), { borrower: ALICE, accessToken: TOKEN })), "account");
  const two = fakeGoogle({ accounts: [PUB, "pub-6543210987654321"] });
  assert.equal(await code(proveRevenue(deps({ google: two }), { borrower: ALICE, accessToken: TOKEN })), "account");
  // Naming one resolves it.
  await proveRevenue(deps({ google: two }), { borrower: ALICE, accessToken: TOKEN, publisherId: PUB });
});

test("an expired token stops at the first read", async () => {
  const zk = fakeZkFetch();
  assert.equal(await code(proveRevenue(deps({ zkFetch: zk }), { borrower: ALICE, accessToken: "ya29.expired" })), "token");
  assert.equal(zk.calls.length, 0);
});

test("a report in another shape is caught locally, before minutes of proving", async () => {
  const zk = fakeZkFetch();
  const { totals: _dropped, ...noTotals } = report(Q3);
  void _dropped;
  const google = fakeGoogle({ report: noTotals });
  assert.equal(await code(proveRevenue(deps({ google, zkFetch: zk }), { borrower: ALICE, accessToken: TOKEN })), "provider");
  assert.equal(zk.calls.length, 0);
});

test("an attestor failure is a retryable prove error", async () => {
  const zk = fakeZkFetch({ fail: new Error("invalid proof (ZK proof 0, startIdx 0, record 1)") });
  assert.equal(await code(proveRevenue(deps({ zkFetch: zk }), { borrower: ALICE, accessToken: TOKEN })), "prove");
});

test("a C… or malformed borrower is refused before anything is read", async () => {
  const google = fakeGoogle();
  await assert.rejects(proveRevenue(deps({ google }), { borrower: "GABC", accessToken: TOKEN }), /not a Stellar account/);
  assert.equal(google.calls.length, 0);
});

test("a proof whose owner is not this relay's Reclaim app is refused by the audit (#102)", async () => {
  const other = "0x6415200c713135e77157e1536d488df4f2bb7d04";
  assert.equal(await code(proveRevenue(deps({ owner: other }), { borrower: ALICE, accessToken: TOKEN })), "audit");
  await proveRevenue(deps({ owner: "0x96faf173bb7171a530b3e44f35f32d1307bda4fa" }), { borrower: ALICE, accessToken: TOKEN });
});
