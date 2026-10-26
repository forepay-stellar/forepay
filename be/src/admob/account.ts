/**
 * The checks that run before an AdMob proof is attempted (#95): which AdMob account the
 * token reads, and whether the live report has the shape the provider's regexes expect.
 * The sibling of `../adsense/account.ts`, with the same `ProveError` codes.
 *
 * There is no READY check: an AdMob account has no approval state in the API. An
 * account with no revenue in the window is found by the live check instead, because
 * Google then sends no `row` (#93).
 */
import { ProveError } from "../adsense/account.js";
import { assertPublisherId } from "../adsense/request.js";
import { ADMOB_API, ADMOB_SCOPE, type AdmobRequest } from "./request.js";

/** One AdMob API call. Returns the response text unparsed: the regexes run on raw bytes. */
export type AdmobFetch = (url: string, accessToken: string, body?: string) => Promise<string>;

/** GET, or POST a JSON body, with the token. Errors never carry the token. */
export const admobFetch: AdmobFetch = async (url, accessToken, body) => {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (res.ok) return text;
  if (res.status === 401) {
    throw new ProveError("token", `Google refused the access token (401). It is missing, expired (they last an hour) or lacks ${ADMOB_SCOPE}.`);
  }
  if (res.status === 403) {
    throw new ProveError(
      "account",
      `Google answered 403 for ${url}: the token lacks ${ADMOB_SCOPE}, the account has no AdMob access, or the AdMob API is not enabled for the OAuth client.`,
    );
  }
  throw new ProveError("prove", `AdMob API returned ${res.status} for ${url}: ${text.slice(0, 300)}`);
};

/** The configured publisher id, or the only AdMob account the token can read. */
export async function resolveAdmobPublisherId(fetchAdmob: AdmobFetch, accessToken: string, configured = ""): Promise<string> {
  if (configured) {
    assertPublisherId(configured);
    return configured;
  }
  const body = JSON.parse(await fetchAdmob(`${ADMOB_API}/accounts`, accessToken)) as { account?: { publisherId: string }[] };
  const ids = (body.account ?? []).map((a) => a.publisherId);
  if (ids.length === 1) return ids[0];
  throw new ProveError(
    "account",
    ids.length === 0
      ? "This Google account has no AdMob account."
      : `This Google account can read ${ids.length} AdMob accounts (${ids.join(", ")}); choose one.`,
  );
}

/**
 * Run the provider's regexes against the live report, on the raw response text, which
 * is what the attestor sees. Unlike AdSense, nothing is re-serialised first: AdMob's
 * separators carry a `\r` (#93) that a JSON round trip would lose.
 */
export async function checkLiveReport(fetchAdmob: AdmobFetch, accessToken: string, request: AdmobRequest): Promise<void> {
  const raw = await fetchAdmob(request.url, accessToken, request.options.body);
  for (const m of request.secretOptions.responseMatches) {
    if (new RegExp(m.value).test(raw)) continue;
    const zero = !raw.includes('"row"');
    throw new ProveError(
      "provider",
      zero
        ? "AdMob reports no earnings for this window: the report has no row, which is how AdMob says zero."
        : `the live AdMob response does not match ${m.value}\nResponse keys: ${elementKeys(raw)}`,
    );
  }
}

/** The top-level key of each element of the streamed array, never a value. */
function elementKeys(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((e) => Object.keys(e as object).join("+")).join(", ");
  } catch {
    // fall through
  }
  return "not a JSON array";
}
