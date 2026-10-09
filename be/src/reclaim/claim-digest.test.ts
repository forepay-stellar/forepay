/**
 * Forepay #3 — the canonicalisation is checked against a REAL attestor signature.
 *
 * Asserting that our code agrees with itself would prove nothing. The fixture carries
 * a signature from Reclaim's production attestor
 * `0x244897572368eadf65bfbc5aec98d8e5443a9072`, which is the witness registered in the
 * deployed Stellar verifier's epoch. If our digest is right, that signature recovers to
 * that address. If a single byte of the canonicalisation is wrong, it recovers to
 * something else and the test fails.
 *
 * The same digest was accepted on chain by Reclaim's own testnet verifier:
 * https://stellar.expert/explorer/testnet/tx/96a744d71ecada206fd46359fe7e895dd31919c9079f1c731d6b4ccdc8a41cda
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

import {
  canonicalStringify,
  createSignDataForClaim,
  getIdentifierFromClaimInfo,
  messageDigest,
  prepareVerification,
  splitSignature,
} from "./claim-digest.js";

const FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../tools/fixtures/real-reclaim-proof.json"), "utf8"),
);
const { claimInfo, signedClaim, expected } = FIXTURE;
const signature = signedClaim.signatures[0];

test("the identifier matches the one the attestor actually signed", () => {
  assert.equal(getIdentifierFromClaimInfo(claimInfo), expected.identifier);
});

test("signData is the four lines, in order, with the owner lowercased", () => {
  const signData = createSignDataForClaim({ ...signedClaim.claim, identifier: expected.identifier });
  assert.equal(signData, expected.signData);
  assert.equal(signData.split("\n").length, 4);
  assert.equal(signData.split("\n")[1], signedClaim.claim.owner.toLowerCase());
});

test("the digest matches the one accepted on chain", () => {
  assert.equal(messageDigest(expected.signData).toString("hex"), expected.messageDigest);
});

test("a real attestor signature recovers to the real attestor — the whole point", () => {
  const { sig64, recoveryId } = splitSignature(signature);
  assert.equal(recoveryId, expected.recoveryId);
  assert.equal(sig64.toString("hex"), expected.signature64);

  const sig = secp256k1.Signature.fromCompact(sig64).addRecoveryBit(recoveryId);
  const pub = sig.recoverPublicKey(Buffer.from(expected.messageDigest, "hex")).toRawBytes(false);
  const recovered = Buffer.from(keccak_256(pub.subarray(1))).subarray(12).toString("hex");

  assert.equal(recovered, expected.recoveredSigner);
});

test("prepareVerification produces every field verify_proof needs", () => {
  const out = prepareVerification(claimInfo, signedClaim.claim, signature);
  assert.equal(out.identifier, expected.identifier);
  assert.equal(out.messageDigest.toString("hex"), expected.messageDigest);
  assert.equal(out.sig64.toString("hex"), expected.signature64);
  assert.equal(out.recoveryId, expected.recoveryId);
});

// --- the ways this silently goes wrong ---

test("an owner that is not lowercased changes the digest", () => {
  const upper = createSignDataForClaim({
    ...signedClaim.claim,
    identifier: expected.identifier,
    owner: signedClaim.claim.owner.toUpperCase(),
  });
  // toLowerCase is applied inside, so the result must be unchanged.
  assert.equal(upper, expected.signData);
});

test("context is re-canonicalised, so key order in the input cannot matter", () => {
  const reordered = JSON.stringify(
    Object.fromEntries(Object.entries(JSON.parse(claimInfo.context)).reverse()),
  );
  assert.notEqual(reordered, claimInfo.context, "fixture must have more than one key to be meaningful");
  assert.equal(
    getIdentifierFromClaimInfo({ ...claimInfo, context: reordered }),
    expected.identifier,
  );
});

test("a one-character change anywhere in the context changes the identifier", () => {
  const tampered = claimInfo.context.replace('"amount":"1"', '"amount":"2"');
  assert.notEqual(tampered, claimInfo.context);
  assert.notEqual(getIdentifierFromClaimInfo({ ...claimInfo, context: tampered }), expected.identifier);
});

test("a claim whose stated identifier disagrees with its claim info is refused", () => {
  assert.throws(
    () =>
      prepareVerification(
        claimInfo,
        { ...signedClaim.claim, identifier: "0x" + "00".repeat(32) },
        signature,
      ),
    /identifier mismatch/,
  );
});

test("canonicalStringify sorts keys at every depth", () => {
  assert.equal(canonicalStringify({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
  assert.equal(canonicalStringify([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
});

test("a signature that is not 65 bytes, or has a bad recovery byte, is refused", () => {
  assert.throws(() => splitSignature("0x" + "11".repeat(64)), /65-byte/);
  assert.throws(() => splitSignature("0x" + "11".repeat(64) + "05"), /recovery byte/);
});
