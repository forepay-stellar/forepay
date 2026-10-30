/**
 * Produce one real AdSense revenue proof (#4), audit it, and save it for #5. With
 * `--admob` (`pnpm -C be prove:admob`), the same for AdMob (#95): the proof the AdMob
 * claim template is derived from (#96).
 *
 *   pnpm -C be zk:files      once: the circuit files zkFetch proves with
 *   pnpm -C be prove:adsense
 *   GOOGLE_ACCESS_TOKEN="$(wl-paste)" pnpm -C be prove:admob
 *
 * A token in the environment wins over be/.env, so a short-lived token for someone
 * else's account never has to be written to a file.
 *
 * Reads be/.env (see be/.env.example). The file must be chmod 600, per the working
 * agreement; this script refuses to run otherwise.
 *
 * The steps are relay/prove.ts, the same code the relay (#17) runs. Order matters:
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

import { admobFetch } from "../admob/account.js";
import { ProveError, googleGet } from "../adsense/account.js";
import { formatFieldReport } from "../adsense/audit.js";
import { DEFAULT_TRAILING_MONTHS } from "../adsense/request.js";
import { prepareVerification } from "../reclaim/claim-digest.js";
import { ZK_ENGINE, hasZkFiles } from "../reclaim/zk-files.js";
import { isoDate, proveRevenue, type ProveStep, type Proven, type Source } from "../relay/prove.js";
import { BE_ROOT, die, keepSecret, loadEnv, need, optional } from "./env.js";

const SOURCE: Source = process.argv.includes("--admob") ? "admob" : "adsense";
const PRODUCT = SOURCE === "admob" ? "AdMob" : "AdSense";

function readConfig() {
  loadEnv(true);
  if (!hasZkFiles()) die("the ZK circuit files are missing. Run: pnpm -C be zk:files");
  return {
    appId: need("RECLAIM_APP_ID"),
    appSecret: keepSecret(need("RECLAIM_APP_SECRET")),
    accessToken: keepSecret(need("GOOGLE_ACCESS_TOKEN")),
    stellarAddress: need("STELLAR_ADDRESS"),
    publisherId: optional(SOURCE === "admob" ? "ADMOB_PUBLISHER_ID" : "ADSENSE_PUBLISHER_ID"),
    months: Number(optional("TRAILING_MONTHS") || DEFAULT_TRAILING_MONTHS),
  };
}

const STEPS: Record<ProveStep, string> = {
  checking: `[1/3] Checking the account and the provider against the live ${PRODUCT} response…`,
  proving: "[2/3] Proving through Reclaim's attestor (this takes a while)…",
  auditing: "[3/3] Auditing the claim field by field…",
};

async function main() {
  const env = readConfig();

  console.log(`Forepay ${SOURCE === "admob" ? "#95" : "#4"}: ${PRODUCT} revenue proof\n`);
  console.log(`  borrower:     ${env.stellarAddress}`);
  const client = new ReclaimClient(env.appId, env.appSecret, false, 2);
  let proven: Proven;
  try {
    proven = await proveRevenue(
      {
        owner: env.appId,
        google: googleGet,
        admob: admobFetch,
        zkFetch: (url, options, secretOptions) => client.zkFetch(url, { ...options, zkEngine: ZK_ENGINE }, secretOptions),
        months: env.months,
      },
      { borrower: env.stellarAddress, accessToken: env.accessToken, publisherId: env.publisherId, source: SOURCE },
      (step) => console.log(`\n${STEPS[step]}`),
    );
  } catch (e) {
    const notSaved = e instanceof ProveError && e.code === "audit" ? "\n\nThe proof was NOT saved." : "";
    die(`${(e as Error).message}${notSaved}`);
  }
  const { proof, publisherId, window, audit } = proven;
  console.log(`  publisher id: ${publisherId}${SOURCE === "adsense" ? " (READY)" : ""}`);
  console.log(`  window:       ${isoDate(window.start)} → ${isoDate(window.end)} (${env.months} complete months)`);

  const dir = join(BE_ROOT, "proofs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${SOURCE}-${publisherId}-${proof.claimData.timestampS}.json`);
  writeFileSync(file, JSON.stringify(proof, null, 2) + "\n", { mode: 0o644 });

  const v = prepareVerification(
    { provider: proof.claimData.provider, parameters: proof.claimData.parameters, context: proof.claimData.context },
    proof.claimData,
    proof.signatures[0],
  );

  const signed = audit.figure.name === "revenueUsd" ? "" : ` (signed as ${audit.figure.name} ${audit.figure.value})`;
  console.log(`\n✔ Audit passed. Proven revenue: ${audit.revenueUsd} USD${signed}`);
  console.log(`  saved: ${file}\n`);
  console.log(formatFieldReport(audit.fields));
  console.log("\nverify_proof inputs (for #5):");
  console.log(`  message_digest: ${v.messageDigest.toString("hex")}`);
  console.log(`  signature:      ${v.sig64.toString("hex")}`);
  console.log(`  recovery_id:    ${v.recoveryId}`);
}

main().catch((e: unknown) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)));
