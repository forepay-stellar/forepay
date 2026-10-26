/**
 * Field-by-field audit of an AdSense revenue claim (#4).
 *
 * The issue's bar: the claim carries the revenue figure and "nothing that could
 * authenticate as the user", checked field by field, not "looks fine". So this is
 * an allow-list, not a deny-list. Every field the claim carries must be one we
 * expect, with a value we can explain; an unknown field fails the audit even if it
 * looks harmless, because nobody has said why it is safe yet.
 *
 * On top of the allow-list, the whole proof is scanned for anything shaped like a
 * Google credential, and for the exact access token used, when the caller has it.
 *
 * `auditRevenueProof` returns the report that goes into the comment on #4, and
 * throws if any check fails, listing every failure rather than the first.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

import { prepareVerification } from "../reclaim/claim-digest.js";
import {
  CONTEXT_MESSAGE,
  CURRENCY_REGEX,
  TOTAL_REGEX,
  buildRevenueRequest,
  type RevenueWindow,
} from "./request.js";

const ADSENSE_URL = /^https:\/\/adsense\.googleapis\.com\/v2\/accounts\/(pub-\d{16})\/reports:generate\?/;

/**
 * Publisher id, window and borrower as written in the claim, or null if the URL is
 * not an AdSense report. Auditing against these re-checks the claim's shape (the URL
 * must rebuild byte for byte from them) without trusting it to be the right account:
 * which account and borrower are acceptable is the caller's decision.
 */
export function expectationsFromClaim(proof: RevenueProof) {
  const url = String((JSON.parse(proof.claimData.parameters) as { url?: string }).url ?? "");
  const m = ADSENSE_URL.exec(url);
  if (!m) return null;
  const q = new URL(url).searchParams;
  const date = (p: string) => ({
    year: Number(q.get(`${p}.year`)),
    month: Number(q.get(`${p}.month`)),
    day: Number(q.get(`${p}.day`)),
  });
  const window: RevenueWindow = { start: date("startDate"), end: date("endDate") };
  const context = JSON.parse(proof.claimData.context) as { contextAddress?: string };
  return { publisherId: m[1], window, stellarAddress: String(context.contextAddress ?? "") };
}


/**
 * Reclaim's production attestor: the one witness in the epoch of the deployed testnet
 * verifier `CA3EMXR6…H54DU5` (see docs/deployments.md, issue #2).
 */
export const PRODUCTION_ATTESTOR = "0x244897572368eadf65bfbc5aec98d8e5443a9072";

/** zkFetch's output, as far as the audit reads it. */
export interface RevenueProof {
  identifier: string;
  claimData: {
    provider: string;
    parameters: string;
    owner: string;
    timestampS: number;
    context: string;
    identifier: string;
    epoch: number;
  };
  signatures: string[];
  witnesses: { id: string; url: string }[];
  extractedParameterValues?: Record<string, unknown>;
}

export interface AuditExpectations {
  publisherId: string;
  stellarAddress: string;
  window: RevenueWindow;
  /** When given, the proof must not contain this string anywhere. */
  accessToken?: string;
  /** Defaults to the current time. */
  now?: Date;
  /** Oldest acceptable claim, in seconds. Sanity bound only; #6 sets the real one. */
  maxAgeS?: number;
  /** Expected signer. Defaults to the production attestor; tests pass a throwaway key. */
  attestor?: string;
  /**
   * The Reclaim app id the proof was requested with, which the attestor signs as `owner`
   * and the contract pins (#102). When given, a claim with any other owner fails here
   * instead of as `VerifierRejected` on chain.
   */
  owner?: string;
}

export interface FieldReport {
  field: string;
  value: string;
  why: string;
}

export interface AuditResult {
  /** The figure in USD, as a decimal. For AdSense it is the extracted figure itself. */
  revenueUsd: string;
  /** The extracted parameter exactly as signed: what the contract rebuilds the context from. */
  figure: { name: string; value: string };
  timestampS: number;
  signer: string;
  fields: FieldReport[];
}

export class AuditError extends Error {
  constructor(readonly failures: string[]) {
    super(`claim failed the audit:\n - ${failures.join("\n - ")}`);
    this.name = "AuditError";
  }
}

/** Keys zkFetch writes into `parameters`. Anything else needs a reason first. */
const PARAMETER_KEYS = new Set([
  "body",
  "geoLocation",
  "headers",
  "method",
  "paramValues",
  "responseMatches",
  "responseRedactions",
  "url",
]);

/** Request headers allowed in the public parameters (compared lowercased). */
export const PUBLIC_HEADERS: ReadonlySet<string> = new Set(["accept", "user-agent"]);

const CONTEXT_KEYS = ["contextAddress", "contextMessage", "extractedParameters", "providerHash"];

/**
 * Shapes of Google credentials and of the HTTP fields that carry them. None of these
 * has any business inside a claim.
 */
const CREDENTIAL_PATTERNS: [string, RegExp][] = [
  ["an Authorization header", /authorization/i],
  ["a bearer token", /bearer\s/i],
  ["a cookie", /cookie/i],
  ["a Google OAuth access token (ya29.)", /ya29\./],
  ["a Google OAuth refresh token (1//)", /\b1\/\/0[\w-]{20,}/],
  ["a Google OAuth client secret (GOCSPX-)", /GOCSPX-/],
  ["a Google API key (AIza)", /AIza[0-9A-Za-z_-]{35}/],
];

const DECIMAL = /^\d+(?:\.\d+)?$/;

/**
 * What a claim from one provider must look like, field by field. The audit is the
 * same for every source; only these differ (#95).
 */
export interface ClaimShape {
  url: string;
  urlWhy: string;
  method: "GET" | "POST";
  /** `""` for a GET. For a POST, the exact body: it carries the window (#93). */
  body: string;
  bodyWhy: string;
  responseMatches: { type: string; value: string }[];
  responseRedactions: { regex: string }[];
  matchesWhy: string;
  /** Request headers allowed in the public parameters, lowercased. */
  publicHeaders: ReadonlySet<string>;
  /** The one extracted parameter, its format, and how to read it as USD. */
  figure: { name: string; format: RegExp; why: string; toUsd: (v: string) => string };
}

/** The AdSense claim shape (#4): a GET whose URL carries the account and the window. */
export function adsenseShape(expect: Pick<AuditExpectations, "publisherId" | "stellarAddress" | "window">): ClaimShape {
  const req = buildRevenueRequest(expect);
  return {
    url: req.url,
    urlWhy:
      "Host, publisher id and window. The publisher id is public (it appears in the ad code on every page that shows AdSense ads) and cannot authenticate anyone.",
    method: "GET",
    body: "",
    bodyWhy: "Empty: the report endpoint takes no body.",
    responseMatches: req.secretOptions.responseMatches,
    responseRedactions: req.secretOptions.responseRedactions,
    matchesWhy: "What the response had to contain: USD and a total; the window is fixed by the URL. Patterns only, no response data.",
    publicHeaders: PUBLIC_HEADERS,
    figure: {
      name: "revenueUsd",
      format: DECIMAL,
      why: "The figure being proven: estimated earnings in USD over the window. Disclosed on purpose.",
      toUsd: (v) => v,
    },
  };
}

export function recoverSigner(messageDigest: Uint8Array, sig64: Uint8Array, recoveryId: number) {
  const sig = secp256k1.Signature.fromCompact(sig64).addRecoveryBit(recoveryId);
  const pub = sig.recoverPublicKey(messageDigest).toRawBytes(false);
  return `0x${Buffer.from(keccak_256(pub.subarray(1))).subarray(12).toString("hex")}`;
}

export function auditRevenueProof(proof: RevenueProof, expect: AuditExpectations, shape: ClaimShape = adsenseShape(expect)): AuditResult {
  const failures: string[] = [];
  const fields: FieldReport[] = [];
  const fail = (msg: string) => failures.push(msg);
  const ok = (field: string, value: string, why: string) => fields.push({ field, value, why });

  const claim = proof.claimData;
  const now = expect.now ?? new Date();

  // 1. Nothing credential-shaped, anywhere in the proof.
  const whole = JSON.stringify(proof);
  for (const [what, re] of CREDENTIAL_PATTERNS) {
    if (re.test(whole)) fail(`the proof contains something shaped like ${what}`);
  }
  if (expect.accessToken && whole.includes(expect.accessToken)) {
    fail("the proof contains the OAuth access token itself");
  }

  // 2. provider
  if (claim.provider === "http") {
    ok("provider", "http", "Reclaim's generic HTTPS provider. A constant.");
  } else fail(`provider is ${JSON.stringify(claim.provider)}, expected "http"`);

  // 3. parameters, key by key.
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(claim.parameters) as Record<string, unknown>;
  } catch {
    fail("parameters is not JSON");
  }
  for (const key of Object.keys(params)) {
    if (!PARAMETER_KEYS.has(key)) fail(`parameters carries an unexpected key: ${key}`);
  }

  if (params.url === shape.url) {
    ok("parameters.url", String(params.url), shape.urlWhy);
  } else {
    fail(`parameters.url is ${JSON.stringify(params.url)}, expected ${shape.url}`);
  }

  if (params.method === shape.method) ok("parameters.method", shape.method, "A constant.");
  else fail(`parameters.method is ${JSON.stringify(params.method)}, expected ${shape.method}`);

  if ((params.body ?? "") === shape.body) {
    ok("parameters.body", shape.body === "" ? '""' : shape.body, shape.bodyWhy);
  } else fail(shape.body === "" ? "parameters.body is not empty" : `parameters.body is ${JSON.stringify(params.body)}, expected ${shape.body}`);

  const headers = (params.headers ?? {}) as Record<string, unknown>;
  for (const [name, value] of Object.entries(headers)) {
    if (shape.publicHeaders.has(name.toLowerCase())) {
      ok(
        `parameters.headers.${name}`,
        String(value),
        "A public request header. The OAuth token is sent as a secret header and is not here.",
      );
    } else fail(`parameters.headers carries a non-public header: ${name}`);
  }

  if (params.geoLocation === undefined || params.geoLocation === "") {
    if (params.geoLocation !== undefined) ok("parameters.geoLocation", '""', "Unset.");
  } else {
    ok("parameters.geoLocation", String(params.geoLocation), "A proxy country code. Not personal.");
  }

  const paramValues = params.paramValues as Record<string, unknown> | undefined;
  if (paramValues === undefined || Object.keys(paramValues).length === 0) {
    if (paramValues !== undefined) ok("parameters.paramValues", "{}", "Empty.");
  } else fail(`parameters.paramValues is not empty: ${Object.keys(paramValues).join(", ")}`);

  const matches = (params.responseMatches ?? []) as { type?: string; value?: string }[];
  const expectedMatches = shape.responseMatches;
  if (
    matches.length === expectedMatches.length &&
    matches.every(
      (m, i) =>
        Object.keys(m).every((k) => k === "type" || k === "value") &&
        m.type === expectedMatches[i].type &&
        m.value === expectedMatches[i].value,
    )
  ) {
    ok("parameters.responseMatches", `${matches.length} regexes`, shape.matchesWhy);
  } else fail("parameters.responseMatches differ from the provider's");

  const redactions = (params.responseRedactions ?? []) as Record<string, unknown>[];
  const expectedRedactions = shape.responseRedactions;
  if (
    redactions.length === expectedRedactions.length &&
    redactions.every(
      (r, i) =>
        r.regex === expectedRedactions[i].regex &&
        Object.entries(r).every(([k, v]) => k === "regex" || v === "" || v === undefined),
    )
  ) {
    ok(
      "parameters.responseRedactions",
      `${redactions.length} regexes`,
      "Which response spans were revealed to the attestor: the same two fragments the matches need. Patterns only.",
    );
  } else fail("parameters.responseRedactions differ from the provider's");

  // 4. context, key by key.
  let context: Record<string, unknown> = {};
  try {
    context = JSON.parse(claim.context) as Record<string, unknown>;
  } catch {
    fail("context is not JSON");
  }
  const contextKeys = Object.keys(context).sort();
  if (contextKeys.join() !== CONTEXT_KEYS.join()) {
    fail(`context keys are [${contextKeys.join(", ")}], expected [${CONTEXT_KEYS.join(", ")}]`);
  }

  if (context.contextAddress === expect.stellarAddress) {
    ok(
      "context.contextAddress",
      expect.stellarAddress,
      "The borrower's public Stellar account, bound inside the signed bytes (#17, #18).",
    );
  } else fail(`context.contextAddress is ${JSON.stringify(context.contextAddress)}, expected ${expect.stellarAddress}`);

  if (context.contextMessage === CONTEXT_MESSAGE) {
    ok("context.contextMessage", CONTEXT_MESSAGE, "Fixed purpose string. A constant.");
  } else fail(`context.contextMessage is ${JSON.stringify(context.contextMessage)}`);

  const extracted = (context.extractedParameters ?? {}) as Record<string, unknown>;
  const extractedKeys = Object.keys(extracted);
  const { name } = shape.figure;
  let figure = "";
  if (extractedKeys.length === 1 && extractedKeys[0] === name && shape.figure.format.test(String(extracted[name]))) {
    figure = String(extracted[name]);
    ok(`context.extractedParameters.${name}`, figure, shape.figure.why);
  } else fail(`context.extractedParameters must be exactly { ${name}: <${shape.figure.format.source}> }, got ${JSON.stringify(extracted)}`);

  if (typeof context.providerHash === "string" && /^0x[0-9a-f]{64}$/.test(context.providerHash)) {
    ok("context.providerHash", context.providerHash, "Hash of the provider configuration. Derived from public parameters.");
  } else fail("context.providerHash is not a 32-byte hex hash");

  // 5. owner, timestamp, epoch.
  if (!/^0x[0-9a-f]{40}$/.test(claim.owner)) {
    fail(`owner is not a lowercase 20-byte address: ${claim.owner}`);
  } else if (expect.owner && claim.owner !== expect.owner.toLowerCase()) {
    fail(`owner is ${claim.owner}, not the Reclaim app ${expect.owner.toLowerCase()} the contract pins (#102)`);
  } else {
    ok("owner", claim.owner, "The Reclaim app the proof was requested with, which the contract pins (#102). Public by construction.");
  }

  const nowS = Math.floor(now.getTime() / 1000);
  const maxAge = expect.maxAgeS ?? 7 * 86_400;
  if (!Number.isInteger(claim.timestampS)) fail("timestampS is not an integer");
  else if (claim.timestampS > nowS + 300) fail("timestampS is in the future");
  else if (nowS - claim.timestampS > maxAge) fail(`claim is older than ${maxAge}s`);
  else ok("timestampS", String(claim.timestampS), `When the attestor saw the response (${new Date(claim.timestampS * 1000).toISOString()}).`);

  if (Number.isInteger(claim.epoch)) ok("epoch", String(claim.epoch), "Attestor epoch number.");
  else fail("epoch is not an integer");

  // 6. Integrity: the identifier is the hash of what we just audited, and the
  // production attestor signed it. Without this, the fields above are only claims.
  let signer = "";
  if (proof.signatures.length !== 1) {
    fail(`expected exactly one signature, got ${proof.signatures.length}`);
  } else {
    try {
      const v = prepareVerification(
        { provider: claim.provider, parameters: claim.parameters, context: claim.context },
        { identifier: claim.identifier, owner: claim.owner, timestampS: claim.timestampS, epoch: claim.epoch },
        proof.signatures[0],
      );
      signer = recoverSigner(v.messageDigest, v.sig64, v.recoveryId);
      const attestor = (expect.attestor ?? PRODUCTION_ATTESTOR).toLowerCase();
      if (signer === attestor) {
        ok("identifier", claim.identifier, "keccak256 of provider, parameters and canonical context. Recomputed here and matched.");
        ok("signature", "65 bytes", `Recovers to ${attestor}${attestor === PRODUCTION_ATTESTOR ? ", Reclaim's production attestor" : ""}.`);
      } else fail(`signature recovers to ${signer}, not the expected attestor ${attestor}`);
    } catch (e) {
      fail(`integrity: ${(e as Error).message}`);
    }
  }
  if (proof.identifier !== claim.identifier) fail("top-level identifier differs from claimData.identifier");

  if (failures.length > 0) throw new AuditError(failures);
  return { revenueUsd: shape.figure.toUsd(figure), figure: { name, value: figure }, timestampS: claim.timestampS, signer, fields };
}

/** The audit as a Markdown table, for the comment on #4. */
export function formatFieldReport(fields: FieldReport[]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const rows = fields.map((f) => `| \`${f.field}\` | \`${esc(f.value)}\` | ${esc(f.why)} |`);
  return ["| Field | Value | Why it is safe |", "| --- | --- | --- |", ...rows].join("\n");
}

// Re-exported so callers can show the regexes they are auditing against.
export { CURRENCY_REGEX, TOTAL_REGEX };
