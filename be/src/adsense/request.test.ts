/**
 * Forepay #4: the AdSense request is deterministic, its regexes read a real-shaped
 * AdSense response, and the OAuth token can only end up in the secret headers.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTEXT_MESSAGE,
  buildRevenueRequest,
  buildRevenueUrl,
  trailingMonths,
  withAccessToken,
  type RevenueWindow,
} from "./request.js";

const PUB = "pub-1234567890123456";
// A valid G… address with no secret behind it: the all-zero ed25519 key.
const ALICE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const Q3: RevenueWindow = { start: { year: 2026, month: 7, day: 1 }, end: { year: 2026, month: 9, day: 30 } };

/** Shaped like a real reports:generate response: one metric, no dimensions, pretty-printed. */
function adsenseResponse(o: { currency?: string; total?: string; window?: RevenueWindow } = {}) {
  const w = o.window ?? Q3;
  return JSON.stringify(
    {
      totalMatchedRows: "1",
      headers: [{ name: "ESTIMATED_EARNINGS", type: "METRIC_CURRENCY", currencyCode: o.currency ?? "USD" }],
      rows: [{ cells: [{ value: o.total ?? "1234.56" }] }],
      totals: { cells: [{ value: o.total ?? "1234.56" }] },
      averages: { cells: [{ value: "411.52" }] },
      startDate: w.start,
      endDate: w.end,
    },
    null,
    2,
  );
}

function matchesAll(body: string, window = Q3) {
  const req = buildRevenueRequest({ publisherId: PUB, stellarAddress: ALICE, window });
  let revenue: string | undefined;
  for (const m of req.secretOptions.responseMatches) {
    const hit = new RegExp(m.value).exec(body);
    if (!hit) return { ok: false as const };
    revenue ??= hit.groups?.revenueUsd;
  }
  return { ok: true as const, revenue };
}

test("the window is the last three complete calendar months", () => {
  assert.deepEqual(trailingMonths(new Date("2026-10-10T00:00:00Z")), Q3);
});

test("a month is not complete until it has settled everywhere", () => {
  // 1 October in UTC is still 30 September in UTC-12, and AdSense lags a day.
  assert.deepEqual(trailingMonths(new Date("2026-10-01T05:00:00Z")), {
    start: { year: 2026, month: 6, day: 1 },
    end: { year: 2026, month: 8, day: 31 },
  });
});

test("the window crosses a year boundary correctly", () => {
  assert.deepEqual(trailingMonths(new Date("2027-01-15T00:00:00Z")), {
    start: { year: 2026, month: 10, day: 1 },
    end: { year: 2026, month: 12, day: 31 },
  });
  assert.deepEqual(trailingMonths(new Date("2027-02-20T00:00:00Z"), 1), {
    start: { year: 2027, month: 1, day: 1 },
    end: { year: 2027, month: 1, day: 31 },
  });
});

test("a nonsensical window length is refused", () => {
  for (const n of [0, 13, 1.5, -1]) assert.throws(() => trailingMonths(new Date(), n), /1 to 12/);
});

test("the URL is byte-for-byte stable, because it is signed", () => {
  assert.equal(
    buildRevenueUrl(PUB, Q3),
    "https://adsense.googleapis.com/v2/accounts/pub-1234567890123456/reports:generate" +
      "?dateRange=CUSTOM&startDate.year=2026&startDate.month=7&startDate.day=1" +
      "&endDate.year=2026&endDate.month=9&endDate.day=30" +
      "&metrics=ESTIMATED_EARNINGS&currencyCode=USD&reportingTimeZone=ACCOUNT_TIME_ZONE",
  );
});

test("a malformed publisher id cannot reach the URL", () => {
  for (const bad of ["pub-123", "ca-pub-1234567890123456", "pub-1234567890123456/../x", ""]) {
    assert.throws(() => buildRevenueUrl(bad, Q3), /publisher id/);
  }
});

test("only a G… account can be bound", () => {
  for (const bad of [
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4", // contract address
    "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSU2", // secret seed (all-zero, throwaway)
    "0x0000000000000000000000000000000000000000",
    ALICE.slice(0, -1) + "A", // bad checksum
  ]) {
    assert.throws(
      () => buildRevenueRequest({ publisherId: PUB, stellarAddress: bad, window: Q3 }),
      /Stellar account/,
    );
  }
});

test("the borrower and the purpose are bound through the context", () => {
  const req = buildRevenueRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 });
  assert.deepEqual(req.options.context, { contextAddress: ALICE, contextMessage: CONTEXT_MESSAGE });
});

test("the regexes read the total from a real-shaped response, pretty or compact", () => {
  assert.deepEqual(matchesAll(adsenseResponse()), { ok: true, revenue: "1234.56" });
  assert.deepEqual(matchesAll(JSON.stringify(JSON.parse(adsenseResponse()))), { ok: true, revenue: "1234.56" });
  assert.deepEqual(matchesAll(adsenseResponse({ total: "0" })), { ok: true, revenue: "0" });
});

test("a response in another currency does not match", () => {
  assert.equal(matchesAll(adsenseResponse({ currency: "IDR" })).ok, false);
});

test("a response for a different window does not match", () => {
  const other = { start: { year: 2026, month: 6, day: 1 }, end: { year: 2026, month: 8, day: 31 } };
  assert.equal(matchesAll(adsenseResponse({ window: other })).ok, false);
});

test("a response without a numeric total does not match", () => {
  assert.equal(matchesAll(adsenseResponse({ total: "-5" })).ok, false);
  assert.equal(matchesAll(adsenseResponse({ total: "1e9" })).ok, false);
  assert.equal(matchesAll(adsenseResponse().replace('"totals"', '"nottotals"')).ok, false);
});

test("the regexes stay RE2-compatible: no lookarounds, no backreferences", () => {
  const req = buildRevenueRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 });
  for (const m of req.secretOptions.responseMatches) {
    assert.doesNotMatch(m.value, /\(\?(=|!|<=|<!)|\\[1-9]/);
  }
});

test("the OAuth token lands in the secret headers and nowhere else", () => {
  const token = "ya29.test-token-not-real";
  const req = withAccessToken(buildRevenueRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 }), token);
  assert.equal(req.secretOptions.headers.Authorization, `Bearer ${token}`);
  const { secretOptions, ...publicPart } = req;
  assert.equal(JSON.stringify(publicPart).includes(token), false);
  assert.equal(JSON.stringify({ ...secretOptions, headers: undefined }).includes(token), false);
  assert.throws(() => withAccessToken(req, ""), /access token/);
});
