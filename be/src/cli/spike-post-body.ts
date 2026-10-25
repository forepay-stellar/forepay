/**
 * Spike for #90, part 1: does a zkFetch POST sign its JSON body?
 *
 *   pnpm -C be spike:post-body
 *
 * AdMob's networkReport:generate is a POST whose window lives in the JSON body, not the
 * URL. If the attestor did not sign the body, a claim would not bind the window, and
 * AdMob through zkFetch would not be viable at all. So this proves, against Reclaim's
 * production attestor and a public echo endpoint (no credential):
 *
 *  1. the signed `parameters` carry `method: "POST"` and the body, byte for byte;
 *  2. the body actually reached the server: the echo returns a fresh nonce from it;
 *  3. changing the body changes the identifier, and the attestor's signature no longer
 *     recovers to the attestor. The window cannot be swapped after signing.
 *
 * The body has the shape of an AdMob `reportSpec`, so the parameters it produces are
 * the shape a pinned AdMob template would be derived from.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ReclaimClient } from "@reclaimprotocol/zk-fetch";

import { recoverSigner, PRODUCTION_ATTESTOR, type RevenueProof } from "../adsense/audit.js";
import { assertStellarAccount } from "../adsense/request.js";
import {
  createSignDataForClaim,
  getIdentifierFromClaimInfo,
  messageDigest,
  prepareVerification,
  splitSignature,
} from "../reclaim/claim-digest.js";
import { ZK_ENGINE, hasZkFiles } from "../reclaim/zk-files.js";
import { BE_ROOT, die, keepSecret, loadEnv, need } from "./env.js";

const URL = process.env.SPIKE_URL ?? "https://postman-echo.com/post";
const CONTEXT_MESSAGE = "forepay:spike:post-body:v1";

function reportSpec(nonce: string, endMonth: number): string {
  return JSON.stringify({
    reportSpec: {
      dateRange: { startDate: { year: 2026, month: 7, day: 1 }, endDate: { year: 2026, month: endMonth, day: 30 } },
      metrics: ["ESTIMATED_EARNINGS"],
      localizationSettings: { currencyCode: "USD" },
    },
    nonce,
  });
}

async function main() {
  loadEnv(true);
  const appId = need("RECLAIM_APP_ID");
  const appSecret = keepSecret(need("RECLAIM_APP_SECRET"));
  const stellarAddress = need("STELLAR_ADDRESS");
  assertStellarAccount(stellarAddress);
  if (!hasZkFiles()) die("the ZK circuit files are missing. Run: pnpm -C be zk:files");

  const nonce = `forepay-spike-${randomBytes(16).toString("hex")}`;
  const body = reportSpec(nonce, 9);
  const matches = [String.raw`"nonce":\s*"(?<nonce>forepay-spike-[0-9a-f]{32})"`];

  console.log("Forepay #90 spike: does a zkFetch POST sign its body?\n");
  console.log(`  url:   ${URL}`);
  console.log(`  body:  ${body}`);

  console.log("\n[1/4] Proving a POST through Reclaim's attestor…");
  const client = new ReclaimClient(appId, appSecret, false, 2);
  const started = Date.now();
  let proof: RevenueProof | undefined;
  try {
    proof = (await client.zkFetch(
      URL,
      {
        method: "POST",
        body,
        headers: { accept: "application/json", "content-type": "application/json" },
        context: { contextAddress: stellarAddress, contextMessage: CONTEXT_MESSAGE },
        zkEngine: ZK_ENGINE,
      },
      {
        responseMatches: matches.map((value) => ({ type: "regex", value })),
        responseRedactions: matches.map((regex) => ({ regex })),
      },
    )) as RevenueProof | undefined;
  } catch (e) {
    die(`zkFetch failed: ${(e as Error).message}`);
  }
  if (!proof) die("zkFetch returned no proof");
  console.log(`  proof in ${Math.round((Date.now() - started) / 1000)} s`);

  const info = { provider: proof.claimData.provider, parameters: proof.claimData.parameters, context: proof.claimData.context };
  const v = prepareVerification(info, proof.claimData, proof.signatures[0]);
  const signer = recoverSigner(v.messageDigest, v.sig64, v.recoveryId);
  if (signer !== PRODUCTION_ATTESTOR) die(`signature recovers to ${signer}, not the production attestor`);
  console.log(`  signer: ${signer} (production attestor)`);

  console.log("\n[2/4] The signed parameters carry the method and the body…");
  const params = JSON.parse(proof.claimData.parameters) as { method?: string; body?: string; url?: string };
  if (params.method !== "POST") die(`signed method is ${params.method}, not POST`);
  if (params.body !== body) die(`signed body differs from the body sent:\n  sent:   ${body}\n  signed: ${params.body}`);
  console.log("  method: POST, signed");
  console.log("  body:   identical to the body sent, signed");

  console.log("\n[3/4] The body reached the server…");
  const context = JSON.parse(proof.claimData.context) as { extractedParameters?: Record<string, string> };
  const echoed = context.extractedParameters?.nonce;
  if (echoed !== nonce) die(`the echo returned ${echoed}, not the nonce in the body`);
  console.log(`  echoed nonce matches: ${echoed}`);

  console.log("\n[4/4] A different window does not verify…");
  const swapped = { ...params, body: reportSpec(nonce, 6) };
  const tampered = { ...info, parameters: JSON.stringify(swapped) };
  const identifier = getIdentifierFromClaimInfo(tampered);
  if (identifier.toLowerCase() === proof.claimData.identifier.toLowerCase()) die("changing the body did not change the identifier");
  const { sig64, recoveryId } = splitSignature(proof.signatures[0]);
  const forged = recoverSigner(messageDigest(createSignDataForClaim({ ...proof.claimData, identifier })), sig64, recoveryId);
  if (forged === PRODUCTION_ATTESTOR) die("the signature still recovers to the attestor with a different body");
  console.log(`  identifier ${proof.claimData.identifier.slice(0, 18)}… → ${identifier.slice(0, 18)}…`);
  console.log(`  signature now recovers to ${forged}, not the attestor`);

  const dir = join(BE_ROOT, "proofs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `spike-post-body-${proof.claimData.timestampS}.json`);
  writeFileSync(file, JSON.stringify(proof, null, 2) + "\n", { mode: 0o644 });
  console.log(`\nPASS: a zkFetch POST signs its body. Saved ${file}`);
}

main().catch((e: unknown) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)));
