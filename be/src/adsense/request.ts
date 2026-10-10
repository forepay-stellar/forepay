/**
 * The Forepay AdSense provider (#4): one zkFetch request that proves a creator's
 * trailing AdSense revenue, in USD, and nothing else.
 *
 * Why the AdSense Management API and not the AdSense web UI: the API returns a
 * documented, stable JSON shape, and it authenticates with a single OAuth bearer
 * token that zkFetch keeps out of the claim (`secretOptions.headers`). The web UI is
 * an obfuscated app behind a full Google session cookie; matching it would be
 * fragile, and the cookie is far more powerful than a read-only API token.
 *
 * What ends up in the signed claim, and why each part is there:
 *
 *  - `parameters.url`: host, account and window. Signed, so the contract can check
 *    the figure came from `adsense.googleapis.com` for one account over one window.
 *    A claim whose URL is not exactly `buildRevenueUrl(...)` proves nothing: anyone
 *    can point zkFetch at their own server and have the attestor sign whatever it
 *    returns. That check belongs to the consumer of the claim (see #6, #9).
 *  - `parameters.responseMatches`: the response must say USD, cover exactly this
 *    window, and carry a total. The figure is captured from the total.
 *  - `context.contextAddress`: the borrower's Stellar address, inside the signed
 *    bytes, so a proof bound to A cannot be spent by B (#17, #18).
 *  - `context.extractedParameters.revenueUsd`: the figure, as a decimal string.
 *
 * The OAuth token is the only credential, and it never enters the claim: it is
 * passed through `withAccessToken`, which writes it into the secret headers only.
 *
 * Regexes here are evaluated by the attestor, which uses RE2: no lookarounds, no
 * backreferences.
 */
import { StrKey } from "@stellar/stellar-sdk";

export const ADSENSE_API = "https://adsense.googleapis.com/v2";

/** Read-only AdSense scope. The token needs nothing broader. */
export const ADSENSE_SCOPE = "https://www.googleapis.com/auth/adsense.readonly";

/**
 * Fixed, versioned purpose string. Signed with the claim, so a consumer can refuse a
 * proof that was produced for something else, even one carrying the same address.
 */
export const CONTEXT_MESSAGE = "forepay:adsense-trailing-revenue:v1";

/** Complete calendar months the figure covers. Proposed for the #6 freeze. */
export const DEFAULT_TRAILING_MONTHS = 3;

/**
 * Days to wait after a month ends before treating it as complete. A month that has
 * ended in UTC may not have ended in the account's time zone (up to UTC-12), and
 * AdSense reporting lags by about a day.
 */
export const SETTLE_DAYS = 2;

/** A calendar date with no time zone, as the AdSense API takes it. */
export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export interface RevenueWindow {
  start: CivilDate; // inclusive
  end: CivilDate; // inclusive
}

export interface RevenueRequestInput {
  /** AdSense publisher id, `pub-` followed by 16 digits. */
  publisherId: string;
  /** Borrower's Stellar account, `G…`. Bound into the signed claim. */
  stellarAddress: string;
  window: RevenueWindow;
}

/** What `ReclaimClient.zkFetch(url, options, secretOptions)` takes, minus the token. */
export interface RevenueRequest {
  url: string;
  options: {
    method: "GET";
    headers: Record<string, string>;
    context: { contextAddress: string; contextMessage: string };
  };
  secretOptions: {
    responseMatches: { type: "regex"; value: string }[];
    responseRedactions: { regex: string }[];
  };
}

const PUBLISHER_ID = /^pub-\d{16}$/;

export function assertPublisherId(publisherId: string): void {
  if (!PUBLISHER_ID.test(publisherId)) {
    throw new Error(`not an AdSense publisher id (expected pub- and 16 digits): ${publisherId}`);
  }
}

/**
 * Only `G…` accounts for now: the advance is paid in USDC through the SAC, and the
 * front end checks a USDC trustline on a `G…` account (#19). A `C…` borrower would
 * be a design change, not a format variation.
 */
export function assertStellarAccount(address: string): void {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new Error(`not a Stellar account address (G…): ${address}`);
  }
}

/**
 * The last `months` complete calendar months, as of `now`.
 *
 * Calendar months rather than "last 90 days" because AdSense finalises earnings by
 * month, and a month boundary gives every proof made in the same week the same
 * window, which a nullifier can key on.
 */
export function trailingMonths(now: Date, months = DEFAULT_TRAILING_MONTHS): RevenueWindow {
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error(`trailing months must be an integer from 1 to 12, got ${months}`);
  }
  const settled = new Date(now.getTime() - SETTLE_DAYS * 86_400_000);
  // Day 0 of the settled month is the last day of the month before it.
  const end = new Date(Date.UTC(settled.getUTCFullYear(), settled.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1), 1));
  return { start: toCivil(start), end: toCivil(end) };
}

function toCivil(d: Date): CivilDate {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The exact URL that goes into the signed claim. Query order is fixed so the same
 * inputs always produce the same bytes, and therefore the same claim parameters.
 */
export function buildRevenueUrl(publisherId: string, window: RevenueWindow): string {
  assertPublisherId(publisherId);
  const q = [
    "dateRange=CUSTOM",
    `startDate.year=${window.start.year}`,
    `startDate.month=${window.start.month}`,
    `startDate.day=${window.start.day}`,
    `endDate.year=${window.end.year}`,
    `endDate.month=${window.end.month}`,
    `endDate.day=${window.end.day}`,
    "metrics=ESTIMATED_EARNINGS",
    "currencyCode=USD",
    "reportingTimeZone=ACCOUNT_TIME_ZONE",
  ].join("&");
  return `${ADSENSE_API}/accounts/${publisherId}/reports:generate?${q}`;
}

/** `"startDate": { "year": 2026, "month": 7, "day": 1 }`, any whitespace. */
function dateRegex(field: "startDate" | "endDate", d: CivilDate): string {
  return `"${field}":\\s*\\{\\s*"year":\\s*${d.year},\\s*"month":\\s*${d.month},\\s*"day":\\s*${d.day}\\s*\\}`;
}

/** The header of the single metric column must be USD. */
export const CURRENCY_REGEX = `"currencyCode":\\s*"USD"`;

/**
 * `"totals": { "cells": [ { "value": "1234.56" } ] }`, capturing the figure.
 * With one metric and no dimensions, totals holds exactly one cell.
 */
export const TOTAL_REGEX = `"totals":\\s*\\{\\s*"cells":\\s*\\[\\s*\\{\\s*"value":\\s*"(?<revenueUsd>\\d+(?:\\.\\d+)?)"\\s*\\}\\s*\\]\\s*\\}`;

export function buildRevenueRequest(input: RevenueRequestInput): RevenueRequest {
  assertStellarAccount(input.stellarAddress);
  const url = buildRevenueUrl(input.publisherId, input.window);

  // Each match asserts one property of the response. Each redaction reveals exactly
  // the span its match needs, so the attestor sees these four fragments and nothing
  // else: not the account name, not the rows, not the averages.
  const reveal = [
    CURRENCY_REGEX,
    dateRegex("startDate", input.window.start),
    dateRegex("endDate", input.window.end),
    TOTAL_REGEX,
  ];
  return {
    url,
    options: {
      method: "GET",
      headers: { accept: "application/json" },
      context: { contextAddress: input.stellarAddress, contextMessage: CONTEXT_MESSAGE },
    },
    secretOptions: {
      responseMatches: reveal.map((value) => ({ type: "regex", value })),
      responseRedactions: reveal.map((regex) => ({ regex })),
    },
  };
}

/**
 * The only place the OAuth token touches the request: the secret headers, which
 * zkFetch sends inside the TLS session and leaves out of the claim.
 */
export function withAccessToken(request: RevenueRequest, accessToken: string) {
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
