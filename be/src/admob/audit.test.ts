/**
 * Forepay #95: an AdMob claim passes the same audit as an AdSense one, with its own
 * shape, and a claim from the other product, or for another window, does not.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditError, auditRevenueProof, type RevenueProof } from "../adsense/audit.js";
import { buildRevenueRequest, withAccessToken as withAdsenseToken } from "../adsense/request.js";
import { ALICE, ATTESTOR, NOW, PUB, Q3, TOKEN, fakeZkFetch, type FakeZk } from "../relay/fake-reclaim.js";
import { admobExpectationsFromClaim, auditAdmobProof } from "./audit.js";
import { buildAdmobRequest, withAccessToken } from "./request.js";

const expectations = { publisherId: PUB, stellarAddress: ALICE, window: Q3, accessToken: TOKEN, now: NOW, attestor: ATTESTOR };
const MICROS = { extracted: { revenueMicros: "12345678" } };

async function admobProof(o: FakeZk = MICROS, window = Q3): Promise<RevenueProof> {
  const call = withAccessToken(buildAdmobRequest({ publisherId: PUB, stellarAddress: ALICE, window }), TOKEN);
  return (await fakeZkFetch(o)(call.url, call.options, call.secretOptions)) as RevenueProof;
}

function failuresOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof AuditError) return e.failures;
    throw e;
  }
  return [];
}

test("a well-formed AdMob claim passes, with the figure in micros and in USD", async () => {
  const result = auditAdmobProof(await admobProof(), expectations);
  assert.deepEqual(result.figure, { name: "revenueMicros", value: "12345678" });
  assert.equal(result.revenueUsd, "12.345678");
  const fields = result.fields.map((f) => f.field);
  for (const f of ["parameters.url", "parameters.method", "parameters.body", "parameters.headers.content-type", "context.extractedParameters.revenueMicros", "signature"]) {
    assert.ok(fields.includes(f), `report is missing ${f}`);
  }
});

test("a claim for another window is refused: the body is the window", async () => {
  const june = { start: { year: 2026, month: 4, day: 1 }, end: { year: 2026, month: 6, day: 30 } };
  const proof = await admobProof(MICROS, june);
  assert.ok(failuresOf(() => auditAdmobProof(proof, expectations)).some((f) => f.startsWith("parameters.body")));
});

test("the figure must be revenueMicros, an integer", async () => {
  const decimal = await admobProof({ extracted: { revenueMicros: "12.34" } });
  assert.ok(failuresOf(() => auditAdmobProof(decimal, expectations)).some((f) => f.includes("extractedParameters")));
  const usd = await admobProof({ extracted: { revenueUsd: "12.34" } });
  assert.ok(failuresOf(() => auditAdmobProof(usd, expectations)).some((f) => f.includes("extractedParameters")));
});

test("an AdSense claim does not pass as AdMob, nor the reverse", async () => {
  const adsenseCall = withAdsenseToken(buildRevenueRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 }), TOKEN);
  const adsense = (await fakeZkFetch()(adsenseCall.url, adsenseCall.options, adsenseCall.secretOptions)) as RevenueProof;
  assert.ok(failuresOf(() => auditAdmobProof(adsense, expectations)).some((f) => f.startsWith("parameters.url")));
  const admob = await admobProof();
  assert.ok(failuresOf(() => auditRevenueProof(admob, expectations)).some((f) => f.startsWith("parameters.url")));
});

test("the publisher id, window and borrower read back from an AdMob claim", async () => {
  assert.deepEqual(admobExpectationsFromClaim(await admobProof()), { publisherId: PUB, window: Q3, stellarAddress: ALICE });
  const adsenseCall = withAdsenseToken(buildRevenueRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 }), TOKEN);
  const adsense = (await fakeZkFetch()(adsenseCall.url, adsenseCall.options, adsenseCall.secretOptions)) as RevenueProof;
  assert.equal(admobExpectationsFromClaim(adsense), null);
});
