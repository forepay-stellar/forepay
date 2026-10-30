# The AdMob revenue provider (#95)

How Forepay proves a creator's trailing AdMob revenue, as a sibling of
[the AdSense provider](adsense-provider.md). Read that first; this page covers only what is
different. Code: `be/src/admob/`. Run: `GOOGLE_ACCESS_TOKEN="$(wl-paste)" pnpm -C be prove:admob`,
or `POST /proofs` with `source: "admob"` ([api.md](api.md)).

The facts below come from #93: a zkFetch POST to a public echo (part 1), and AdMob's real responses,
at zero and above zero, read from two accounts (part 2).

---

## One request, a POST with the window in the body

```
POST https://admob.googleapis.com/v1/accounts/{pub-id}/networkReport:generate
content-type: application/json
Authorization: Bearer <OAuth token, scope admob.readonly>   ← secret header, not in the claim

{"reportSpec":{"dateRange":{"startDate":{"year":2026,"month":7,"day":1},"endDate":{"year":2026,"month":9,"day":30}},"metrics":["ESTIMATED_EARNINGS"],"localizationSettings":{"currencyCode":"USD"}}}
```

- **The body is signed.** The attestor puts it in `parameters.body`, byte for byte, and a claim
  with a different window recovers to a different signer (#93 part 1). So the body pins the
  window, the way the query string does for AdSense. `buildReportBody` writes it by hand, in a
  fixed key order with no whitespace, so the same window always gives the same bytes.
- **No dimensions.** The response then carries exactly one row: the window's total. Monthly rows
  are rounded separately, and their sum can differ from the total by a micro (#93).
- **Same window as AdSense:** the last three complete calendar months (`trailingMonths`).
- **The publisher id can be the same as the creator's AdSense id** (#93). The host in the signed
  URL is what says which product a claim is about.

## The response, as the attestor reads it

A pretty-printed JSON array. The elements use LF and two-space indents, and are separated by
`}\n,\r\n{` (with a CR):

```
[{
  "header": { … "localizationSettings": { "currencyCode": "USD" } }
}
,\r
{
  "row": { "metricValues": { "ESTIMATED_EARNINGS": { "microsValue": "12345678" } } }
}
,\r
{
  "footer": { "matchingRowCount": "1" }
}
]
```

At **zero there is no `row`**, and the footer is `{}`. This is the same situation as an AdSense
response with no `totals`, and it gets the same handling: the local check finds no match, and the
relay stops with `provider` before the attestor.

The two regexes (RE2) each stay within one element, so the separator never matters to them:

| Match | Reveals |
| --- | --- |
| `"localizationSettings": { "currencyCode": "USD" }` | the currency |
| `"row": { "metricValues": { "ESTIMATED_EARNINGS": { "microsValue": "(?<revenueMicros>\d+)" } } }` | the total |

A row that opens with `metricValues` has no `dimensionValues`, so the second match cannot be
satisfied by a per-dimension row.

The live check before proving runs on the **raw** response text. AdSense's check re-serialises the
JSON first; here that would drop the `\r`.

## The signed claim: what differs from AdSense

| Field | AdMob |
| --- | --- |
| `parameters.method` | `POST` |
| `parameters.body` | the report spec above: the window, one metric, USD |
| `parameters.headers` | `accept`, `content-type`, `User-Agent`, all public |
| `parameters.url` | host and publisher id only |
| `context.extractedParameters` | `{ "revenueMicros": "<integer>" }`, millionths of a USD |

Everything else is the same as for AdSense: the context message, the borrower in
`contextAddress`, the allow-list audit, and the credential scan.

## What the contract must check (#94)

- **Its own template per source.** The host is in the template, so an AdMob claim can never be
  checked against the AdSense template, or the reverse.
- **The value order.** The attestor sorts the parameters' keys, so `body` comes before `url`. In
  the signed bytes the six date numbers therefore come **before** the publisher id:
  `[sy, sm, sd, ey, em, ed, pub_id]`. AdSense's order is the reverse. `be/src/admob/request.test.ts`
  pins this order.
- **Micros to cents, truncating:** `revenueMicros / 10_000`, never rounded up.
- **A nullifier tagged with the source**, because the publisher id can be shared with AdSense.

## Open points

- **The first real proof.** The bytes above were read with curl. The first `prove:admob` run on a
  real account confirms them as signed. That proof is the input to the template (#96).
- **The OAuth client** asks only for `adsense.readonly` until #86 is through (#98). Until then, an
  AdMob token comes from the OAuth Playground.
