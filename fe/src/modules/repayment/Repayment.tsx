"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LedgerNote } from "@/components/elements/LedgerNote";
import { LedgerRow } from "@/components/elements/LedgerRow";
import { CannotRead, LoadingLedger, NoAdvance, SkeletonCard } from "@/components/elements/LedgerStates";
import { notify } from "@/components/ui/Toaster";
import {
  repaymentKey,
  transactionsKey,
  usdcBalanceKey,
  useAdvances,
  useTransactions,
  useUsdcBalance,
} from "@/lib/api/queries";
import type { AdvanceSummary, LedgerTransaction } from "@/lib/api/types";
import { isSignatureDeclined, type FailureCopy } from "@/lib/errors";
import { formatUsdc } from "@/lib/format";
import { latestRows, outstanding, percentRepaid, pickAdvance, type Row } from "@/lib/ledger";
import { TransactionFailedError, awaitRepay, repay, sizing } from "@/lib/stellar/contract";
import { explorerAccountUrl, explorerContractUrl, explorerTxUrl } from "@/lib/stellar/network";
import { useWallet } from "@/providers/WalletProvider";
import { AdvanceDetails } from "./components/AdvanceDetails";
import { ApproveRepayment } from "./components/ApproveRepayment";
import { BalanceCard } from "./components/BalanceCard";
import { QuickActions } from "./components/QuickActions";
import { RepayForm } from "./components/RepayForm";
import { repayFailureCopy } from "./failures";
import { clearInflight, markLanded, releaseSender, setInflight, useInflight, type Inflight } from "./inflight";
import { WalletSignError } from "@/lib/stellar/wallet-error";
import { amountInputString, checkAmount, chipAmount, sanitizeAmountInput, type Chip } from "./model";

/**
 * 3a Repayment (issue #21): what is left to repay, what has been repaid, and the transactions behind
 * it. Every figure is read from the API (#16) through React Query. A repayment is signed in the wallet,
 * and once Stellar confirms it the queries are refetched, never edited by hand: the balance on screen is
 * always the ledger's, not what this page thinks it sent.
 *
 * Renders page content only. The AppShell (top nav, mobile header, tab bar) wraps it (#20).
 */
export function Repayment() {
  const { address } = useWallet();
  if (!address) return null;
  return <RepaymentScreen address={address} />;
}

function Header() {
  return (
    <header className="flex w-full items-end justify-between">
      <div className="flex flex-col gap-1.5">
        <p className="hidden text-[15px] text-brand lg:block">Welcome back</p>
        <h1 className="text-[30px] font-semibold tracking-[-0.9px] text-fg lg:text-[40px] lg:tracking-[-1.2px]">Repayment</h1>
      </div>
      <a
        href={explorerContractUrl()}
        target="_blank"
        rel="noreferrer"
        className="hidden items-center gap-2 rounded-pill bg-surface px-5 py-3 text-[14px] font-medium text-fg outline outline-1 -outline-offset-[0.5px] outline-line-strong hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand lg:flex"
      >
        <ArrowUpRight className="size-4" aria-hidden />
        View contract
      </a>
    </header>
  );
}

/** How often the API is read again while a confirmed repayment is not in it yet: from 2 s, doubling to 15 s. */
const CATCH_UP_MS = 2_000;
const CATCH_UP_MAX_MS = 15_000;
/** After this long behind the ledger, the API is let be: the form opens again, the row stays pending. */
const CATCH_UP_LIMIT_MS = 120_000;
/** How long to rest before asking Stellar again about a repayment it has not confirmed. */
const REWATCH_MS = 5_000;
/** A repayment the ledger says is past its time limit and not there: it never went out, so nothing was charged. */
const neverLanded: FailureCopy = {
  title: "The repayment did not go through",
  body: "Nothing was charged. Try again in a moment.",
};

/**
 * Said while Stellar gives no answer about a repayment already sent. It may have landed, so this never
 * says nothing was charged, and the repayment stays held and watched.
 */
const cannotReach: FailureCopy = {
  title: "We could not reach Stellar",
  body: "Your repayment was sent. We keep checking, and the balance updates here once it lands.",
};

/** Said while the API is more than CATCH_UP_LIMIT_MS behind a repayment Stellar has confirmed. */
const catchingUp: FailureCopy = {
  title: "Your repayment is confirmed on Stellar",
  body: "The figures here update once our records catch up.",
};

/** "Not confirmed yet" or no answer at all: the repayment may still land, so it is watched on. */
const stillOpen = (e: unknown) => e instanceof TransactionFailedError && (e.unconfirmed || e.noAnswer);

function RepaymentScreen({ address }: { address: string }) {
  const advances = useAdvances(address);
  const transactions = useTransactions(address);
  const queryClient = useQueryClient();
  const { walletName } = useWallet();
  const inflight = useInflight(address);
  // How a repayment watched here ended, when that was a failure, for the form to say.
  const [watchFailure, setWatchFailure] = useState<FailureCopy | null>(null);

  // Watch the repayment in flight until Stellar confirms it, from whichever visit to this page is open:
  // the one that sent it, or a later one after leaving, a reload, or a failed read in between.
  // Not while the screen that sent it is still waiting on it itself (`sender`): one watch per hash.
  const watching = inflight && !inflight.landed && !inflight.sender ? inflight : null;
  useEffect(() => {
    if (!watching) return;
    let alive = true;
    void (async () => {
      while (alive) {
        try {
          await awaitRepay(watching.hash);
          if (!alive) return;
          setWatchFailure(null);
          if (markLanded(watching.hash)) notify(`${formatUsdc(watching.amount)} repaid`);
          return;
        } catch (e) {
          if (!alive) return;
          if (stillOpen(e)) {
            const err = e as TransactionFailedError;
            // "Never" is the ledger's word alone: it answered "not found" from a ledger that closed after
            // the transaction's time limit, so no ledger can take it now (review: B3 held forever). A
            // node that does not answer says nothing either way: held and watched, never "nothing
            // was charged". The browser's clock is not asked; it may be off.
            if (!err.noAnswer && err.ledgerTime !== undefined && watching.validUntil !== undefined) {
              if (err.ledgerTime > watching.validUntil) {
                clearInflight(watching.hash);
                setWatchFailure(neverLanded);
                void queryClient.invalidateQueries({ queryKey: usdcBalanceKey(address) });
                return;
              }
            }
            setWatchFailure(err.noAnswer ? cannotReach : null);
            await new Promise((r) => setTimeout(r, REWATCH_MS));
            continue;
          }
          clearInflight(watching.hash);
          setWatchFailure(repayFailureCopy(e, true, walletName));
          void queryClient.invalidateQueries({ queryKey: usdcBalanceKey(address) });
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
    // The watch is per transaction: the hash and whether it landed are what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching?.hash]);

  // Confirmed on the ledger: read the API again, less and less often, until its indexer reports the
  // transaction, then let go.
  const landedHash = inflight?.landed ? inflight.hash : null;
  const reported = !!landedHash && !!transactions.data?.some((t) => t.hash === landedHash);
  useEffect(() => {
    if (!landedHash) return;
    if (reported) {
      clearInflight(landedHash);
      return;
    }
    let delay = CATCH_UP_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: repaymentKey(address) }),
        queryClient.invalidateQueries({ queryKey: transactionsKey(address) }),
        queryClient.invalidateQueries({ queryKey: usdcBalanceKey(address) }),
      ]);
      timer = setTimeout(run, delay);
      delay = Math.min(delay * 2, CATCH_UP_MAX_MS);
    };
    run();
    return () => clearTimeout(timer);
  }, [landedHash, reported, address, queryClient]);

  // Two minutes behind the ledger, the API no longer holds the form: the creator may repay again. The
  // row stays pending, and a note says why the figures have not moved.
  const landedAt = inflight?.landed ? inflight.landedAt : undefined;
  // The clock this compares against moves only when the two minutes are up, by a timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (landedAt === undefined) return;
    const left = landedAt + CATCH_UP_LIMIT_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), left);
    return () => clearTimeout(timer);
  }, [landedAt]);
  const lagging = landedAt !== undefined && Math.max(now, landedAt) >= landedAt + CATCH_UP_LIMIT_MS;

  let body: React.ReactNode;
  if (advances.isError || transactions.isError) {
    // Old figures are never shown once a read fails, even if an earlier read is still cached.
    body = (
      <div className="flex w-full justify-center pt-4">
        <CannotRead
          retrying={advances.isFetching || transactions.isFetching}
          onRetry={() => {
            void advances.refetch();
            void transactions.refetch();
          }}
        />
      </div>
    );
  } else if (advances.isPending || transactions.isPending) {
    body = (
      <LoadingLedger>
        <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
          <SkeletonCard className="lg:flex-1" />
          <SkeletonCard rows={2} className="hidden lg:flex lg:w-[440px]" />
        </div>
      </LoadingLedger>
    );
  } else {
    const picked = pickAdvance(advances.data);
    body = picked ? (
      <Ledger
        address={address}
        advance={picked.advance}
        number={picked.number}
        transactions={transactions.data}
        inflight={inflight}
        holding={inflight !== null && !(lagging && inflight.landed)}
        note={lagging && inflight?.landed ? catchingUp : null}
        watchFailure={watchFailure}
        onFailureSeen={() => setWatchFailure(null)}
      />
    ) : (
      <div className="flex w-full justify-center pt-4">
        <NoAdvance />
      </div>
    );
  }

  return (
    // 28 under the top nav on desktop (SjFTD, Z7FXmJ); the shell leaves that gap to each page.
    <div className="flex w-full flex-col gap-4 lg:gap-7 lg:pt-7">
      <Header />
      {body}
    </div>
  );
}

/**
 * Where a repayment started here is: Stellar checks it (`preparing`), the wallet window is open
 * (`signing`), it was sent and Stellar has not answered yet (`pending`). Only one runs at a time, and
 * one already in flight (`Inflight`) holds the form too.
 */
type Phase = "idle" | "preparing" | "signing" | "pending";

function Ledger({
  address,
  advance,
  number,
  transactions,
  inflight,
  holding,
  note,
  watchFailure,
  onFailureSeen,
}: {
  address: string;
  advance: AdvanceSummary;
  number: number;
  transactions: LedgerTransaction[];
  inflight: Inflight | null;
  /** The repayment in flight still holds the form (it is not yet two minutes past landing). */
  holding: boolean;
  note: FailureCopy | null;
  watchFailure: FailureCopy | null;
  onFailureSeen: () => void;
}) {
  const { walletName, signTransaction } = useWallet();
  const queryClient = useQueryClient();
  const balance = useUsdcBalance(address);
  // The contract's rate and cap, for "How it was sized" (shared with 02 Prove and accept's cache).
  const terms = useQuery({ queryKey: ["sizing", address], queryFn: () => sizing(address), staleTime: Infinity });

  const [input, setInput] = useState("");
  const [chip, setChip] = useState<Chip | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [signing, setSigning] = useState(0n);
  // What this screen said when a repayment it sent stopped, and which transaction that was about.
  const [own, setOwn] = useState<{ copy: FailureCopy; hash: string | null } | null>(null);
  const setFailure = (copy: FailureCopy | null, hash: string | null = null) => setOwn(copy ? { copy, hash } : null);
  // Once that transaction has landed after all (in flight and confirmed, or already in the API), what
  // was said about it ("not confirmed yet") no longer stands.
  const landedAfterAll =
    !!own?.hash &&
    (inflight?.hash === own.hash ? inflight.landed : transactions.some((t) => t.hash === own.hash));
  const ownFailure = own && !landedAfterAll ? own.copy : null;
  // How the watch ended is newer than what this screen said when its own wait stopped ("not confirmed
  // yet"), so it wins. Typing or repaying again clears both.
  const failure = watchFailure ?? ownFailure;
  // "Cancel" closes the dialog, but the wallet window is not ours to close. The repayment is still
  // followed: if the creator approves it after all, it shows as pending and lands like any other.
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const left = outstanding(advance);
  const walletUsdc = balance.isSuccess ? balance.data : undefined;
  const check = checkAmount(input, left, walletUsdc);
  // A repayment in flight holds the form until the API shows it, whoever sent it.
  const locked = phase !== "idle" || holding;
  const busyLabel =
    phase === "preparing"
      ? "Checking with Stellar"
      : phase === "signing"
        ? dialogOpen
          ? null
          : "Waiting for your wallet"
        : phase === "pending" || holding
          ? "Waiting for Stellar"
          : null;

  function fill(value: bigint, picked: Chip | null) {
    setInput(amountInputString(value));
    setChip(picked);
    setFailure(null);
    onFailureSeen();
  }

  function focusAmount() {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }

  async function submit(amount: bigint) {
    if (locked) return;
    let signed = false;
    let sentHash: string | null = null;
    cancelled.current = false;
    setFailure(null);
    onFailureSeen();
    setSigning(amount);
    // Stellar checks the repayment first. The dialog opens only once the wallet window does.
    setPhase("preparing");
    // Kept outside this screen from just before it is sent: a failed read or leaving must not lose it.
    const remember = (hash: string, validUntil?: number) => {
      sentHash = hash;
      // `sender`: this screen waits on it now; the page takes over only if that wait ends unconfirmed.
      setInflight({ address, nullifier: advance.nullifier, hash, amount, landed: false, validUntil, sender: true });
    };
    try {
      const { hash } = await repay(address, advance.nullifier, amount, async (xdr) => {
        setPhase("signing");
        if (!cancelled.current) setDialogOpen(true);
        try {
          let out: string;
          try {
            out = await signTransaction(xdr);
          } catch (e) {
            throw new WalletSignError(e);
          }
          signed = true;
          setPhase("pending");
          return out;
        } finally {
          setDialogOpen(false);
        }
      }, remember);
      if (markLanded(hash)) notify(`${formatUsdc(amount)} repaid`);
      setInput("");
      setChip(null);
    } catch (e) {
      // Not confirmed yet, or no answer: it may still land, so it stays in flight and watched (B3).
      // Anything else ended it: forget it.
      if (sentHash && !stillOpen(e)) clearInflight(sentHash);
      // Turning it down after pressing Cancel is no news to the creator who cancelled.
      if (!(cancelled.current && !signed && isSignatureDeclined(e))) setFailure(repayFailureCopy(e, signed, walletName), sentHash);
    } finally {
      // Read the ledger again rather than adjusting the figures by hand. The pending row stays until the
      // API reports the transaction (RepaymentScreen).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: repaymentKey(address) }),
        queryClient.invalidateQueries({ queryKey: transactionsKey(address) }),
        queryClient.invalidateQueries({ queryKey: usdcBalanceKey(address) }),
      ]);
      if (sentHash) releaseSender(sentHash);
      setPhase("idle");
    }
  }

  const rows: Row[] = latestRows(transactions, advance.nullifier);
  if (inflight) rows.push({ kind: "pending", key: "pending", hash: inflight.hash, amount: inflight.amount });
  const shown = rows.slice(-4);

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
      <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4">
        <div className="order-1 w-full">
          <BalanceCard number={number} left={left} repaid={advance.repaid} principal={advance.principal} percent={percentRepaid(advance)} />
        </div>
        <div className="order-2 w-full">
          <QuickActions
            off={left === 0n || busyLabel !== null}
            onRepay={focusAmount}
            onPayInFull={() => {
              fill(left, "full");
              focusAmount();
            }}
            stellarHref={explorerAccountUrl(address)}
            proofHref={explorerTxUrl(advance.txHash)}
          />
        </div>
        <section
          aria-labelledby="transactions-title"
          className="order-4 flex w-full flex-col gap-1 rounded-card bg-surface px-5 pb-2 pt-5 lg:px-6 lg:pb-3 lg:pt-6"
        >
          <div className="flex w-full items-center justify-between pb-2">
            <h2 id="transactions-title" className="text-[18px] font-semibold text-fg">
              Transactions
            </h2>
            <Link
              href="/history"
              className="flex items-center gap-1 rounded-sm text-[14px] font-medium text-brand-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand"
            >
              See all
              <ChevronRight className="size-[15px]" aria-hidden />
            </Link>
          </div>
          <ul className="flex w-full flex-col gap-1">
            {shown.map((row) => (
              <LedgerRow key={row.key} row={row} />
            ))}
          </ul>
        </section>
      </div>

      <div className="contents lg:flex lg:w-[440px] lg:shrink-0 lg:flex-col lg:gap-4">
        <RepayForm
          className="order-3"
          input={input}
          onInput={(raw) => {
            const value = sanitizeAmountInput(raw);
            if (value === null) return;
            setInput(value);
            setChip(null);
            setFailure(null);
            onFailureSeen();
          }}
          inputRef={inputRef}
          chip={chip}
          onChip={(c) => fill(chipAmount(c, left), c)}
          onMax={() => {
            const max = typeof walletUsdc === "bigint" && walletUsdc > 0n && walletUsdc < left ? walletUsdc : left;
            fill(max, max === left ? "full" : null);
          }}
          left={left}
          balance={walletUsdc}
          check={check}
          onSubmit={submit}
          onUseOutstanding={() => fill(left, "full")}
          locked={locked}
          busyLabel={busyLabel}
          failure={failure}
          note={note}
        />
        <AdvanceDetails advance={advance} terms={terms.isPending ? "loading" : terms.data} className="order-4 hidden lg:flex" />
        <LedgerNote className="order-5" />
      </div>

      <ApproveRepayment
        open={dialogOpen}
        onCancel={() => {
          cancelled.current = true;
          setDialogOpen(false);
        }}
        walletName={walletName}
        amount={signing}
        after={left - signing}
      />
    </div>
  );
}
