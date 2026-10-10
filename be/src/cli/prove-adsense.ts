/**
 * Produce one real AdSense revenue proof (#4), audit it, and save it for #5.
 *
 *   pnpm -C be prove:adsense
 *
 * Reads be/.env (see be/.env.example). The file must be chmod 600, per the working
 * agreement; this script refuses to run otherwise.
 *
 * Order matters:
 *  1. A plain, local fetch of the same report runs the provider's regexes against the
 *     real response first. If AdSense's shape differs from what the provider expects,
 *     that shows up here in seconds, with the response's structure (keys only, never
 *     values), instead of as an opaque attestor failure.
 *  2. zkFetch produces the proof through Reclaim's attestor.
 *  3. The proof is audited field by field. A proof that fails the audit is NOT
 *     written to disk: a failure may mean it carries a credential.
 *  4. The proof is saved under be/proofs/ (gitignored) and the field report and the
 *     verify_proof inputs are printed.
 *
 * The access token is never printed. Error messages are scrubbed of it before they
 * reach the terminal.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ReclaimClient } from "@reclaimprotocol/zk-fetch";

import { auditRevenueProof, formatFieldReport, type RevenueProof } from "../adsense/audit.js";
import {
  ADSENSE_API,
  ADSENSE_SCOPE,
  DEFAULT_TRAILING_MONTHS,
  assertPublisherId,
  buildRevenueRequest,
  trailingMonths,
  withAccessToken,
} from "../adsense/request.js";
import { prepareVerification } from "../reclaim/claim-digest.js";
import { BE_ROOT, die, keepSecret, loadEnv, need, optional } from "./env.js";

function readConfig() {
  loadEnv(true);
  return {
    appId: need("RECLAIM_APP_ID"),
    appSecret: keepSecret(need("RECLAIM_APP_SECRET")),
    accessToken: keepSecret(need("GOOGLE_ACCESS_TOKEN")),
    stellarAddress: need("STELLAR_ADDRESS"),
    publisherId: optional("ADSENSE_PUBLISHER_ID"),
    months: Number(optional("TRAILING_MONTHS") || DEFAULT_TRAILING_MONTHS),
  };
}

async function googleGet(url: string, accessToken: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    const hint =
      res.status === 401
        ? " The access token is missing, expired (they last an hour) or lacks the scope " + ADSENSE_SCOPE
        : res.status === 403
          ? " The Google account has no AdSense access, or the AdSense Management API is not enabled for the OAuth client."
          : "";
    die(`AdSense API returned ${res.status} for ${url.split("?")[0]}.${hint}\n${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

/** The JSON's structure with every leaf value replaced by its type, for diagnostics. */
function shapeOf(v: unknown): unknown {
  if (Array.isArray(v)) return v.slice(0, 1).map(shapeOf);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shapeOf(x)]));
  }
  return typeof v;
}

async function resolvePublisherId(configured: string, accessToken: string): Promise<string> {
  if (configured) {
    assertPublisherId(configured);
    return configured;
  }
  const body = (await googleGet(`${ADSENSE_API}/accounts`, accessToken)) as { accounts?: { name: string }[] };
  const ids = (body.accounts ?? []).map((a) => a.name.replace(/^accounts\//, ""));
  if (ids.length === 1) {
    console.log(`  publisher id: ${ids[0]} (the only AdSense account this token can read)`);
    return ids[0];
  }
  die(
    ids.length === 0
      ? "this Google account has no AdSense account."
      : `this token can read ${ids.length} AdSense accounts (${ids.join(", ")}). Set ADSENSE_PUBLISHER_ID in be/.env.`,
  );
}

async function main() {
  const env = readConfig();

  console.log("Forepay #4: AdSense revenue proof\n");
  const publisherId = await resolvePublisherId(env.publisherId, env.accessToken);
  const window = trailingMonths(new Date(), env.months);
  const fmt = (d: { year: number; month: number; day: number }) =>
    `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  console.log(`  window:       ${fmt(window.start)} → ${fmt(window.end)} (${env.months} complete months)`);
  console.log(`  borrower:     ${env.stellarAddress}`);

  const request = buildRevenueRequest({ publisherId, stellarAddress: env.stellarAddress, window });

  // 1. Dry run: the provider's regexes against the real response, locally.
  console.log("\n[1/3] Checking the provider against the live AdSense response…");
  const live = await googleGet(request.url, env.accessToken);
  const pretty = JSON.stringify(live, null, 2);
  for (const m of request.secretOptions.responseMatches) {
    if (!new RegExp(m.value).test(pretty)) {
      die(
        `the live response does not match ${m.value}\n` +
          `Response structure (values hidden):\n${JSON.stringify(shapeOf(live), null, 2)}`,
      );
    }
  }
  console.log("  every match holds on the live response.");

  // 2. The proof.
  console.log("\n[2/3] Proving through Reclaim's attestor (this takes a while)…");
  const client = new ReclaimClient(env.appId, env.appSecret, false, 2);
  const call = withAccessToken(request, env.accessToken);
  let proof: RevenueProof | undefined;
  try {
    proof = (await client.zkFetch(call.url, call.options, call.secretOptions)) as RevenueProof | undefined;
  } catch (e) {
    die(`zkFetch failed: ${(e as Error).message}`);
  }
  if (!proof) die("zkFetch returned no proof");

  // 3. Audit before anything touches the disk.
  console.log("\n[3/3] Auditing the claim field by field…");
  let result;
  try {
    result = auditRevenueProof(proof, {
      publisherId,
      stellarAddress: env.stellarAddress,
      window,
      accessToken: env.accessToken,
      maxAgeS: 3600,
    });
  } catch (e) {
    die(`${(e as Error).message}\n\nThe proof was NOT saved.`);
  }

  const dir = join(BE_ROOT, "proofs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `adsense-${publisherId}-${proof.claimData.timestampS}.json`);
  writeFileSync(file, JSON.stringify(proof, null, 2) + "\n", { mode: 0o644 });

  const v = prepareVerification(
    { provider: proof.claimData.provider, parameters: proof.claimData.parameters, context: proof.claimData.context },
    proof.claimData,
    proof.signatures[0],
  );

  console.log(`\n✔ Audit passed. Proven revenue: ${result.revenueUsd} USD`);
  console.log(`  saved: ${file}\n`);
  console.log(formatFieldReport(result.fields));
  console.log("\nverify_proof inputs (for #5):");
  console.log(`  message_digest: ${v.messageDigest.toString("hex")}`);
  console.log(`  signature:      ${v.sig64.toString("hex")}`);
  console.log(`  recovery_id:    ${v.recoveryId}`);
}

main().catch((e: unknown) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)));
