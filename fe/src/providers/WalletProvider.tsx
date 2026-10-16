"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as wallet from "@/lib/stellar/wallet";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/network";

// Ported from Sorosense `providers/WalletProvider.tsx`. The only React context in the app
// (ARCHITECTURE.md §4).

type Ctx = {
  /** `undefined` while the saved session is being re-checked, `null` when disconnected. */
  address: string | null | undefined;
  walletName: string | null;
  hydrated: boolean;
  isConnected: boolean;
  /**
   * Why a saved session was dropped on reload, when the creator can do something about it. Today only
   * "wrongNetwork": the wallet moved off testnet since the last visit.
   */
  restoreFailure: { kind: "wrongNetwork"; walletName: string } | null;
  clearRestoreFailure: () => void;
  /** Save a session the page has already connected and checked (network included). */
  remember: (session: { address: string; name: string }) => void;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};

const WalletContext = createContext<Ctx | null>(null);

const ADDRESS_KEY = "forepay.wallet";
const NAME_KEY = "forepay.wallet.name";

function clearStorage() {
  try {
    window.localStorage.removeItem(ADDRESS_KEY);
    window.localStorage.removeItem(NAME_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [restoreFailure, setRestoreFailure] = useState<Ctx["restoreFailure"]>(null);

  // Reload keeps the session (#19), but a saved address is not a live session: the creator may have
  // locked the wallet, revoked access, switched accounts or moved the wallet off testnet. Re-check it
  // before trusting it, so a stale session never reaches a signature.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = window.localStorage.getItem(ADDRESS_KEY);
        if (saved) {
          const live = await wallet.getAddress();
          if (!alive) return;
          if (live === saved) {
            const network = await wallet.getNetworkPassphrase();
            if (network !== null && network !== NETWORK_PASSPHRASE) {
              if (alive) {
                const name = window.localStorage.getItem(NAME_KEY) ?? "your wallet";
                setRestoreFailure({ kind: "wrongNetwork", walletName: name });
              }
            } else {
              if (!alive) return;
              setWalletName(window.localStorage.getItem(NAME_KEY));
              setAddress(saved);
              return;
            }
          }
        }
      } catch {
        // Locked, revoked, or storage blocked. No verified session either way.
      }
      if (!alive) return;
      clearStorage();
      setAddress(null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const remember = useCallback((session: { address: string; name: string }) => {
    setRestoreFailure(null);
    setAddress(session.address);
    setWalletName(session.name);
    try {
      window.localStorage.setItem(ADDRESS_KEY, session.address);
      window.localStorage.setItem(NAME_KEY, session.name);
    } catch {
      // Storage unavailable: connected for this visit only.
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await wallet.disconnect();
    } finally {
      clearStorage();
      setRestoreFailure(null);
      setAddress(null);
      setWalletName(null);
    }
  }, []);

  const clearRestoreFailure = useCallback(() => setRestoreFailure(null), []);

  const value = useMemo<Ctx>(
    () => ({
      address,
      walletName,
      hydrated: address !== undefined,
      isConnected: !!address,
      restoreFailure,
      clearRestoreFailure,
      remember,
      disconnect,
      signTransaction: wallet.signTransaction,
    }),
    [address, walletName, restoreFailure, clearRestoreFailure, remember, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
