"use client";

import { useQueryClient } from "@tanstack/react-query";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
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
import { repay } from "@/lib/stellar/contract";
import { NETWORK_PASSPHRASE, explorerAccountUrl, explorerContractUrl, explorerTxUrl } from "@/lib/stellar/network";
import { useWallet } from "@/providers/WalletProvider";
import { AdvanceDetails } from "./components/AdvanceDetails";
import { ApproveRepayment } from "./components/ApproveRepayment";
import { BalanceCard } from "./components/BalanceCard";
import { QuickActions } from "./components/QuickActions";
import { RepayForm } from "./components/RepayForm";
import { repayFailureCopy } from "./failures";
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

function RepaymentScreen({ address }: { address: string }) {
  const advances = useAdvances(address);
  const transactions = useTransactions(address);

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
      <Ledger address={address} advance={picked.advance} number={picked.number} transactions={transactions.data} />
    ) : (
      <div className="flex w-full justify-center pt-4">
        <NoAdvance />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-7">
      <Header />
      {body}
    </div>
  );
}

/**
 * Where a repayment is: Stellar checks it (`preparing`), the wallet window is open (`signing`), it was
 * sent and Stellar has not answered yet (`pending`). Only one runs at a time.
 */
type Phase = "idle" | "preparing" | "signing" | "pending";

/** The hash a signed transaction will have on the ledger, for the pending row's receipt. */
function hashOf(signedXdr: string): string {
  try {
    return TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE).hash().toString("hex");
  } catch {
    return "";
  }
}

function Ledger({
  address,
  advance,
  number,
  transactions,
}: {
  address: string;
  advance: AdvanceSummary;
  number: number;
  transactions: LedgerTransaction[];
}) {
  const { walletName, signTransaction } = useWallet();
  const queryClient = useQueryClient();
  const balance = useUsdcBalance(address);

  const [input, setInput] = useState("");
  const [chip, setChip] = useState<Chip | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [signing, setSigning] = useState(0n);
  const [pending, setPending] = useState<{ hash: string; amount: bigint } | null>(null);
  const [failure, setFailure] = useState<FailureCopy | null>(null);
  // "Cancel" closes the dialog, but the wallet window is not ours to close. The repayment is still
  // followed: if the creator approves it after all, it shows as pending and lands like any other.
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const left = outstanding(advance);
  const walletUsdc = balance.isSuccess ? balance.data : undefined;
  const check = checkAmount(input, left, walletUsdc);
  const locked = phase !== "idle";
  const busyLabel =
    phase === "preparing"
      ? "Checking with Stellar"
      : phase === "signing"
        ? dialogOpen
          ? null
          : "Waiting for your wallet"
        : phase === "pending"
          ? "Waiting for Stellar"
          : null;

  function fill(value: bigint, picked: Chip | null) {
    setInput(amountInputString(value));
    setChip(picked);
    setFailure(null);
  }

  function focusAmount() {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }

  async function submit(amount: bigint) {
    if (locked) return;
    let signed = false;
    cancelled.current = false;
    setFailure(null);
    setSigning(amount);
    // Stellar checks the repayment first. The dialog opens only once the wallet window does.
    setPhase("preparing");
    try {
      await repay(address, advance.nullifier, amount, async (xdr) => {
        setPhase("signing");
        if (!cancelled.current) setDialogOpen(true);
        try {
          const out = await signTransaction(xdr);
          signed = true;
          setPending({ hash: hashOf(out), amount });
          setPhase("pending");
          return out;
        } finally {
          setDialogOpen(false);
        }
      });
      notify(`${formatUsdc(amount)} repaid`);
      setInput("");
      setChip(null);
    } catch (e) {
      // Turning it down after pressing Cancel is no news to the creator who cancelled.
      if (!(cancelled.current && !signed && isSignatureDeclined(e))) setFailure(repayFailureCopy(e, signed));
    } finally {
      // The ledger has the answer now. Read it again rather than adjusting the figures by hand.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: repaymentKey(address) }),
        queryClient.invalidateQueries({ queryKey: transactionsKey(address) }),
        queryClient.invalidateQueries({ queryKey: usdcBalanceKey(address) }),
      ]);
      setPending(null);
      setPhase("idle");
    }
  }

  const rows: Row[] = latestRows(transactions, advance.nullifier);
  if (pending) rows.push({ kind: "pending", key: "pending", hash: pending.hash, amount: pending.amount });
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
          locked={locked}
          busyLabel={busyLabel}
          failure={failure}
        />
        <AdvanceDetails advance={advance} className="order-4 hidden lg:flex" />
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
