/**
 * One AdSense revenue proof, from an access token to the arguments `request_advance`
 * takes (#17). The relay runs this per request; `prove:adsense` runs it once.
 *
 * Why the proof is made here and not in the creator's browser: zkFetch with the
 * snarkjs engine (the one Reclaim's attestor accepts, see #5) needs ~330 MB of circuit
 * files and takes about ten minutes of CPU. Neither belongs in a browser tab.
 *
 * Where the binding comes from (#9, #17): the borrower's `G…` goes into
 * `context.contextAddress` before zkFetch runs, so it is inside the bytes the attestor
 * signs. The relay never attaches it afterwards, and the audit refuses a proof whose
 * signed context names anyone else.
 *
 * The access token is used for the pre-flight reads and inside zkFetch's secret
 * headers, and nowhere else. It is not stored, logged or returned; the audit fails a
 * proof that contains it.
 */
import { auditRevenueProof, type AuditResult, type RevenueProof } from "../adsense/audit.js";
import { ProveError, assertAccountReady, checkLiveResponse, resolvePublisherId, type GoogleGet } from "../adsense/account.js";
import {
  DEFAULT_TRAILING_MONTHS,
  assertStellarAccount,
  buildRevenueRequest,
  trailingMonths,
  withAccessToken,
  type CivilDate,
  type RevenueWindow,
} from "../adsense/request.js";
import { prepareVerification } from "../reclaim/claim-digest.js";

/** `ReclaimClient.zkFetch`, bound to an engine. Returns the proof or nothing. */
export type ZkFetch = (
  url: string,
  options: ReturnType<typeof withAccessToken>["options"],
  secretOptions: ReturnType<typeof withAccessToken>["secretOptions"],
) => Promise<unknown>;

export interface ProveDeps {
  google: GoogleGet;
  zkFetch: ZkFetch;
  now?: () => Date;
  months?: number;
  /** Expected signer. Defaults to the production attestor; tests pass a throwaway key. */
  attestor?: string;
}

export interface ProveInput {
  borrower: string;
  accessToken: string;
  /** Optional; the only account the token can read when empty. */
  publisherId?: string;
}

/** `checking`: the pre-flight reads. `proving`: zkFetch, minutes. `auditing`: local, instant. */
export type ProveStep = "checking" | "proving" | "auditing";

export interface Proven {
  proof: RevenueProof;
  publisherId: string;
  window: RevenueWindow;
  audit: AuditResult;
}

/** A proof made less than this long ago is accepted by the audit; the contract allows 1 h. */
const MAX_AGE_S = 3600;

export async function proveRevenue(deps: ProveDeps, input: ProveInput, onStep: (s: ProveStep) => void = () => {}): Promise<Proven> {
  assertStellarAccount(input.borrower);
  if (!input.accessToken) throw new ProveError("token", "an access token is required");
  const { google } = deps;

  onStep("checking");
  const publisherId = await resolvePublisherId(google, input.accessToken, input.publisherId);
  await assertAccountReady(google, input.accessToken, publisherId);
  const window = trailingMonths((deps.now ?? (() => new Date()))(), deps.months ?? DEFAULT_TRAILING_MONTHS);
  const request = buildRevenueRequest({ publisherId, stellarAddress: input.borrower, window });
  await checkLiveResponse(google, input.accessToken, request);

  onStep("proving");
  const call = withAccessToken(request, input.accessToken);
  let proof: RevenueProof | undefined;
  try {
    proof = (await deps.zkFetch(call.url, call.options, call.secretOptions)) as RevenueProof | undefined;
  } catch (e) {
    throw new ProveError("prove", `zkFetch failed: ${(e as Error).message}`);
  }
  if (!proof) throw new ProveError("prove", "zkFetch returned no proof");

  onStep("auditing");
  let audit: AuditResult;
  try {
    audit = auditRevenueProof(proof, {
      publisherId,
      stellarAddress: input.borrower,
      window,
      accessToken: input.accessToken,
      now: deps.now?.(),
      maxAgeS: MAX_AGE_S,
      attestor: deps.attestor,
    });
  } catch (e) {
    throw new ProveError("audit", (e as Error).message);
  }
  return { proof, publisherId, window, audit };
}

/**
 * `request_advance`'s arguments after the borrower's own, as the front end's
 * `AdvanceRequest` takes them. `timestampS` and `epoch` are u64 on chain, so they are
 * decimal strings here: JSON numbers lose precision past 2^53.
 */
export interface AdvanceRequestJson {
  revenueUsd: string;
  pubId: string;
  windowStart: string;
  windowEnd: string;
  timestampS: string;
  epoch: string;
  /** 64 bytes, hex, no 0x. */
  signature: string;
  recoveryId: number;
}

export function isoDate(d: CivilDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export function toAdvanceRequest({ proof, publisherId, window, audit }: Proven): AdvanceRequestJson {
  const c = proof.claimData;
  if (proof.signatures.length !== 1) throw new ProveError("audit", "expected exactly one attestor signature");
  // Rebuilds the identifier from the claim info: a claim info that is not what was
  // signed is refused here rather than handed to the contract.
  const v = prepareVerification(
    { provider: c.provider, parameters: c.parameters, context: c.context },
    { identifier: c.identifier, owner: c.owner, timestampS: c.timestampS, epoch: c.epoch },
    proof.signatures[0],
  );
  return {
    revenueUsd: audit.revenueUsd,
    pubId: publisherId,
    windowStart: isoDate(window.start),
    windowEnd: isoDate(window.end),
    timestampS: String(c.timestampS),
    epoch: String(c.epoch),
    signature: v.sig64.toString("hex"),
    recoveryId: v.recoveryId,
  };
}
