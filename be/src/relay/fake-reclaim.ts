/**
 * Test support for #17 and #95: Google's AdSense and AdMob APIs and a zkFetch that behave like the real
 * ones for one account, with claims signed by a throwaway key standing in for the
 * attestor. Not imported by the relay itself.
 */
import { secp256k1 } from "@noble/curves/secp256k1";

import type { AdmobFetch } from "../admob/account.js";
import { ADMOB_API } from "../admob/request.js";
import { ProveError, type GoogleGet } from "../adsense/account.js";
import { ADSENSE_API, CONTEXT_MESSAGE, type RevenueWindow } from "../adsense/request.js";
import { canonicalStringify, createSignDataForClaim, getIdentifierFromClaimInfo, messageDigest } from "../reclaim/claim-digest.js";
import { recoverSigner } from "../adsense/audit.js";
import type { ZkFetch } from "./prove.js";

export const PUB = "pub-1234567890123456";
export const ALICE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export const BOB = "GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H";
export const TOKEN = "ya29.a0-this-is-a-test-token-not-a-real-one";
/** Q3 2026 is the trailing window as of this date. */
export const NOW = new Date("2026-10-10T00:00:00Z");
export const Q3: RevenueWindow = { start: { year: 2026, month: 7, day: 1 }, end: { year: 2026, month: 9, day: 30 } };

const KEY = new Uint8Array(32).fill(0x22);
export const ATTESTOR = (() => {
  const digest = messageDigest("probe");
  const sig = secp256k1.sign(digest, KEY);
  return recoverSigner(digest, sig.toCompactRawBytes(), sig.recovery);
})();

export interface FakeGoogle {
  state?: string;
  accounts?: string[];
  report?: unknown;
}

/** The report AdSense returns for one metric over `w`, in the shape the provider matches. */
export function report(w: RevenueWindow, total = "1234.56") {
  return {
    totalMatchedRows: "3",
    headers: [{ name: "ESTIMATED_EARNINGS", type: "METRIC_CURRENCY", currencyCode: "USD" }],
    totals: { cells: [{ value: total }] },
    averages: { cells: [{ value: "411.52" }] },
    startDate: w.start,
    endDate: w.end,
  };
}

export function fakeGoogle(o: FakeGoogle = {}): GoogleGet & { calls: string[] } {
  const calls: string[] = [];
  const get = async (url: string, token: string) => {
    calls.push(url);
    if (token !== TOKEN) throw new ProveError("token", "Google refused the access token (401).");
    const path = url.slice(ADSENSE_API.length).split("?")[0];
    if (path === "/accounts") return { accounts: (o.accounts ?? [PUB]).map((p) => ({ name: `accounts/${p}` })) };
    if (path === `/accounts/${PUB}`) return { name: `accounts/${PUB}`, state: o.state ?? "READY" };
    if (path === `/accounts/${PUB}/reports:generate`) return o.report ?? report(Q3);
    throw new Error(`unexpected Google call ${url}`);
  };
  return Object.assign(get, { calls });
}

/**
 * An AdMob networkReport response with the bytes #93 read from a real account: two-space
 * indents inside elements, and `\n,\r\n` between them. Without `micros` it is the zero
 * case, `[header, footer {}]`.
 */
export function admobReport(w: RevenueWindow, micros?: string): string {
  const el = (o: unknown) => JSON.stringify(o, null, 2);
  const header = el({ header: { dateRange: { startDate: w.start, endDate: w.end }, localizationSettings: { currencyCode: "USD" } } });
  const row = el({ row: { metricValues: { ESTIMATED_EARNINGS: { microsValue: micros } } } });
  const footer = micros === undefined ? el({ footer: {} }) : el({ footer: { matchingRowCount: "1" } });
  return `[${[header, ...(micros === undefined ? [] : [row]), footer].join("\n,\r\n")}\n]`;
}

export interface FakeAdmob {
  accounts?: string[];
  report?: string;
}

export function fakeAdmob(o: FakeAdmob = {}): AdmobFetch & { calls: { url: string; body?: string }[] } {
  const calls: { url: string; body?: string }[] = [];
  const fetchAdmob = async (url: string, token: string, body?: string) => {
    calls.push({ url, body });
    if (token !== TOKEN) throw new ProveError("token", "Google refused the access token (401).");
    const path = url.slice(ADMOB_API.length);
    if (path === "/accounts") {
      return JSON.stringify({ account: (o.accounts ?? [PUB]).map((p) => ({ name: `accounts/${p}`, publisherId: p, currencyCode: "USD" })) });
    }
    if (path === `/accounts/${PUB}/networkReport:generate` && body !== undefined) return o.report ?? admobReport(Q3, "12345678");
    throw new Error(`unexpected AdMob call ${url}`);
  };
  return Object.assign(fetchAdmob, { calls });
}

export interface FakeZk {
  /** Overrides applied to the signed context, e.g. another contextAddress. */
  context?: Record<string, unknown>;
  revenueUsd?: string;
  /** Replaces `{ revenueUsd }` as the extracted parameters, e.g. `{ revenueMicros }`. */
  extracted?: Record<string, string>;
  timestampS?: number;
  fail?: Error;
}

/**
 * zkFetch as the attestor would answer it: the claim is built from the request it was
 * given, so what the relay put in (URL, matches, context) is what gets signed.
 */
export function fakeZkFetch(o: FakeZk = {}): ZkFetch & { calls: Parameters<ZkFetch>[] } {
  const calls: Parameters<ZkFetch>[] = [];
  const zk: ZkFetch = async (url, options, secretOptions) => {
    calls.push([url, options, secretOptions]);
    if (o.fail) throw o.fail;
    const parameters = canonicalStringify({
      body: "body" in options ? options.body : "",
      headers: { "User-Agent": "reclaim/0.0.1", ...options.headers },
      method: options.method,
      responseMatches: secretOptions.responseMatches,
      responseRedactions: secretOptions.responseRedactions,
      url,
    });
    const context = JSON.stringify({
      contextAddress: options.context.contextAddress,
      contextMessage: options.context.contextMessage ?? CONTEXT_MESSAGE,
      extractedParameters: o.extracted ?? { revenueUsd: o.revenueUsd ?? "1234.56" },
      providerHash: `0x${"ab".repeat(32)}`,
      ...o.context,
    });
    const owner = "0x96faf173bb7171a530b3e44f35f32d1307bda4fa";
    const timestampS = o.timestampS ?? Math.floor(NOW.getTime() / 1000) - 60;
    const identifier = getIdentifierFromClaimInfo({ provider: "http", parameters, context });
    const digest = messageDigest(createSignDataForClaim({ identifier, owner, timestampS, epoch: 1 }));
    const sig = secp256k1.sign(digest, KEY);
    const signature = `0x${Buffer.from(sig.toCompactRawBytes()).toString("hex")}${(27 + sig.recovery).toString(16)}`;
    return {
      identifier,
      claimData: { provider: "http", parameters, owner, timestampS, context, identifier, epoch: 1 },
      signatures: [signature],
      witnesses: [{ id: ATTESTOR, url: "wss://attestor.example/ws" }],
    };
  };
  return Object.assign(zk, { calls });
}
