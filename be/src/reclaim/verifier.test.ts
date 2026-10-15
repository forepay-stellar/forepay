/**
 * Forepay #5: the bytes handed to verify_proof, checked offline against the real
 * fixture. The network half (simulate, submit) is exercised by `pnpm -C be
 * verify:proof`; these tests pin what it sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { scValToNative } from "@stellar/stellar-sdk";

import { expectationsFromClaim, type RevenueProof } from "../adsense/audit.js";
import { CONTEXT_MESSAGE, buildRevenueUrl } from "../adsense/request.js";
import {
  describeContractError,
  flipFirstByte,
  readProof,
  verifyInputs,
  verifyProofArgs,
} from "./verifier.js";

const FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../tools/fixtures/real-reclaim-proof.json"), "utf8"),
);
const expected = FIXTURE.expected;

/** The fixture re-shaped as zkFetch emits it. */
function asZkFetch() {
  return {
    identifier: FIXTURE.signedClaim.claim.identifier,
    claimData: { ...FIXTURE.claimInfo, ...FIXTURE.signedClaim.claim },
    signatures: FIXTURE.signedClaim.signatures,
    witnesses: [],
  };
}

test("the verify_proof inputs for the real fixture are the ones accepted on chain", () => {
  const i = verifyInputs(FIXTURE);
  assert.equal(i.messageDigest.toString("hex"), expected.messageDigest);
  assert.equal(i.sig64.toString("hex"), expected.signature64);
  assert.equal(i.recoveryId, expected.recoveryId);
  assert.equal(i.signer, `0x${expected.recoveredSigner}`);
});

test("zkFetch output and the fixture shape give the same inputs", () => {
  assert.deepEqual(verifyInputs(asZkFetch()), verifyInputs(FIXTURE));
});

test("a proof that is not signed by the attestor is refused before any transaction", () => {
  assert.throws(() => verifyInputs(FIXTURE, "0x0000000000000000000000000000000000000001"), /not the attestor/);
  const tampered = asZkFetch();
  tampered.claimData.context = tampered.claimData.context.replace('"amount":"1"', '"amount":"9"');
  assert.throws(() => verifyInputs(tampered), /identifier mismatch/);
});

test("anything but exactly one signature is refused", () => {
  assert.throws(() => readProof({ ...asZkFetch(), signatures: [] }), /exactly one signature/);
  assert.throws(() => readProof({ ...asZkFetch(), signatures: ["0x", "0x"] }), /exactly one signature/);
  assert.throws(() => readProof({ hello: 1 }), /not a Reclaim proof/);
});

test("the arguments are bytes, bytes, u32, in that order", () => {
  const [digest, sig, rec] = verifyProofArgs(verifyInputs(FIXTURE));
  assert.deepEqual([digest.type, sig.type, rec.type], ["scvBytes", "scvBytes", "scvU32"]);
  assert.equal(Buffer.from(scValToNative(digest)).toString("hex"), expected.messageDigest);
  assert.equal(scValToNative(rec), expected.recoveryId);
});

test("malformed arguments never reach a transaction", () => {
  const i = verifyInputs(FIXTURE);
  assert.throws(() => verifyProofArgs({ ...i, messageDigest: Buffer.alloc(31) }), /32 bytes/);
  assert.throws(() => verifyProofArgs({ ...i, sig64: Buffer.alloc(65) }), /64 bytes/);
  assert.throws(() => verifyProofArgs({ ...i, recoveryId: 27 }), /0 or 1/);
});

test("the negative case alters exactly one byte, without touching the original", () => {
  const d = Buffer.from(expected.messageDigest, "hex");
  const f = flipFirstByte(d);
  assert.equal(d.toString("hex"), expected.messageDigest);
  assert.equal([...f].filter((b, k) => b !== d[k]).length, 1);
});

test("contract errors are named from the deployed error table", () => {
  assert.equal(
    describeContractError("HostError: Error(Contract, #5)\n\nEvent log..."),
    "Error(Contract, #5) SignatureMismatch",
  );
  assert.equal(describeContractError("Error(Contract, #42)"), "Error(Contract, #42) unknown code");
  assert.equal(describeContractError("Error(Crypto, InvalidInput)\nmore"), "Error(Crypto, InvalidInput)");
});

test("an AdSense claim yields its account, window and borrower; anything else yields null", () => {
  const window = { start: { year: 2026, month: 7, day: 1 }, end: { year: 2026, month: 9, day: 30 } };
  const borrower = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const claim = {
    claimData: {
      parameters: JSON.stringify({ url: buildRevenueUrl("pub-1234567890123456", window) }),
      context: JSON.stringify({ contextAddress: borrower, contextMessage: CONTEXT_MESSAGE }),
    },
  } as unknown as RevenueProof;
  assert.deepEqual(expectationsFromClaim(claim), {
    publisherId: "pub-1234567890123456",
    window,
    stellarAddress: borrower,
  });
  assert.equal(expectationsFromClaim(asZkFetch() as unknown as RevenueProof), null);
});
