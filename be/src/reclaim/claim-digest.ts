/**
 * Turning a Reclaim claim into the exact 32 bytes its attestor signed.
 *
 * This is the one piece of Forepay that has to be byte-perfect. Reclaim's Soroban
 * verifier takes a digest, a signature and a recovery id — it does not parse a
 * claim, and it does not build the digest. One byte out and every proof comes back
 * `SignatureMismatch` (#5), an error that says nothing about which byte.
 *
 * Verified against a real production-attestor signature — see
 * `tools/fixtures/real-reclaim-proof.json` and the test beside this file.
 *
 * The chain, matching `@reclaimprotocol/attestor-core`:
 *
 *   identifier = keccak256(`${provider}\n${parameters}\n${canonicalContext}`)
 *   signData   = `${identifier}\n${owner.toLowerCase()}\n${timestampS}\n${epoch}`
 *   digest     = keccak256(`\x19Ethereum Signed Message:\n${signData.length}${signData}`)
 *
 * Three details that are easy to get wrong and silent when you do:
 *
 *  1. `context` is re-canonicalised as JSON with **sorted keys** before hashing.
 *     Passing it through verbatim works only while the producer happened to emit
 *     sorted keys.
 *  2. `owner` is **lowercased**. A checksummed address produces a different digest.
 *  3. The EIP-191 length prefix counts **characters of signData**, and signData is
 *     pure ASCII here, so bytes and characters agree — but do not assume that if a
 *     non-ASCII field ever enters the claim.
 */
import { keccak_256 } from "@noble/hashes/sha3";

export interface ClaimInfo {
  provider: string;
  parameters: string;
  context: string;
}

export interface SignedClaimData {
  identifier: string;
  owner: string;
  timestampS: number;
  epoch: number;
}

/** JSON with object keys sorted and no whitespace — Reclaim's `canonicalStringify`. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * `keccak256(provider \n parameters \n canonical(context))`, lowercase `0x` hex.
 *
 * This is where the revenue figure is bound: it lives inside `context`, and the
 * signature covers it only through this hash. Nothing downstream may trust a
 * revenue figure that was not fed into this function.
 */
export function getIdentifierFromClaimInfo(info: ClaimInfo): string {
  let context = info.context;
  if (context && context.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(context);
    } catch {
      throw new Error("context is not empty and is not JSON, so it cannot be canonicalised");
    }
    context = canonicalStringify(parsed);
  }
  const str = `${info.provider}\n${info.parameters}\n${context || ""}`;
  return `0x${Buffer.from(keccak_256(Buffer.from(str, "utf8"))).toString("hex")}`;
}

/** The four lines the attestor signs, in order. */
export function createSignDataForClaim(claim: SignedClaimData): string {
  return [
    claim.identifier,
    claim.owner.toLowerCase(),
    String(claim.timestampS),
    String(claim.epoch),
  ].join("\n");
}

/** EIP-191 personal-sign digest: what goes into `verify_proof` as `message_digest`. */
export function messageDigest(signData: string): Buffer {
  const prefixed = `\x19Ethereum Signed Message:\n${signData.length}${signData}`;
  return Buffer.from(keccak_256(Buffer.from(prefixed, "utf8")));
}

/**
 * Split a 65-byte Reclaim signature into what the Soroban contract wants.
 *
 * The contract takes `r||s` (64 bytes) and the recovery id separately. Reclaim
 * emits 65 bytes with a trailing `v` of 27 or 28, so the recovery id is `v - 27`.
 */
export function splitSignature(signature: string): { sig64: Buffer; recoveryId: number } {
  const raw = Buffer.from(signature.replace(/^0x/, ""), "hex");
  if (raw.length !== 65) throw new Error(`expected a 65-byte signature, got ${raw.length}`);
  const v = raw[65 - 1];
  if (v !== 27 && v !== 28) throw new Error(`unexpected recovery byte ${v}, expected 27 or 28`);
  return { sig64: raw.subarray(0, 64), recoveryId: v - 27 };
}

/** Everything `verify_proof` needs, from a claim and its signature. */
export function prepareVerification(info: ClaimInfo, claim: SignedClaimData, signature: string) {
  const identifier = getIdentifierFromClaimInfo(info);
  if (identifier.toLowerCase() !== claim.identifier.toLowerCase()) {
    // The claim carries its own identifier. If ours disagrees, the claim info we
    // were handed is not the claim info that was signed — refuse rather than
    // verify a digest built from data nobody attested.
    throw new Error(
      `identifier mismatch: claim says ${claim.identifier}, claim info hashes to ${identifier}`,
    );
  }
  const signData = createSignDataForClaim({ ...claim, identifier });
  const { sig64, recoveryId } = splitSignature(signature);
  return { identifier, signData, messageDigest: messageDigest(signData), sig64, recoveryId };
}
