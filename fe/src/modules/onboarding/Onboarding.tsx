"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { WalletChip } from "@/components/elements/WalletChip";
import { notify } from "@/components/ui/Toaster";
import {
  classifyConnectError,
  classifySignError,
  type ConnectFailure,
  type ConnectedFailure,
  type SignFailure,
} from "@/lib/errors";
import { FriendbotError, fundWithFriendbot } from "@/lib/stellar/friendbot";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/network";
import { TrustlineError, addUsdcTrustline } from "@/lib/stellar/trustline";
import { WalletSignError } from "@/lib/stellar/wallet-error";
import * as wallet from "@/lib/stellar/wallet";
import { useWallet } from "@/providers/WalletProvider";
import { AllowUsdc } from "./components/AllowUsdc";
import { BeforeYouStart } from "./components/BeforeYouStart";
import { CheckingWallet } from "./components/CheckingWallet";
import { ConnectFailurePanel } from "./components/ConnectFailurePanel";
import { ConnectWallet } from "./components/ConnectWallet";
import { ConnectedFailurePanel } from "./components/ConnectedFailurePanel";
import { WalletPickerDialog } from "./components/WalletPickerDialog";
import { useUsdcStatus } from "./hooks/useUsdcStatus";

const TRUSTLINE_FAILURE = {
  refused: "trustlineFailed",
  failed: "trustlineCharged",
  unconfirmed: "trustlineUnconfirmed",
} as const satisfies Record<TrustlineError["outcome"], ConnectedFailure>;

/** Turning the signature down is a choice, not a failure: `null` goes back to 1c as it was. */
const SIGN_FAILURE = {
  declined: null,
  locked: "signLocked",
  wrongNetwork: "signWrongNetwork",
  noAnswer: "signNoAnswer",
} as const satisfies Record<SignFailure, ConnectedFailure | null>;

/**
 * 01 Onboarding (#19): 1a Before you start, 1b Connect wallet, 1c Allow USDC, and every state on the
 * onboarding "States and interactions" board.
 *
 * The USDC trustline is checked right after connecting, before the creator proves anything: an
 * advance sent to a wallet without one fails at the contract (`41 NoTrustline`, #12).
 */
export function Onboarding() {
  const router = useRouter();
  const {
    address,
    walletName,
    hydrated,
    isConnected,
    restoreFailure,
    clearRestoreFailure,
    remember,
    disconnect,
    signTransaction,
  } = useWallet();
  const usdc = useUsdcStatus(address);

  // Not connected: which step, and what went wrong connecting.
  const [view, setView] = useState<"before" | "connect">("before");
  const [connecting, setConnecting] = useState(false);
  // The picker dialog, and the wallet pressed in it, which it then shows as "Waiting for …".
  const [pickerOpen, setPickerOpen] = useState(false);
  const [waitingFor, setWaitingFor] = useState<wallet.PickedWallet | null>(null);
  // `connect()` asks for the element the kit renders its wallet list into. It exists only once the
  // dialog has opened and mounted, so the request waits for the ref.
  const pickerEl = useRef<HTMLDivElement | null>(null);
  const pickerWaiter = useRef<((el: HTMLDivElement) => void) | null>(null);
  const pickerRef = useCallback((el: HTMLDivElement | null) => {
    pickerEl.current = el;
    if (el && pickerWaiter.current) {
      pickerWaiter.current(el);
      pickerWaiter.current = null;
    }
  }, []);
  const mountPicker = useCallback(
    () =>
      new Promise<HTMLElement>((resolve) => {
        pickerWaiter.current = resolve;
        setPickerOpen(true);
      }),
    [],
  );
  const [connectFailure, setConnectFailure] = useState<ConnectFailure | null>(null);
  const [failedWallet, setFailedWallet] = useState("Freighter");

  // Connected: allowing USDC, funding a new account, and what went wrong there.
  const [approving, setApproving] = useState(false);
  // Set once the creator presses "Allow USDC". From then on, whenever the ledger says the wallet can
  // receive USDC (on time, late after Cancel, or on "Check again"), they see the board's "USDC allowed"
  // confirmation and move on themselves. Nothing redirects them silently.
  const [attempted, setAttempted] = useState(false);
  const [funding, setFunding] = useState(false);
  const [connectedFailure, setConnectedFailure] = useState<ConnectedFailure | null>(null);
  // "Cancel" closes the dialog, but the wallet window is not ours to close. Its answer is ignored.
  const allowAttempt = useRef(0);

  // A wallet that could already receive USDC when it connected goes straight on to proving revenue.
  const status = usdc.data;
  const allowed = attempted && status === "ready";
  useEffect(() => {
    if (isConnected && status === "ready" && !attempted) router.replace("/advance");
  }, [isConnected, status, attempted, router]);

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);
    setConnectFailure(null);
    // A failure names the wallet picked this time, not one left over from an earlier attempt.
    setFailedWallet("Freighter");
    clearRestoreFailure();
    try {
      if (!(await wallet.hasWallet())) {
        setConnectFailure("notFound");
        return;
      }
      const session = await wallet.connect({
        mountPicker,
        onWalletSelected: (picked) => {
          setFailedWallet(picked.name);
          setWaitingFor(picked);
        },
      });
      // A wallet that cannot report its network (xBull, Rabet, WalletConnect) is not refused for it.
      const network = await wallet.getNetworkPassphrase();
      if (network !== null && network !== NETWORK_PASSPHRASE) {
        setConnectFailure("wrongNetwork");
        return;
      }
      remember(session);
      notify(`${session.name} connected`);
    } catch (e) {
      setConnectFailure(classifyConnectError(e));
    } finally {
      setConnecting(false);
      setPickerOpen(false);
      setWaitingFor(null);
      pickerWaiter.current = null;
    }
  }

  function resetConnected() {
    allowAttempt.current++;
    setConnectedFailure(null);
    setAttempted(false);
    setApproving(false);
  }

  /** Disconnect, from the wallet menu. Starts over at 1a, as it does from every other screen. */
  async function handleDisconnect() {
    resetConnected();
    await disconnect();
    setView("before");
  }

  /** "Use a different wallet": disconnect and go straight back to 1b. */
  async function handleUseDifferentWallet() {
    resetConnected();
    await disconnect();
    setView("connect");
  }

  async function handleAllow() {
    if (!address) return;
    const attempt = ++allowAttempt.current;
    setConnectedFailure(null);
    setAttempted(true);
    setApproving(true);
    let failure: ConnectedFailure | null = null;
    try {
      await addUsdcTrustline(address, (xdr) =>
        signTransaction(xdr).catch((e: unknown) => {
          throw new WalletSignError(e);
        }),
      );
    } catch (e) {
      if (e instanceof WalletSignError) failure = SIGN_FAILURE[classifySignError(e)];
      else if (e instanceof TrustlineError) failure = TRUSTLINE_FAILURE[e.outcome];
      else failure = "trustlineFailed";
    }
    // The ledger has the last word. If the approval landed although waiting for it failed, the wallet
    // can receive USDC, and `allowed` shows the confirmation instead of an error. A cancelled attempt
    // still refreshes the ledger, so a late approval is confirmed too, but it reports no failure.
    const fresh = await usdc.refetch();
    if (attempt !== allowAttempt.current) return;
    if (fresh.data !== "ready" && failure) setConnectedFailure(failure);
    setApproving(false);
  }

  function cancelAllow() {
    allowAttempt.current++;
    setApproving(false);
  }

  async function handleFund() {
    if (!address) return;
    setConnectedFailure(null);
    setFunding(true);
    try {
      await fundWithFriendbot(address);
    } catch (e) {
      setConnectedFailure(e instanceof FriendbotError ? "fundFailed" : "readFailed");
    }
    await usdc.refetch();
    setFunding(false);
  }

  async function handleRecheck() {
    setConnectedFailure(null);
    await usdc.refetch();
  }

  if (!hydrated) return <div className="min-h-dvh bg-canvas" />;

  // ---- Connected: 1c Allow USDC, or why it cannot be shown yet ----
  if (isConnected && address) {
    const chip = <WalletChip address={address} walletName={walletName} onDisconnect={handleDisconnect} />;
    const failure: ConnectedFailure | null =
      connectedFailure ?? (usdc.isError ? "readFailed" : status === "unfunded" ? "unfunded" : null);

    if (failure) {
      const allowAgain = ["trustlineFailed", "trustlineCharged", "signLocked", "signWrongNetwork", "signNoAnswer"];
      const retry = allowAgain.includes(failure) ? handleAllow : handleRecheck;
      return (
        <ConnectedFailurePanel
          failure={failure}
          walletName={walletName ?? "your wallet"}
          wallet={chip}
          busy={funding || usdc.isFetching}
          onRetry={retry}
          onFund={handleFund}
          onUseDifferentWallet={handleUseDifferentWallet}
        />
      );
    }

    if (status === "missing" || allowed) {
      return (
        <AllowUsdc
          wallet={chip}
          walletName={walletName ?? "your wallet"}
          allowed={allowed}
          approving={approving}
          onAllow={handleAllow}
          onCancel={cancelAllow}
          onUseDifferentWallet={handleUseDifferentWallet}
          onContinue={() => router.push("/advance")}
        />
      );
    }

    // Reading the ledger, or "ready" on its way to /advance.
    return <CheckingWallet wallet={chip} />;
  }

  // ---- Not connected: 1a, 1b, and row 3 of the board ----
  const back = () => {
    setConnectFailure(null);
    clearRestoreFailure();
    setView("before");
  };

  const failure = connectFailure ?? restoreFailure?.kind ?? null;
  if (failure) {
    return (
      <ConnectFailurePanel
        failure={failure}
        walletName={connectFailure ? failedWallet : (restoreFailure?.walletName ?? failedWallet)}
        onRetry={handleConnect}
        onBack={back}
        onDismiss={() => {
          setConnectFailure(null);
          setView("connect");
        }}
      />
    );
  }

  if (view === "before") return <BeforeYouStart onStart={() => setView("connect")} />;

  return (
    <>
      <ConnectWallet onBack={back} onConnect={handleConnect} connecting={connecting} />
      <WalletPickerDialog
        open={pickerOpen}
        waitingFor={waitingFor}
        pickerRef={pickerRef}
        onCancel={() => void wallet.cancelConnect()}
      />
    </>
  );
}
