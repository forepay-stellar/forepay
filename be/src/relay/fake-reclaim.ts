/**
 * Test support for #17: a Google AdSense API and a zkFetch that behave like the real
 * ones for one account, with claims signed by a throwaway key standing in for the
 * attestor. Not imported by the relay itself.
 */
import { secp256k1 } from "@noble/curves/secp256k1";

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

export interface FakeZk {
  /** Overrides applied to the signed context, e.g. another contextAddress. */
  context?: Record<string, unknown>;
  revenueUsd?: string;
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
      body: "",
      headers: { "User-Agent": "reclaim/0.0.1", ...options.headers },
      method: options.method,
      responseMatches: secretOptions.responseMatches,
      responseRedactions: secretOptions.responseRedactions,
      url,
    });
    const context = JSON.stringify({
      contextAddress: options.context.contextAddress,
      contextMessage: options.context.contextMessage ?? CONTEXT_MESSAGE,
      extractedParameters: { revenueUsd: o.revenueUsd ?? "1234.56" },
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
