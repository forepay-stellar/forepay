/**
 * Verify a Reclaim proof on Stellar testnet against Reclaim's deployed verifier (#5).
 *
 *   pnpm -C be verify:proof <proof.json>            simulate only: no key, no fee
 *   pnpm -C be verify:proof <proof.json> --submit   send the transaction (#5's evidence)
 *
 * Accepts zkFetch output (be/proofs/*.json from `prove:adsense`) and the #3 fixture.
 *
 * What it does, in order:
 *  1. An AdSense claim is audited again, field by field. Its expectations are read
 *     from the claim itself (publisher id and window from the URL, borrower from the
 *     context), so this re-checks that the URL is exactly the provider's template and
 *     that nothing credential-shaped is inside.
 *  2. The digest is rebuilt and the signature recovered locally. It must be the
 *     production attestor, or no transaction is built.
 *  3. verify_proof is simulated with the genuine digest (expect Ok) and with one byte
 *     flipped (expect #5 SignatureMismatch). Both outcomes, every time: a verifier
 *     that also accepted the flipped digest would make the "Ok" meaningless.
 *  4. With --submit, the genuine call is signed with STELLAR_SECRET_KEY from be/.env
 *     and sent. The account is funded from friendbot first if it does not exist yet.
 *     The output ends with the Markdown block for docs/deployments.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Keypair, StrKey, rpc } from "@stellar/stellar-sdk";

import { auditRevenueProof, expectationsFromClaim, formatFieldReport, type RevenueProof } from "../adsense/audit.js";
import { TESTNET, flipFirstByte, simulateVerify, submitVerify, verifyInputs } from "../reclaim/verifier.js";
import { die, keepSecret, loadEnv, optional } from "./env.js";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const submit = args.includes("--submit");
  if (!file) die("usage: pnpm -C be verify:proof <proof.json> [--submit]");

  loadEnv(submit);
  const secret = keepSecret(optional("STELLAR_SECRET_KEY"));
  if (submit && !StrKey.isValidEd25519SecretSeed(secret)) {
    die("--submit needs STELLAR_SECRET_KEY (S…) in be/.env: the testnet account that pays the fee");
  }
  const keypair = secret ? Keypair.fromSecret(secret) : undefined;

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(resolve(file), "utf8"));
  } catch (e) {
    die(`cannot read ${file}: ${(e as Error).message}`);
  }

  console.log("Forepay #5: verify a Reclaim proof on Stellar testnet");
  console.log(`  verifier: ${TESTNET.verifier} (Reclaim's own deployment)\n`);

  // 1. Audit, for AdSense claims.
  const proof = json as RevenueProof;
  const expect = proof.claimData ? expectationsFromClaim(proof) : null;
  let figure = "";
  if (expect) {
    console.log("[1/4] AdSense claim: auditing field by field…");
    try {
      // 30 days: this re-checks content, not freshness. Freshness is #6's number and #26's test.
      const result = auditRevenueProof(proof, { ...expect, maxAgeS: 30 * 86_400 });
      figure = result.revenueUsd;
      console.log(`  passed. Proven revenue: ${figure} USD for ${expect.publisherId}, bound to ${expect.stellarAddress}`);
    } catch (e) {
      die(`${(e as Error).message}\n\nNot verifying a claim that fails the audit.`);
    }
  } else {
    console.log("[1/4] Not an AdSense claim: skipping the audit, checking the signature path only.");
  }

  // 2. Local recovery.
  console.log("\n[2/4] Rebuilding the digest and recovering the signer…");
  let inputs;
  try {
    inputs = verifyInputs(json);
  } catch (e) {
    die((e as Error).message);
  }
  console.log(`  signer ${inputs.signer} = production attestor`);
  console.log(`  message_digest ${inputs.messageDigest.toString("hex")}`);
  console.log(`  recovery_id    ${inputs.recoveryId}`);

  // 3. Both outcomes, simulated.
  const server = new rpc.Server(TESTNET.rpcUrl);
  const source = keypair?.publicKey() ?? (optional("STELLAR_ADDRESS") || TESTNET.verifierOwner);
  let simSource = source;
  try {
    await server.getAccount(source);
  } catch {
    simSource = TESTNET.verifierOwner; // simulation needs only an existing account
  }
  console.log(`\n[3/4] Simulating verify_proof (source ${simSource}, nothing is signed)…`);
  const genuine = await simulateVerify(server, simSource, inputs);
  if (!genuine.ok) die(`the verifier refused the genuine digest: ${genuine.error}`);
  console.log("  genuine digest:      Ok");
  const flipped = await simulateVerify(server, simSource, { ...inputs, messageDigest: flipFirstByte(inputs.messageDigest) });
  if (flipped.ok || !flipped.error.includes("#5")) {
    die(`a one-byte-altered digest was not refused with SignatureMismatch: ${JSON.stringify(flipped)}`);
  }
  console.log(`  one byte flipped:    ${flipped.error}`);

  if (!submit) {
    console.log("\nSimulation only. Re-run with --submit to record the transaction for #5.");
    return;
  }

  // 4. The transaction.
  console.log("\n[4/4] Submitting…");
  const signer = keypair as Keypair;
  try {
    await server.getAccount(signer.publicKey());
  } catch {
    console.log(`  funding ${signer.publicKey()} from friendbot (testnet)…`);
    await server.fundAddress(signer.publicKey());
  }
  const sent = await submitVerify(server, signer, inputs);
  console.log(`  ${sent.status} in ledger ${sent.ledger}: ${sent.url}`);

  const short = `${sent.hash.slice(0, 8)}…`;
  console.log("\n--- docs/deployments.md ---\n");
  console.log(
    [
      `| Step | Result |`,
      `| --- | --- |`,
      `| \`verify_proof\` on \`${TESTNET.verifier}\` | **Ok**: [\`${short}\`](${sent.url}) |`,
      `| Same digest, one byte flipped (simulated) | \`${flipped.error}\` |`,
      `| Signer | \`${inputs.signer}\` (production attestor) |`,
      `| Claim identifier | \`${inputs.identifier}\` |`,
      ...(expect
        ? [
            `| AdSense account | \`${expect.publisherId}\` |`,
            `| Window | ${fmt(expect.window.start)} → ${fmt(expect.window.end)} |`,
            `| Proven revenue | **${figure} USD** |`,
            `| Bound borrower | \`${expect.stellarAddress}\` |`,
          ]
        : []),
    ].join("\n"),
  );
  if (expect) {
    const result = auditRevenueProof(proof, { ...expect, maxAgeS: 30 * 86_400 });
    console.log("\nRedacted claim, field by field:\n");
    console.log(formatFieldReport(result.fields));
  }
}

function fmt(d: { year: number; month: number; day: number }) {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

main().catch((e: unknown) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)));
