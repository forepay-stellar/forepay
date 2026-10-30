/**
 * The Forepay AdMob provider (#95): one zkFetch request that proves a creator's
 * trailing AdMob revenue, in USD micros, and nothing else. The sibling of
 * `../adsense/request.ts`; read that first, this only says what differs.
 *
 * What differs from AdSense, and why:
 *
 *  - `POST …/networkReport:generate`, with the window in a JSON body, not the URL.
 *    #93 proved the attestor signs the body byte for byte: `parameters.body` is the
 *    string sent, and a different window recovers to a different signer. So the body
 *    fixes the window here the way the query string does for AdSense, and it must be
 *    the same bytes for the same inputs: `buildReportBody` writes it by hand, in a
 *    fixed key order, with no whitespace.
 *  - The figure is `microsValue`, an integer string of millionths of a dollar, so it
 *    is extracted as `revenueMicros`, not `revenueUsd`. The contract converts it to
 *    cents, truncating (#94).
 *  - The response is a pretty-printed JSON array, `[header, row, footer]`, whose
 *    elements are separated by `\n,\r\n` (#93, read from a real account). The regexes
 *    therefore stay inside one element each and never span a separator.
 *  - At zero there is no `row` at all, only `[header, footer {}]` (#93). The earnings
 *    regex then does not match, and the relay stops before the attestor, as it does
 *    for an AdSense response without `totals`.
 *
 * The AdMob and AdSense publisher ids share one format, and can be the same id for
 * one creator (#93). Which product a claim is about is fixed by the host in the
 * signed URL, never by the id.
 *
 * Regexes here are evaluated by the attestor, which uses RE2: no lookarounds, no
 * backreferences.
 */
import {
  CONTEXT_MESSAGE,
  assertPublisherId,
  assertStellarAccount,
  type RevenueRequestInput,
  type RevenueWindow,
} from "../adsense/request.js";

export const ADMOB_API = "https://admob.googleapis.com/v1";

/** Read-only AdMob scope. The token needs nothing broader. */
export const ADMOB_SCOPE = "https://www.googleapis.com/auth/admob.readonly";

/** The name the figure is extracted under, inside the signed context. */
export const FIGURE = "revenueMicros";

/** What `ReclaimClient.zkFetch(url, options, secretOptions)` takes, minus the token. */
export interface AdmobRequest {
  url: string;
  options: {
    method: "POST";
    body: string;
    headers: Record<string, string>;
    context: { contextAddress: string; contextMessage: string };
  };
  secretOptions: {
    responseMatches: { type: "regex"; value: string }[];
    responseRedactions: { regex: string }[];
  };
}

export function buildReportUrl(publisherId: string): string {
  assertPublisherId(publisherId);
  return `${ADMOB_API}/accounts/${publisherId}/networkReport:generate`;
}

/**
 * The exact body that goes into the signed claim: one metric, no dimensions, USD.
 *
 * No dimensions, so the response carries exactly one row, the window's total. With a
 * dimension it would carry a row per value, and a total would have to be summed from
 * rows that Google rounds separately (#93 saw a 1-micro difference).
 */
export function buildReportBody(window: RevenueWindow): string {
  const date = (d: RevenueWindow["start"]) => `{"year":${d.year},"month":${d.month},"day":${d.day}}`;
  return (
    `{"reportSpec":{"dateRange":{"startDate":${date(window.start)},"endDate":${date(window.end)}},` +
    `"metrics":["ESTIMATED_EARNINGS"],"localizationSettings":{"currencyCode":"USD"}}}`
  );
}

/** The header echoes the currency the report was computed in. */
export const CURRENCY_REGEX = `"localizationSettings":\\s*\\{\\s*"currencyCode":\\s*"USD"\\s*\\}`;

/**
 * `"row": { "metricValues": { "ESTIMATED_EARNINGS": { "microsValue": "12345678" } } }`,
 * capturing the figure. A row that opens with `metricValues` has no `dimensionValues`,
 * so this cannot match a per-dimension row of some other report.
 */
export const EARNINGS_REGEX = `"row":\\s*\\{\\s*"metricValues":\\s*\\{\\s*"ESTIMATED_EARNINGS":\\s*\\{\\s*"microsValue":\\s*"(?<${FIGURE}>\\d+)"\\s*\\}\\s*\\}\\s*\\}`;

export function buildAdmobRequest(input: RevenueRequestInput): AdmobRequest {
  assertStellarAccount(input.stellarAddress);
  const url = buildReportUrl(input.publisherId);

  // As for AdSense, each redaction reveals exactly the span its match needs: the
  // currency and the one total, not the account, the window echo or the footer.
  const reveal = [CURRENCY_REGEX, EARNINGS_REGEX];
  return {
    url,
    options: {
      method: "POST",
      body: buildReportBody(input.window),
      headers: { accept: "application/json", "content-type": "application/json" },
      context: { contextAddress: input.stellarAddress, contextMessage: CONTEXT_MESSAGE },
    },
    secretOptions: {
      responseMatches: reveal.map((value) => ({ type: "regex", value })),
      responseRedactions: reveal.map((regex) => ({ regex })),
    },
  };
}

/** The token goes into the secret headers only, exactly as for AdSense. */
export function withAccessToken(request: AdmobRequest, accessToken: string) {
  if (!accessToken) throw new Error("an OAuth access token is required");
  return {
    url: request.url,
    options: request.options,
    secretOptions: {
      ...request.secretOptions,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  };
}

/**
 * Micros as an exact USD decimal, for display: `"12345678"` → `"12.345678"`. Exact,
 * not rounded; sizing truncates to cents on chain (#94), not here.
 */
export function microsToUsd(micros: string): string {
  if (!/^\d+$/.test(micros)) throw new Error(`not a micros value: ${micros}`);
  const padded = micros.padStart(7, "0");
  const frac = padded.slice(-6).replace(/0+$/, "");
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, "");
  return frac ? `${whole}.${frac}` : whole;
}
