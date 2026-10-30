/**
 * Forepay #95: the AdMob request is deterministic, its regexes read the bytes #93 got
 * from a real account, and the signed parameters carry the window before the publisher
 * id, which is the order the contract has to rebuild them in (#94).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalStringify } from "../reclaim/claim-digest.js";
import { ALICE, PUB, Q3, admobReport } from "../relay/fake-reclaim.js";
import { FIGURE, buildAdmobRequest, buildReportBody, buildReportUrl, microsToUsd, withAccessToken } from "./request.js";

function figureOf(raw: string): string | null {
  const req = buildAdmobRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 });
  let figure: string | null = null;
  for (const m of req.secretOptions.responseMatches) {
    const hit = new RegExp(m.value).exec(raw);
    if (!hit) return null;
    figure ??= hit.groups?.[FIGURE] ?? null;
  }
  return figure;
}

test("the body is the window, one metric and USD, in fixed bytes", () => {
  assert.equal(
    buildReportBody(Q3),
    '{"reportSpec":{"dateRange":{"startDate":{"year":2026,"month":7,"day":1},"endDate":{"year":2026,"month":9,"day":30}},' +
      '"metrics":["ESTIMATED_EARNINGS"],"localizationSettings":{"currencyCode":"USD"}}}',
  );
  // The body is valid JSON with no dimensions, so Google answers with one total row.
  const spec = JSON.parse(buildReportBody(Q3)) as { reportSpec: Record<string, unknown> };
  assert.deepEqual(Object.keys(spec.reportSpec), ["dateRange", "metrics", "localizationSettings"]);
});

test("the URL names the host and the account, nothing else", () => {
  assert.equal(buildReportUrl(PUB), `https://admob.googleapis.com/v1/accounts/${PUB}/networkReport:generate`);
  assert.throws(() => buildReportUrl("pub-123"), /publisher id/);
});

test("the regexes read the total from the bytes AdMob sends, \\r and all", () => {
  const raw = admobReport(Q3, "12345678");
  assert.ok(raw.includes("}\n,\r\n{"), "the fixture keeps #93's separator");
  assert.equal(figureOf(raw), "12345678");
});

test("at zero AdMob sends no row, and nothing matches", () => {
  assert.equal(figureOf(admobReport(Q3)), null);
});

test("another currency, or a per-dimension row, does not match", () => {
  assert.equal(figureOf(admobReport(Q3, "1000000").replace('"USD"', '"IDR"')), null);
  const byMonth = admobReport(Q3, "1000000").replace('"row": {\n', '"row": {\n    "dimensionValues": {"MONTH": {"value": "202609"}},\n');
  assert.equal(figureOf(byMonth), null);
});

test("the token goes into the secret headers only", () => {
  const req = buildAdmobRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 });
  const call = withAccessToken(req, "ya29.test-token");
  assert.deepEqual(call.secretOptions.headers, { Authorization: "Bearer ya29.test-token" });
  assert.ok(!JSON.stringify([call.url, call.options]).includes("ya29"));
});

test("in the signed parameters the six date numbers come before the publisher id (#94)", () => {
  // The attestor canonicalises the parameters with sorted keys, so `body` precedes `url`.
  // The contract interleaves its template with the values positionally: for AdMob the
  // order is [sy, sm, sd, ey, em, ed, pub_id], the reverse of AdSense's.
  const req = buildAdmobRequest({ publisherId: PUB, stellarAddress: ALICE, window: Q3 });
  const params = canonicalStringify({
    body: req.options.body,
    headers: { "User-Agent": "reclaim/0.0.1", ...req.options.headers },
    method: "POST",
    responseMatches: req.secretOptions.responseMatches,
    responseRedactions: req.secretOptions.responseRedactions,
    url: req.url,
  });
  const at = (needle: string, from: number) => {
    const i = params.indexOf(needle, from);
    assert.ok(i >= 0, `${needle} after ${from}`);
    return i + needle.length;
  };
  let pos = 0;
  for (const sep of ['{\\"year\\":2026', '\\"month\\":7', ',\\"day\\":1', '{\\"year\\":2026', '\\"month\\":9', ',\\"day\\":30', `/accounts/${PUB}`]) {
    pos = at(sep, pos);
  }
});

test("micros read as an exact USD decimal", () => {
  assert.equal(microsToUsd("12345678"), "12.345678");
  assert.equal(microsToUsd("250000"), "0.25");
  assert.equal(microsToUsd("5000000"), "5");
  assert.equal(microsToUsd("0"), "0");
  assert.throws(() => microsToUsd("1.5"), /micros/);
});
