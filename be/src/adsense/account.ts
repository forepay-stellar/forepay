/**
 * The checks that run before a proof is attempted (#4, #17): which AdSense account the
 * token reads, whether Google will report for it, and whether the live response has
 * the shape the provider's regexes expect.
 *
 * Shared by `prove:adsense` and the relay. Each failure is a `ProveError` whose code
 * says whose move it is (the creator's token, the creator's account, or ours), so the
 * relay can tell the front end something a creator can act on.
 *
 * Proving takes minutes; each of these takes well under a second. A token that expired
 * or an account Google will not report for is found here, not after the attestor.
 */
import { ADSENSE_API, ADSENSE_SCOPE, assertPublisherId, type RevenueRequest } from "./request.js";

export type ProveErrorCode =
  /** The token is missing, expired or lacks adsense.readonly. Sign in again. */
  | "token"
  /** The Google account has no AdSense account, several, or one that is not READY. */
  | "account"
  /** AdSense answered with a shape the provider does not match. Ours to fix. */
  | "provider"
  /** The attestor or zkFetch failed. Worth retrying. */
  | "prove"
  /** The proof came back but failed the audit. Ours to fix; nothing was returned. */
  | "audit";

export class ProveError extends Error {
  constructor(
    readonly code: ProveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProveError";
  }
}

export type GoogleGet = (url: string, accessToken: string) => Promise<unknown>;

/** GET an AdSense API URL with the token. Errors never carry the token. */
export const googleGet: GoogleGet = async (url, accessToken) => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (res.ok) return JSON.parse(text);
  const where = url.split("?")[0];
  if (res.status === 401) {
    throw new ProveError("token", `Google refused the access token (401). It is missing, expired (they last an hour) or lacks ${ADSENSE_SCOPE}.`);
  }
  if (res.status === 403) {
    throw new ProveError(
      "account",
      `Google answered 403 for ${where}: the account has no AdSense access, or the AdSense Management API is not enabled for the OAuth client.`,
    );
  }
  throw new ProveError("prove", `AdSense API returned ${res.status} for ${where}: ${text.slice(0, 300)}`);
};

/** The configured publisher id, or the only one the token can read. */
export async function resolvePublisherId(get: GoogleGet, accessToken: string, configured = ""): Promise<string> {
  if (configured) {
    assertPublisherId(configured);
    return configured;
  }
  const body = (await get(`${ADSENSE_API}/accounts`, accessToken)) as { accounts?: { name: string }[] };
  const ids = (body.accounts ?? []).map((a) => a.name.replace(/^accounts\//, ""));
  if (ids.length === 1) return ids[0];
  throw new ProveError(
    "account",
    ids.length === 0
      ? "This Google account has no AdSense account."
      : `This Google account can read ${ids.length} AdSense accounts (${ids.join(", ")}); choose one.`,
  );
}

/**
 * Refuse an account that cannot report. AdSense answers reports:generate with a bare
 * 403 "The caller does not have permission" for an account that is CLOSED or was never
 * approved, which reads like a token problem and is not one. accounts.get says why.
 */
export async function assertAccountReady(get: GoogleGet, accessToken: string, publisherId: string): Promise<void> {
  const acct = (await get(`${ADSENSE_API}/accounts/${publisherId}`, accessToken)) as { state?: string; pendingTasks?: string[] };
  if (acct.state === "READY") return;
  const pending = acct.pendingTasks?.length ? ` Pending tasks: ${acct.pendingTasks.join(", ")}.` : "";
  throw new ProveError(
    "account",
    `AdSense account ${publisherId} is ${acct.state ?? "in an unknown state"}, not READY.${pending} Google does not serve reports for it.`,
  );
}

/** The JSON's structure with every leaf value replaced by its type, for diagnostics. */
export function shapeOf(v: unknown): unknown {
  if (Array.isArray(v)) return v.slice(0, 1).map(shapeOf);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shapeOf(x)]));
  }
  return typeof v;
}

/**
 * Run the provider's regexes against the live report, locally. A mismatch shows up here
 * in a second, with the response's structure (keys only, never values), instead of as
 * an opaque attestor failure minutes later.
 */
export async function checkLiveResponse(get: GoogleGet, accessToken: string, request: RevenueRequest): Promise<void> {
  const live = await get(request.url, accessToken);
  const pretty = JSON.stringify(live, null, 2);
  for (const m of request.secretOptions.responseMatches) {
    if (!new RegExp(m.value).test(pretty)) {
      throw new ProveError(
        "provider",
        `the live response does not match ${m.value}\nResponse structure (values hidden):\n${JSON.stringify(shapeOf(live), null, 2)}`,
      );
    }
  }
}
