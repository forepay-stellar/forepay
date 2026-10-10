/**
 * Calling Reclaim's deployed Soroban verifier (#5).
 *
 *   verify_proof(message_digest: BytesN<32>, signature: BytesN<64>, recovery_id: u32)
 *
 * The contract recovers a secp256k1 signer and checks it is a witness in the current
 * epoch. Everything that makes the digest mean something (the claim, its
 * canonicalisation, the attested figure) happens before this call, in
 * claim-digest.ts and adsense/audit.ts. This module only gets those 32 + 64 + 4
 * bytes onto the chain and reports what the contract said.
 */
import {
  Account,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  type xdr,
} from "@stellar/stellar-sdk";

import { PRODUCTION_ATTESTOR, recoverSigner } from "../adsense/audit.js";
import { RECORDED } from "../network.js";
import { prepareVerification, type ClaimInfo, type SignedClaimData } from "./claim-digest.js";

export const TESTNET = {
  rpcUrl: RECORDED.rpcUrl,
  networkPassphrase: RECORDED.networkPassphrase,
  /** Reclaim's own deployment, whose epoch holds the production attestor (#2). */
  verifier: RECORDED.contracts.reclaimVerifier,
  /** The verifier's owner. Exists on testnet; usable as a source for simulation only. */
  verifierOwner: "GA5UT3POTPOV6TUQVSRC3ZICLV6LTB6N6TFWL2JXY3NIXXD4TTVSUMH7",
  explorer: "https://stellar.expert/explorer/testnet",
} as const;

/** `ReclaimError`, as read from the deployed contract (docs/deployments.md). */
export const RECLAIM_ERRORS: Record<number, string> = {
  1: "OnlyOwner",
  2: "AlreadyInitialized",
  3: "HashMismatch",
  4: "LengthMismatch",
  5: "SignatureMismatch",
};

export interface VerifyInputs {
  messageDigest: Buffer;
  sig64: Buffer;
  recoveryId: number;
  /** Who the signature recovers to, computed locally. */
  signer: string;
  identifier: string;
}

/** The two proof shapes this repo handles: zkFetch output, and the #3 fixture. */
interface ZkFetchShape {
  claimData: ClaimInfo & SignedClaimData;
  signatures: unknown;
}
interface FixtureShape {
  claimInfo: ClaimInfo;
  signedClaim: { claim: SignedClaimData; signatures: unknown };
}

export function readProof(json: unknown): { claimInfo: ClaimInfo; claim: SignedClaimData; signature: string } {
  const p = (json ?? {}) as Partial<ZkFetchShape & FixtureShape>;
  if (p.claimData) {
    const c = p.claimData;
    return {
      claimInfo: { provider: c.provider, parameters: c.parameters, context: c.context },
      claim: { identifier: c.identifier, owner: c.owner, timestampS: c.timestampS, epoch: c.epoch },
      signature: one(p.signatures),
    };
  }
  if (p.claimInfo && p.signedClaim) {
    return { claimInfo: p.claimInfo, claim: p.signedClaim.claim, signature: one(p.signedClaim.signatures) };
  }
  throw new Error("not a Reclaim proof: expected claimData (zkFetch) or claimInfo + signedClaim");
}

function one(sigs: unknown): string {
  if (!Array.isArray(sigs) || sigs.length !== 1) {
    throw new Error("expected exactly one signature: verify_proof checks a single signer");
  }
  return sigs[0] as string;
}

/**
 * The verify_proof inputs, refusing anything not signed by the expected attestor.
 * Checking locally first turns "SignatureMismatch" from the chain, which says nothing
 * about why, into a precise error before any transaction is built.
 */
export function verifyInputs(json: unknown, attestor: string = PRODUCTION_ATTESTOR): VerifyInputs {
  const { claimInfo, claim, signature } = readProof(json);
  const v = prepareVerification(claimInfo, claim, signature);
  const signer = recoverSigner(v.messageDigest, v.sig64, v.recoveryId);
  if (signer !== attestor.toLowerCase()) {
    throw new Error(`signature recovers to ${signer}, not the attestor ${attestor}; the verifier would refuse it`);
  }
  return { messageDigest: v.messageDigest, sig64: v.sig64, recoveryId: v.recoveryId, signer, identifier: v.identifier };
}

/** The three arguments, typed as the contract declares them. */
export function verifyProofArgs(i: Pick<VerifyInputs, "messageDigest" | "sig64" | "recoveryId">): xdr.ScVal[] {
  if (i.messageDigest.length !== 32) throw new Error(`message_digest must be 32 bytes, got ${i.messageDigest.length}`);
  if (i.sig64.length !== 64) throw new Error(`signature must be 64 bytes, got ${i.sig64.length}`);
  if (i.recoveryId !== 0 && i.recoveryId !== 1) throw new Error(`recovery_id must be 0 or 1, got ${i.recoveryId}`);
  return [
    nativeToScVal(i.messageDigest, { type: "bytes" }),
    nativeToScVal(i.sig64, { type: "bytes" }),
    nativeToScVal(i.recoveryId, { type: "u32" }),
  ];
}

/** `Error(Contract, #5)` → `#5 SignatureMismatch`; anything else is returned as is. */
export function describeContractError(raw: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(raw);
  if (!m) return raw.split("\n")[0];
  const code = Number(m[1]);
  return `Error(Contract, #${code}) ${RECLAIM_ERRORS[code] ?? "unknown code"}`;
}

export function flipFirstByte(digest: Buffer): Buffer {
  const out = Buffer.from(digest);
  out[0] ^= 0x01;
  return out;
}

function buildTx(source: Account, contractId: string, args: xdr.ScVal[]) {
  return new TransactionBuilder(source, { fee: "1000000", networkPassphrase: TESTNET.networkPassphrase })
    .addOperation(new Contract(contractId).call("verify_proof", ...args))
    .setTimeout(300)
    .build();
}

export type SimulationOutcome = { ok: true } | { ok: false; error: string };

/**
 * Simulate verify_proof. No signature, no fee, no ledger change: `source` only has to
 * exist on testnet.
 */
export async function simulateVerify(
  server: rpc.Server,
  source: string,
  inputs: Pick<VerifyInputs, "messageDigest" | "sig64" | "recoveryId">,
  contractId: string = TESTNET.verifier,
): Promise<SimulationOutcome> {
  const account = await server.getAccount(source);
  const sim = await server.simulateTransaction(buildTx(account, contractId, verifyProofArgs(inputs)));
  if (rpc.Api.isSimulationError(sim)) return { ok: false, error: describeContractError(sim.error) };
  return { ok: true };
}

export interface SubmitOutcome {
  hash: string;
  status: string;
  ledger?: number;
  url: string;
}

/** Simulate, sign, send and wait. Throws if the transaction does not succeed. */
export async function submitVerify(
  server: rpc.Server,
  signer: Keypair,
  inputs: Pick<VerifyInputs, "messageDigest" | "sig64" | "recoveryId">,
  contractId: string = TESTNET.verifier,
): Promise<SubmitOutcome> {
  const account = await server.getAccount(signer.publicKey());
  const prepared = await server.prepareTransaction(buildTx(account, contractId, verifyProofArgs(inputs)));
  prepared.sign(signer);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new Error(`sendTransaction ${sent.status}: ${sent.errorResult?.toXDR("base64") ?? "no detail"}`);
  }
  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  const url = `${TESTNET.explorer}/tx/${sent.hash}`;
  if (done.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`transaction ${sent.hash} ended ${done.status}: ${url}`);
  }
  return { hash: sent.hash, status: done.status, ledger: done.ledger, url };
}
