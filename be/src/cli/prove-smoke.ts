/**
 * A live, fresh Reclaim proof of a PUBLIC endpoint, for verify:proof (#5).
 *
 *   pnpm -C be zk:files      once: the circuit files zkFetch proves with
 *   pnpm -C be prove:smoke
 *   pnpm -C be verify:proof be/proofs/smoke-<ts>.json --submit
 *
 * NOT gate evidence: the gate needs an AdSense response. This proves every other link
 * live: zkFetch through Reclaim's production attestor, redaction of a secret header,
 * the context binding to a Stellar address, and (with verify:proof) verify_proof on
 * testnet with a signature minted today rather than the #3 fixture.
 *
 * The endpoint is Horizon's root on mainnet: public, stable, no credential. A random
 * canary is sent as a secret header in the place the AdSense OAuth token goes. The
 * proof must not contain it anywhere, or it is not saved.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ReclaimClient } from "@reclaimprotocol/zk-fetch";

import { recoverSigner, PRODUCTION_ATTESTOR, type RevenueProof } from "../adsense/audit.js";
import { assertStellarAccount } from "../adsense/request.js";
import { prepareVerification } from "../reclaim/claim-digest.js";
import { ZK_ENGINE, hasZkFiles } from "../reclaim/zk-files.js";
import { BE_ROOT, die, keepSecret, loadEnv, need } from "./env.js";

const URL = "https://horizon.stellar.org/";
const CONTEXT_MESSAGE = "forepay:smoke:horizon:v1";
const MATCHES = [
  String.raw`"network_passphrase":\s*"(?<passphrase>Public Global Stellar Network ; September 2015)"`,
  String.raw`"history_latest_ledger":\s*(?<ledger>\d+)`,
];

async function main() {
  loadEnv(true);
  const appId = need("RECLAIM_APP_ID");
  const appSecret = keepSecret(need("RECLAIM_APP_SECRET"));
  const stellarAddress = need("STELLAR_ADDRESS");
  assertStellarAccount(stellarAddress);
  if (!hasZkFiles()) die("the ZK circuit files are missing. Run: pnpm -C be zk:files");
  const canary = keepSecret(`forepay-canary-${randomBytes(16).toString("hex")}`);

  console.log("Forepay #5 smoke run: a live proof of a public endpoint (NOT gate evidence)\n");
  console.log(`  url:      ${URL}`);
  console.log(`  borrower: ${stellarAddress}`);

  console.log("\n[1/3] Proving through Reclaim's attestor…");
  const client = new ReclaimClient(appId, appSecret, false, 2);
  let proof: RevenueProof | undefined;
  try {
    proof = (await client.zkFetch(
      URL,
      {
        method: "GET",
        headers: { accept: "application/json" },
        context: { contextAddress: stellarAddress, contextMessage: CONTEXT_MESSAGE },
        zkEngine: ZK_ENGINE,
      },
      {
        headers: { "X-Forepay-Canary": canary },
        responseMatches: MATCHES.map((value) => ({ type: "regex", value })),
        responseRedactions: MATCHES.map((regex) => ({ regex })),
      },
    )) as RevenueProof | undefined;
  } catch (e) {
    die(`zkFetch failed: ${(e as Error).message}`);
  }
  if (!proof) die("zkFetch returned no proof");

  console.log("\n[2/3] Checking the proof…");
  const text = JSON.stringify(proof);
  if (text.includes(canary) || text.includes("X-Forepay-Canary")) {
    die("the secret header leaked into the proof. NOT saved.");
  }
  console.log("  secret header: absent from the proof");
  const context = JSON.parse(proof.claimData.context) as {
    contextAddress?: string;
    extractedParameters?: Record<string, string>;
  };
  if (context.contextAddress !== stellarAddress) die(`context is bound to ${context.contextAddress}, not ${stellarAddress}`);
  console.log(`  bound to:      ${context.contextAddress}`);
  console.log(`  extracted:     ${JSON.stringify(context.extractedParameters)}`);
  const v = prepareVerification(
    { provider: proof.claimData.provider, parameters: proof.claimData.parameters, context: proof.claimData.context },
    proof.claimData,
    proof.signatures[0],
  );
  const signer = recoverSigner(v.messageDigest, v.sig64, v.recoveryId);
  if (signer !== PRODUCTION_ATTESTOR) die(`signature recovers to ${signer}, not the production attestor`);
  console.log(`  signer:        ${signer} (production attestor)`);

  console.log("\n[3/3] Saving…");
  const dir = join(BE_ROOT, "proofs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `smoke-${proof.claimData.timestampS}.json`);
  writeFileSync(file, JSON.stringify(proof, null, 2) + "\n", { mode: 0o644 });
  console.log(`  ${file}\n\nNext: pnpm -C be verify:proof ${file} --submit`);
}

main().catch((e: unknown) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)));
