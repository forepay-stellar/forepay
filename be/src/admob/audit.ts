/**
 * Field-by-field audit of an AdMob revenue claim (#95). The audit itself is AdSense's
 * (`../adsense/audit.ts`): the same allow-list, the same credential scan, the same
 * signature check. This file only states what an AdMob claim must look like.
 */
import { PUBLIC_HEADERS, auditRevenueProof, type AuditExpectations, type AuditResult, type ClaimShape, type RevenueProof } from "../adsense/audit.js";
import type { RevenueWindow } from "../adsense/request.js";
import { FIGURE, buildAdmobRequest, microsToUsd } from "./request.js";

/** `content-type` is public here: the POST needs it, and it says only that the body is JSON. */
const ADMOB_PUBLIC_HEADERS: ReadonlySet<string> = new Set([...PUBLIC_HEADERS, "content-type"]);

const ADMOB_URL = /^https:\/\/admob\.googleapis\.com\/v1\/accounts\/(pub-\d{16})\/networkReport:generate$/;

export function admobShape(expect: Pick<AuditExpectations, "publisherId" | "stellarAddress" | "window">): ClaimShape {
  const req = buildAdmobRequest(expect);
  return {
    url: req.url,
    urlWhy: "Host and publisher id. The publisher id is public (it is in every app's ad unit ids) and cannot authenticate anyone.",
    method: "POST",
    body: req.options.body,
    bodyWhy: "The report spec: the window, one metric, USD. Signed, so the window cannot be swapped (#93).",
    responseMatches: req.secretOptions.responseMatches,
    responseRedactions: req.secretOptions.responseRedactions,
    matchesWhy: "What the response had to contain: USD and one total row; the window is fixed by the body. Patterns only, no response data.",
    publicHeaders: ADMOB_PUBLIC_HEADERS,
    figure: {
      name: FIGURE,
      format: /^\d+$/,
      why: "The figure being proven: estimated earnings over the window, in millionths of a USD. Disclosed on purpose.",
      toUsd: microsToUsd,
    },
  };
}

export function auditAdmobProof(proof: RevenueProof, expect: AuditExpectations): AuditResult {
  return auditRevenueProof(proof, expect, admobShape(expect));
}

/** Publisher id, window and borrower as written in an AdMob claim, or null if it is not one. */
export function admobExpectationsFromClaim(proof: RevenueProof) {
  const params = JSON.parse(proof.claimData.parameters) as { url?: string; body?: string };
  const m = ADMOB_URL.exec(String(params.url ?? ""));
  if (!m) return null;
  let spec: { reportSpec?: { dateRange?: { startDate?: unknown; endDate?: unknown } } };
  try {
    spec = JSON.parse(String(params.body ?? ""));
  } catch {
    return null;
  }
  const range = spec.reportSpec?.dateRange;
  if (!range?.startDate || !range.endDate) return null;
  const window = { start: range.startDate, end: range.endDate } as RevenueWindow;
  const context = JSON.parse(proof.claimData.context) as { contextAddress?: string };
  return { publisherId: m[1], window, stellarAddress: String(context.contextAddress ?? "") };
}
