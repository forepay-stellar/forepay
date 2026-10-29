"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toaster";
import { isSignatureDeclined } from "@/lib/errors";
import { formatUsd, formatWindow } from "@/lib/format";
import {
  preloadSignIn,
  proofRunning,
  proveRevenue,
  SOURCE_NAME,
  type ProveSession,
  type ProveStage,
  type RevenueSource,
} from "@/lib/reclaim";
import {
  TransactionFailedError,
  awaitAdvance,
  checkAdvance,
  getAdvance,
  sizing,
  nullifierFor,
  provenUsd,
  quote,
  requestAdvance,
  type AdvanceRequest,
} from "@/lib/stellar/contract";
import { TrustlineError, addUsdcTrustline } from "@/lib/stellar/trustline";
import { useUsdcStatus } from "@/modules/onboarding/hooks/useUsdcStatus";
import { useWallet } from "@/providers/WalletProvider";
import { AdvanceScreen, Centered } from "./components/AdvanceScreen";
import { FailurePanel, type FailureAction } from "./components/FailurePanel";
import { FundsReceived } from "./components/FundsReceived";
import { ProgressPanel } from "./components/ProgressPanel";
import { ProveRevenue } from "./components/ProveRevenue";
import { ReviewOffer } from "./components/ReviewOffer";
import { SignAdvance } from "./components/SignAdvance";
import { maxFee } from "./fee";
import { isCapped } from "./cap";
import { clearPending, loadPending, markRefused, onRefused, savePending, type PendingAdvance } from "./pending";
import { WalletSignError } from "@/lib/stellar/wallet-error";
import { acceptFailure, proofStillGood, proveFailure, type AdvanceFailure } from "./failures";

/** After this long without a confirmation, say so (board row 4, "Taking longer than usual"). */
const SLOW_AFTER_MS = 30_000;

/** Where 02 Prove and accept is. Which step of 2a to 2d is on screen is local state (ARCHITECTURE.md §4). */
type Flow =
  | { at: "start" }
  | { at: "proving"; stage: ProveStage }
  | { at: "checking"; req: AdvanceRequest }
  | { at: "offer"; req: AdvanceRequest }
  /** `fee` is the most the transaction can cost, in stroops of XLM, once it is built and in the wallet. */
  | { at: "signing"; req: AdvanceRequest; fee?: bigint; sent: boolean; slow: boolean }
  | { at: "received"; req: AdvanceRequest; hash: string; amount: bigint }
  /** `during` is the step it happened in: proving and checking, or accepting. */
  | { at: "failed"; failure: AdvanceFailure; req?: AdvanceRequest; during: "prove" | "accept" };

/** A signature given after the creator pressed Cancel. Thrown before anything is sent. */
class AbandonedError extends Error {}

const quoteKey = (address: string, revenueUsd: string) => ["quote", address, revenueUsd] as const;
const sizingKey = (address: string) => ["sizing", address] as const;

/**
 * "Reading your AdSense revenue", or AdMob's (#97). The words describe the relay (#17): about a minute,
 * more behind a queue, and the job id is kept for the tab, so other pages are safe and a closed tab loses
 * it (lib/reclaim/relay.ts). The mock (no relay) does not resume after leaving, which is acceptable for a
 * build without proofs.
 */
function ReadingRevenue({ source }: { source: RevenueSource }) {
  return (
    <ProgressPanel
      title={`Reading your ${SOURCE_NAME[source]} revenue`}
      body="This takes about a minute, longer when others are proving too. You can use other pages meanwhile. Closing this tab means proving again."
    />
  );
}

/**
 * 02 Prove and accept (#20): 2a Prove revenue, 2b Review offer, 2c Sign, 2d Receive, and every state on
 * the "Prove and accept / States and interactions" board.
 *
 * Proving goes through `lib/reclaim` (a mock until the #17 relay exists). Everything after it is real:
 * the offer is the contract's `quote`, the proof is checked by simulating `request_advance` before an
 * offer is shown, and accepting signs and sends `request_advance` itself.
 */
export function Advance() {
  const queryClient = useQueryClient();
  const { address, walletName, signTransaction } = useWallet();
  const usdc = useUsdcStatus(address);
  const wallet = walletName ?? "your wallet";

  const [flow, setFlow] = useState<Flow>({ at: "start" });
  // The source picked on 2a. A proof resumed from an earlier visit proves what it was started for.
  const [source, setSource] = useState<RevenueSource>("adsense");
  const [allowing, setAllowing] = useState(false);
  // Every attempt gets a number. An answer for an attempt that is no longer the current one (the
  // creator pressed Cancel, Not now or Back meanwhile) is dropped.
  const attempt = useRef(0);
  const session = useRef<ProveSession | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      attempt.current++;
      session.current?.abandon();
      clearTimeout(slowTimer.current);
    },
    [],
  );

  // Back on /advance with a `request_advance` still out from an earlier visit: wait on that one. Or with
  // a proof the relay is still making for this wallet: wait on that, without signing in again. Each
  // mount waits afresh; the unmount above drops the answer of the one before.
  useEffect(() => {
    if (!address) return;
    const pending = loadPending(address);
    const kept = proofRunning(address);
    if (pending) void pickUp(pending);
    else if (kept) void prove(kept);
    // `pickUp` and `prove` only read refs and setters; they run per mount and per wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Google's sign-in script, loaded while 2a is open, so "Prove my revenue" opens the popup inside the
  // press. Loaded only on the press, the popup opens after an await and browsers may block it.
  useEffect(() => {
    if (flow.at === "start" || flow.at === "failed") preloadSignIn();
  }, [flow.at]);

  // The offer on 2b and 2c. Read in `check` before 2b opens, so it is already here.
  const req = "req" in flow ? flow.req : undefined;
  const offer = useQuery({
    queryKey: quoteKey(address ?? "", req ? provenUsd(req) : ""),
    queryFn: () => quote(address as string, provenUsd(req as AdvanceRequest)),
    enabled: !!address && !!req && (flow.at === "offer" || flow.at === "signing"),
    // `quote` is a pure function of the revenue figure on chain: the same input always sizes the same.
    staleTime: Infinity,
  });

  // The contract's rate and cap (#63), for the breakdown and for whether the cap cut this advance.
  // Read while the proof is checked; if it cannot be read, 2b claims neither sentence about the cap.
  const terms = useQuery({
    queryKey: sizingKey(address ?? ""),
    queryFn: () => sizing(address as string),
    // From 2a on: its line on how an advance is set names the contract's rate and cap too.
    enabled: !!address,
    staleTime: Infinity,
  });
  const capped = terms.data && req ? isCapped(terms.data, provenUsd(req)) : null;

  // The advance as the contract stored it, for 2d. Keyed by its nullifier (ARCHITECTURE.md §4).
  const received = flow.at === "received" ? flow : undefined;
  const nullifier = useQuery({
    queryKey: ["nullifier", address, received?.req.source, received?.req.pubId, received?.req.windowStart, received?.req.windowEnd],
    queryFn: () => {
      const r = received!.req;
      return nullifierFor(address as string, r.pubId, r.windowStart, r.windowEnd, r.source);
    },
    enabled: !!address && !!received,
    staleTime: Infinity,
  });
  const stored = useQuery({
    queryKey: ["advance", nullifier.data],
    queryFn: () => getAdvance(address as string, nullifier.data as string),
    enabled: !!address && !!nullifier.data,
  });

  if (!address) return null;
  const me = address;

  function leave() {
    attempt.current++;
    session.current?.abandon();
    clearTimeout(slowTimer.current);
  }

  function toStart() {
    leave();
    // While an advance sent earlier is still being waited on, the start is that wait, not 2a.
    const pending = loadPending(me);
    if (pending) return void pickUp(pending);
    // Likewise a proof the relay may still be making (a poll that failed kept its id): wait on it, so
    // "Reading your revenue" on the start is always backed by a running session.
    const kept = proofRunning(me);
    if (kept) return void prove(kept);
    setFlow({ at: "start" });
  }

  function toOffer(r: AdvanceRequest) {
    leave();
    setFlow({ at: "offer", req: r });
  }

  /**
   * Prove `src`, the choice on 2a unless a kept job names its own. That becomes the choice, so Prove
   * again and Back after a resumed job stay on its source.
   */
  async function prove(src: RevenueSource = source) {
    leave();
    setSource(src);
    const id = attempt.current;
    setFlow({ at: "proving", stage: "waiting" });
    const s = proveRevenue(me, src, (stage) => {
      if (id === attempt.current) setFlow({ at: "proving", stage });
    });
    session.current = s;
    let r: AdvanceRequest;
    try {
      r = await s.result;
    } catch (e) {
      if (id === attempt.current) setFlow({ at: "failed", failure: proveFailure(e), during: "prove" });
      return;
    }
    if (id === attempt.current) await check(r, id);
  }

  /**
   * "Checking your proof": quote it and run `request_advance` as a simulation, side by side, before any
   * offer (review M10). The two do not depend on each other. When both fail, the quote's reason is the
   * one shown, as when they ran in turn: a figure too small to quote is said as such.
   */
  async function check(r: AdvanceRequest, id = attempt.current) {
    setFlow({ at: "checking", req: r });
    try {
      const [quoted, checked] = await Promise.allSettled([
        queryClient.fetchQuery({
          queryKey: quoteKey(me, provenUsd(r)),
          queryFn: () => quote(me, provenUsd(r)),
          staleTime: Infinity,
        }),
        checkAdvance(me, r),
      ]);
      if (quoted.status === "rejected") throw quoted.reason;
      if (checked.status === "rejected") throw checked.reason;
      // The rate and cap, so 2b opens with them. prefetchQuery never throws: if this fails, 2b leaves
      // the two rows out and claims neither sentence about the cap.
      await queryClient.prefetchQuery({ queryKey: sizingKey(me), queryFn: () => sizing(me), staleTime: Infinity });
      if (id === attempt.current) setFlow({ at: "offer", req: r });
    } catch (e) {
      if (id === attempt.current) setFlow({ at: "failed", failure: proveFailure(e, provenUsd(r)), req: r, during: "prove" });
    }
  }

  async function accept(r: AdvanceRequest) {
    // No clock check on the proof's age here: `requestAdvance` simulates before it asks the wallet, and the
    // contract refuses a proof over an hour old with 12 ("This proof expired"), so no signature is asked
    // for a stale proof (e2e "a proof that expires while the offer is open…").
    leave();
    const id = attempt.current;
    let signed = false;
    setFlow({ at: "signing", req: r, sent: false, slow: false });

    const sign = async (xdr: string) => {
      // The transaction is built and simulated: its fee is now known, and 2c shows it.
      const fee = maxFee(xdr);
      if (id === attempt.current) setFlow({ at: "signing", req: r, fee, sent: false, slow: false });
      let out: string;
      try {
        out = await signTransaction(xdr);
      } catch (e) {
        throw new WalletSignError(e);
      }
      if (id !== attempt.current) throw new AbandonedError();
      signed = true;
      setFlow({ at: "signing", req: r, fee, sent: true, slow: false });
      slowTimer.current = setTimeout(() => {
        if (id === attempt.current) setFlow({ at: "signing", req: r, fee, sent: true, slow: true });
      }, SLOW_AFTER_MS);
      return out;
    };

    // Once the network has it, the transaction is remembered: leaving the page no longer loses it.
    let sentHash: string | undefined;
    const remember = (hash: string) => {
      sentHash = hash;
      savePending({ address: me, hash, req: r });
    };
    try {
      const { hash, value } = await requestAdvance(me, r, sign, remember);
      if (id !== attempt.current) return;
      landed(r, hash, value);
    } catch (e) {
      if (id !== attempt.current) {
        // The creator left meanwhile. A send turned down before any ledger will never land, so the
        // screen they come back to says so at once rather than waiting two minutes for it.
        if (sentHash && e instanceof TransactionFailedError && !e.charged && !e.unconfirmed) markRefused(me, sentHash);
        return;
      }
      stopped(e, r, signed);
    }
  }

  /** The advance landed: 2d, and every screen reads the new money and the new advance again. */
  function landed(r: AdvanceRequest, hash: string, amount: bigint) {
    clearPending();
    clearTimeout(slowTimer.current);
    setFlow({ at: "received", req: r, hash, amount });
    void queryClient.invalidateQueries({ queryKey: ["advance"] });
    void queryClient.invalidateQueries({ queryKey: ["advances"] });
    void queryClient.invalidateQueries({ queryKey: ["repayment"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  /** Back to a transaction sent before the creator left the page: its refusal, or the wait for it. */
  function pickUp(p: PendingAdvance) {
    if (p.refused) refusedMeanwhile(p);
    else void resume(p);
  }

  /** "Sending your USDC" again, for a transaction sent before the creator left the page. */
  async function resume(p: PendingAdvance) {
    leave();
    const id = attempt.current;
    setFlow({ at: "signing", req: p.req, sent: true, slow: false });
    slowTimer.current = setTimeout(() => {
      if (id === attempt.current) setFlow({ at: "signing", req: p.req, sent: true, slow: true });
    }, SLOW_AFTER_MS);
    // The send itself may still be answering, to the screen that was left: a refusal ends this wait.
    const stopListening = onRefused(p.hash, () => {
      if (id === attempt.current) refusedMeanwhile(p);
    });
    try {
      const { hash, value } = await awaitAdvance(p.hash);
      if (id !== attempt.current) return;
      landed(p.req, hash, value);
    } catch (e) {
      if (id !== attempt.current) return;
      stopped(e, p.req, true);
    } finally {
      stopListening();
    }
  }

  /** The network turned down a send the creator left: nothing was charged, and Try again sends it. */
  function refusedMeanwhile(p: PendingAdvance) {
    leave();
    clearPending();
    const refused = new TransactionFailedError("The network did not accept the transaction", false);
    setFlow({ at: "failed", failure: acceptFailure(refused, true), req: p.req, during: "accept" });
  }

  /**
   * Waiting on a sent advance ended without it landing. If the network gave no answer at all, the
   * transaction is still out: it stays remembered, and Try again waits on it again. Otherwise the ledger
   * has answered (failed, or not confirmed after the full wait), and it is forgotten.
   */
  function stopped(e: unknown, r: AdvanceRequest, signed: boolean) {
    clearTimeout(slowTimer.current);
    if (e instanceof TransactionFailedError && e.noAnswer && loadPending(me)) {
      setFlow({ at: "failed", failure: { kind: "sentUnreachable" }, req: r, during: "accept" });
      return;
    }
    clearPending();
    setFlow({ at: "failed", failure: acceptFailure(e, signed), req: r, during: "accept" });
  }

  async function allowUsdc(r: AdvanceRequest | undefined) {
    setAllowing(true);
    try {
      await addUsdcTrustline(me, signTransaction);
      await usdc.refetch();
      notify("Your wallet can receive USDC");
      // The proof was not used, so the offer it gave still stands.
      if (r) await check(r, attempt.current);
      else toStart();
    } catch (e) {
      // Turning the signature down is a choice, not a failure: the panel stays as it was.
      if (e instanceof TrustlineError) {
        notify(e.outcome === "unconfirmed" ? "Your approval is not confirmed yet" : "USDC was not allowed", {
          success: false,
        });
      } else if (!isSignatureDeclined(e)) {
        notify("USDC was not allowed", { success: false });
      }
    } finally {
      setAllowing(false);
    }
  }

  function onFailureAction(
    action: FailureAction,
    failure: AdvanceFailure,
    r: AdvanceRequest | undefined,
    during: "prove" | "accept",
  ) {
    switch (action) {
      case "prove":
        return void prove();
      case "back":
        // Back is the offer only when the contract never refused the proof. A refusal (expired, used,
        // paused) goes back to 2a, where proving starts again.
        return r && during === "accept" && proofStillGood(failure) ? toOffer(r) : toStart();
      case "reviewOffer":
        return r ? toOffer(r) : toStart();
      case "retry":
        // Waiting on an advance already sent: wait on it again. Never sign or send a second one.
        if ("kind" in failure && failure.kind === "sentUnreachable") return toStart();
        if (!r) return void prove();
        if (during === "accept") return void accept(r);
        leave();
        return void check(r);
      case "allowUsdc":
        return void allowUsdc(r);
    }
  }

  const focusKey = [
    flow.at,
    flow.at === "proving" ? flow.stage : "",
    flow.at === "signing" ? `${flow.sent}${flow.slow}` : "",
    flow.at === "failed" ? JSON.stringify(flow.failure) : "",
  ].join(":");

  // ---- 2a Prove revenue, and the Reclaim session ----
  if (flow.at === "start") {
    // A transaction left waiting from an earlier visit is picked up by the effect above, after this
    // first render. Show it as sending from the start, so 2a and its "Prove my revenue" never flash.
    // Likewise a proof the relay is still making for this wallet: the effect waits on it.
    const kept = proofRunning(me);
    if (kept) {
      return (
        <AdvanceScreen title="Get an advance" step={0} focusKey="resuming-proof">
          <Centered>
            <ReadingRevenue source={kept} />
          </Centered>
        </AdvanceScreen>
      );
    }
    if (loadPending(me)) {
      return (
        <AdvanceScreen title="Approve the advance" step={2} focusKey="resuming">
          <Centered>
            <ProgressPanel
              title="Sending your USDC"
              body="Stellar is confirming the transaction. This takes a few seconds. Keep this page open."
            />
          </Centered>
        </AdvanceScreen>
      );
    }
    return (
      <AdvanceScreen title="Get an advance" step={0} focusKey={focusKey}>
        <ProveRevenue
          walletName={wallet}
          terms={terms.isPending ? "loading" : terms.data}
          usdc={usdc.isError ? "error" : usdc.data}
          source={source}
          onSource={setSource}
          onProve={() => void prove()}
        />
      </AdvanceScreen>
    );
  }

  if (flow.at === "proving" || flow.at === "checking") {
    return (
      <AdvanceScreen title="Get an advance" step={0} focusKey={focusKey}>
        <Centered>
          {flow.at === "checking" ? (
            <ProgressPanel
              title="Checking your proof"
              body={`Stellar is confirming that the revenue figure really came from ${SOURCE_NAME[flow.req.source ?? "adsense"]}.`}
            />
          ) : flow.stage === "waiting" ? (
            <ProgressPanel
              title="Sign in with Google in the new window"
              body={`Pick the Google account that owns your ${SOURCE_NAME[source]}, and allow Forepay to see your ${SOURCE_NAME[source]} reports. We only read your revenue for the last three months.`}
              action={
                <Button variant="outline" onClick={() => session.current?.reopen()}>
                  Open the window again
                </Button>
              }
            />
          ) : (
            <ReadingRevenue source={source} />
          )}
        </Centered>
      </AdvanceScreen>
    );
  }

  // ---- 2b Review offer ----
  if (flow.at === "offer") {
    const period = formatWindow(flow.req.windowStart, flow.req.windowEnd);
    // With the figure, so a quote under 1 USDC reads as "too small" with the creator's own number.
    const offerFailure = offer.isError ? proveFailure(offer.error, provenUsd(flow.req)) : null;
    return (
      <AdvanceScreen title="Your offer" step={1} focusKey={focusKey}>
        {offer.data !== undefined ? (
          <ReviewOffer
            revenue={formatUsd(provenUsd(flow.req))}
            sourceName={SOURCE_NAME[flow.req.source ?? "adsense"]}
            windowShort={period.short}
            windowLong={period.long}
            advance={offer.data}
            capped={capped}
            terms={terms.data}
            onAccept={() => accept(flow.req)}
            onNotNow={toStart}
          />
        ) : offerFailure ? (
          <Centered>
            <FailurePanel
              failure={offerFailure}
              walletName={wallet}
              beforeOffer
              allowing={allowing}
              terms={terms.data}
              sourceName={SOURCE_NAME[flow.req.source ?? "adsense"]}
              onAction={(action) => onFailureAction(action, offerFailure, flow.req, "prove")}
            />
          </Centered>
        ) : (
          <SkeletonBlock className="h-[360px] w-full rounded-hero" />
        )}
      </AdvanceScreen>
    );
  }

  // ---- 2c Sign ----
  if (flow.at === "signing") {
    return (
      <AdvanceScreen title="Approve the advance" step={2} focusKey={focusKey}>
        <Centered>
          {!flow.sent ? (
            <SignAdvance
              walletName={wallet}
              address={me}
              advance={offer.data}
              fee={flow.fee}
              onCancel={() => toOffer(flow.req)}
            />
          ) : flow.slow ? (
            <ProgressPanel
              title="Still waiting for Stellar"
              body="This sometimes takes a little longer. Do not close the page. We will show the receipt as soon as it lands."
            />
          ) : (
            <ProgressPanel
              title="Sending your USDC"
              body="Stellar is confirming the transaction. This takes a few seconds. Keep this page open."
            />
          )}
        </Centered>
      </AdvanceScreen>
    );
  }

  // ---- 2d Receive ----
  if (flow.at === "received") {
    return (
      <AdvanceScreen title="Advance received" step={4} focusKey={focusKey}>
        <Centered>
          <FundsReceived
            amount={flow.amount}
            hash={flow.hash}
            advance={stored.data ?? undefined}
            advanceFailed={nullifier.isError || stored.isError || (stored.isSuccess && !stored.data)}
          />
        </Centered>
      </AdvanceScreen>
    );
  }

  // ---- Every failure ----
  const tooSmall = "kind" in flow.failure && flow.failure.kind === "tooSmall";
  const [title, step] = tooSmall
    ? ["Your offer", 1]
    : flow.during === "accept"
      ? ["Approve the advance", 2]
      : ["Get an advance", 0];
  return (
    <AdvanceScreen title={title as string} step={step as number} focusKey={focusKey}>
      <Centered>
        <FailurePanel
          failure={flow.failure}
          walletName={wallet}
          beforeOffer={flow.during === "prove"}
          allowing={allowing}
          terms={terms.data}
          sourceName={SOURCE_NAME[flow.req?.source ?? "adsense"]}
          onAction={(action) => onFailureAction(action, flow.failure, flow.req, flow.during)}
        />
      </Centered>
    </AdvanceScreen>
  );
}
