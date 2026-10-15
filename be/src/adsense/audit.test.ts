/**
 * Forepay #4: the audit passes a well-formed claim and refuses every way a claim can
 * leak a credential or prove something other than what it says.
 *
 * Claims here are signed with a throwaway key, standing in for the attestor, so each
 * test can tamper with one field and re-sign or not. The real-attestor path is proven
 * by the #3 fixture test and by the live run recorded on #4.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { secp256k1 } from "@noble/curves/secp256k1";

import {
  canonicalStringify,
  createSignDataForClaim,
  getIdentifierFromClaimInfo,
  messageDigest,
} from "../reclaim/claim-digest.js";
import { AuditError, auditRevenueProof, formatFieldReport, recoverSigner, type RevenueProof } from "./audit.js";
import { CONTEXT_MESSAGE, buildRevenueRequest, type RevenueWindow } from "./request.js";

const PUB = "pub-1234567890123456";
const ALICE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
// A second valid G… address (ed25519 key 0x01…01), for the wrong-borrower case.
const BOB = "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H";
const Q3: RevenueWindow = { start: { year: 2026, month: 7, day: 1 }, end: { year: 2026, month: 9, day: 30 } };
const NOW = new Date("2026-10-10T00:00:00Z");
const TOKEN = "ya29.a0-this-is-a-test-token-not-a-real-one";

const KEY = new Uint8Array(32).fill(0x22);
const ATTESTOR = (() => {
  const digest = messageDigest("probe");
  const sig = secp256k1.sign(digest, KEY);
  return recoverSigner(digest, sig.toCompactRawBytes(), sig.recovery);
})();

interface Overrides {
  parameters?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestampS?: number;
}

/** A claim shaped exactly like zkFetch's output for our request, signed by ATTESTOR. */
function makeProof(o: Overrides = {}): RevenueProof {
  const req = buildRevenueRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 });
  const parameters = canonicalStringify({
    body: "",
    headers: { "User-Agent": "reclaim/0.0.1", accept: "application/json" },
    method: "GET",
    responseMatches: req.secretOptions.responseMatches,
    responseRedactions: req.secretOptions.responseRedactions,
    url: req.url,
    ...o.parameters,
  });
  const context = JSON.stringify({
    contextAddress: ALICE,
    contextMessage: CONTEXT_MESSAGE,
    extractedParameters: { revenueUsd: "1234.56" },
    providerHash: `0x${"ab".repeat(32)}`,
    ...o.context,
  });
  const owner = "0x96faf173bb7171a530b3e44f35f32d1307bda4fa";
  const timestampS = o.timestampS ?? Math.floor(NOW.getTime() / 1000) - 60;
  const identifier = getIdentifierFromClaimInfo({ provider: "http", parameters, context });
  const digest = messageDigest(createSignDataForClaim({ identifier, owner, timestampS, epoch: 1 }));
  const sig = secp256k1.sign(digest, KEY);
  const signature = `0x${Buffer.from(sig.toCompactRawBytes()).toString("hex")}${(27 + sig.recovery).toString(16)}`;
  return {
    identifier,
    claimData: { provider: "http", parameters, owner, timestampS, context, identifier, epoch: 1 },
    signatures: [signature],
    witnesses: [{ id: ATTESTOR, url: "wss://attestor.example/ws" }],
    extractedParameterValues: { revenueUsd: "1234.56" },
  };
}

const expectations = { publisherId: PUB, stellarAddress: ALICE, window: Q3, accessToken: TOKEN, now: NOW, attestor: ATTESTOR };

function failuresOf(proof: RevenueProof, expect = expectations): string[] {
  try {
    auditRevenueProof(proof, expect);
  } catch (e) {
    if (e instanceof AuditError) return e.failures;
    throw e;
  }
  return [];
}

test("a well-formed claim passes, and every field it carries is accounted for", () => {
  const result = auditRevenueProof(makeProof(), expectations);
  assert.equal(result.revenueUsd, "1234.56");
  assert.equal(result.signer, ATTESTOR);
  const fields = result.fields.map((f) => f.field);
  for (const f of [
    "provider",
    "parameters.url",
    "parameters.method",
    "parameters.body",
    "parameters.headers.User-Agent",
    "parameters.headers.accept",
    "parameters.responseMatches",
    "parameters.responseRedactions",
    "context.contextAddress",
    "context.contextMessage",
    "context.extractedParameters.revenueUsd",
    "context.providerHash",
    "owner",
    "timestampS",
    "epoch",
    "identifier",
    "signature",
  ]) {
    assert.ok(fields.includes(f), `report is missing ${f}`);
  }
  assert.match(formatFieldReport(result.fields), /^\| Field \| Value \| Why it is safe \|/);
});

test("an Authorization header in the public parameters fails", () => {
  const p = makeProof({ parameters: { headers: { accept: "application/json", Authorization: "Bearer x" } } });
  const f = failuresOf(p);
  assert.ok(f.some((m) => /Authorization header/.test(m)));
  assert.ok(f.some((m) => /non-public header: Authorization/.test(m)));
});

test("the access token anywhere in the proof fails, even in an innocent-looking field", () => {
  const f = failuresOf(makeProof({ context: { contextMessage: `note ${TOKEN}` } }));
  assert.ok(f.some((m) => /access token itself/.test(m)));
  assert.ok(f.some((m) => /ya29/.test(m)));
});

test("a cookie, in any casing, fails", () => {
  const f = failuresOf(makeProof({ parameters: { headers: { accept: "application/json", COOKIE: "SID=1" } } }));
  assert.ok(f.some((m) => /cookie/.test(m)));
});

test("a field nobody has explained fails, even if it looks harmless", () => {
  assert.ok(failuresOf(makeProof({ parameters: { additionalClientOptions: {} } })).some((m) => /unexpected key/.test(m)));
  assert.ok(failuresOf(makeProof({ context: { sessionId: "abc" } })).some((m) => /context keys/.test(m)));
});

test("secret parameter values in the public parameters fail", () => {
  assert.ok(failuresOf(makeProof({ parameters: { paramValues: { account: "x" } } })).some((m) => /paramValues/.test(m)));
});

test("a figure fetched from anywhere but the AdSense API fails: the forged-server attack", () => {
  // The attestor will sign whatever an attacker's own server returns. The URL is the
  // only thing that says the figure came from Google, so it must match exactly.
  const forged = makeProof({ parameters: { url: "https://attacker.example/v2/accounts/pub-1234567890123456/reports:generate" } });
  assert.ok(failuresOf(forged).some((m) => /parameters.url/.test(m)));
});

test("a different account or window in the URL fails", () => {
  const other = buildRevenueRequest({
    publisherId: "pub-6543210987654321",
    stellarAddress: ALICE,
    window: Q3,
  });
  assert.ok(failuresOf(makeProof({ parameters: { url: other.url } })).some((m) => /parameters.url/.test(m)));
});

test("loosened response matches fail", () => {
  const f = failuresOf(makeProof({ parameters: { responseMatches: [{ type: "regex", value: '"value":\\s*"(?<revenueUsd>\\d+)"' }] } }));
  assert.ok(f.some((m) => /responseMatches differ/.test(m)));
});

test("a proof bound to another borrower fails", () => {
  assert.ok(failuresOf(makeProof({ context: { contextAddress: BOB } })).some((m) => /contextAddress/.test(m)));
});

test("an extra or malformed extracted figure fails", () => {
  assert.ok(failuresOf(makeProof({ context: { extractedParameters: { revenueUsd: "1", email: "a@b.c" } } })).length > 0);
  assert.ok(failuresOf(makeProof({ context: { extractedParameters: { revenueUsd: "1,234" } } })).length > 0);
});

test("a context edited after signing fails the integrity check", () => {
  const p = makeProof();
  p.claimData.context = p.claimData.context.replace("1234.56", "9999999");
  assert.ok(failuresOf(p).some((m) => /identifier mismatch/.test(m)));
});

test("a claim signed by anyone but the expected attestor fails", () => {
  assert.ok(failuresOf(makeProof(), { ...expectations, attestor: undefined as unknown as string }).some((m) => /not the expected attestor/.test(m)));
});

test("a stale or future-dated claim fails", () => {
  const nowS = Math.floor(NOW.getTime() / 1000);
  assert.ok(failuresOf(makeProof({ timestampS: nowS - 8 * 86_400 })).some((m) => /older than/.test(m)));
  assert.ok(failuresOf(makeProof({ timestampS: nowS + 3600 })).some((m) => /future/.test(m)));
});
