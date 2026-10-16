"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toaster";
import { isSignatureDeclined } from "@/lib/errors";
import { formatUsd, formatWindow } from "@/lib/format";
import { proveRevenue, type ProveSession, type ProveStage } from "@/lib/reclaim";
import {
  checkAdvance,
  getAdvance,
  nullifierFor,
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
import { WalletSignError, acceptFailure, proofStillGood, proveFailure, type AdvanceFailure } from "./failures";

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

  // The offer on 2b and 2c. Read in `check` before 2b opens, so it is already here.
  const req = "req" in flow ? flow.req : undefined;
  const offer = useQuery({
    queryKey: quoteKey(address ?? "", req?.revenueUsd ?? ""),
    queryFn: () => quote(address as string, (req as AdvanceRequest).revenueUsd),
    enabled: !!address && !!req && (flow.at === "offer" || flow.at === "signing"),
    // `quote` is a pure function of the revenue figure on chain: the same input always sizes the same.
    staleTime: Infinity,
  });

  // The advance as the contract stored it, for 2d. Keyed by its nullifier (ARCHITECTURE.md §4).
  const received = flow.at === "received" ? flow : undefined;
  const nullifier = useQuery({
    queryKey: ["nullifier", address, received?.req.pubId, received?.req.windowStart, received?.req.windowEnd],
    queryFn: () => nullifierFor(address as string, received!.req.pubId, received!.req.windowStart, received!.req.windowEnd),
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
    setFlow({ at: "start" });
  }

  function toOffer(r: AdvanceRequest) {
    leave();
    setFlow({ at: "offer", req: r });
  }

  async function prove() {
    leave();
    const id = attempt.current;
    setFlow({ at: "proving", stage: "waiting" });
    const s = proveRevenue(me, (stage) => {
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

  /** "Checking your proof": quote it, then run `request_advance` as a simulation, before any offer. */
  async function check(r: AdvanceRequest, id = attempt.current) {
    setFlow({ at: "checking", req: r });
    try {
      await queryClient.fetchQuery({
        queryKey: quoteKey(me, r.revenueUsd),
        queryFn: () => quote(me, r.revenueUsd),
        staleTime: Infinity,
      });
      await checkAdvance(me, r);
      if (id === attempt.current) setFlow({ at: "offer", req: r });
    } catch (e) {
      if (id === attempt.current) setFlow({ at: "failed", failure: proveFailure(e, r.revenueUsd), req: r, during: "prove" });
    }
  }

  async function accept(r: AdvanceRequest) {
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

    try {
      const { hash, value } = await requestAdvance(me, r, sign);
      if (id !== attempt.current) return;
      clearTimeout(slowTimer.current);
      setFlow({ at: "received", req: r, hash, amount: value });
      // New money and a new advance: let every screen read them again from chain.
      void queryClient.invalidateQueries({ queryKey: ["advance"] });
      void queryClient.invalidateQueries({ queryKey: ["advances"] });
      void queryClient.invalidateQueries({ queryKey: ["repayment"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (e) {
      if (id !== attempt.current) return;
      clearTimeout(slowTimer.current);
      setFlow({ at: "failed", failure: acceptFailure(e, signed), req: r, during: "accept" });
    }
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
    return (
      <AdvanceScreen title="Get an advance" step={0} focusKey={focusKey}>
        <ProveRevenue
          walletName={wallet}
          usdc={usdc.isError ? "error" : usdc.data}
          onProve={prove}
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
              body="Stellar is confirming that the revenue figure really came from AdSense."
            />
          ) : flow.stage === "waiting" ? (
            <ProgressPanel
              title="Log in to AdSense in the new window"
              body="We only read your revenue for the last three months. Your password never reaches us."
              action={
                <Button variant="outline" onClick={() => session.current?.reopen()}>
                  Open the window again
                </Button>
              }
            />
          ) : (
            <ProgressPanel title="Reading your revenue" body="This takes a few seconds. Keep this page open." />
          )}
        </Centered>
      </AdvanceScreen>
    );
  }

  // ---- 2b Review offer ----
  if (flow.at === "offer") {
    const period = formatWindow(flow.req.windowStart, flow.req.windowEnd);
    return (
      <AdvanceScreen title="Your offer" step={1} focusKey={focusKey}>
        {offer.data !== undefined ? (
          <ReviewOffer
            revenue={formatUsd(flow.req.revenueUsd)}
            windowShort={period.short}
            windowLong={period.long}
            advance={offer.data}
            onAccept={() => accept(flow.req)}
            onNotNow={toStart}
          />
        ) : offer.isError ? (
          <Centered>
            <FailurePanel
              failure={proveFailure(offer.error)}
              walletName={wallet}
              beforeOffer
              allowing={allowing}
              onAction={(action) => onFailureAction(action, proveFailure(offer.error), flow.req, "prove")}
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
          onAction={(action) => onFailureAction(action, flow.failure, flow.req, flow.during)}
        />
      </Centered>
    </AdvanceScreen>
  );
}
