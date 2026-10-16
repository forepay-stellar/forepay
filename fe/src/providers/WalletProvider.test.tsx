import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletError } from "@/lib/stellar/wallet-error";

const wallet = {
  getAddress: vi.fn(),
  getNetworkPassphrase: vi.fn(),
  disconnect: vi.fn(),
  signTransaction: vi.fn(),
};
vi.mock("@/lib/stellar/wallet", () => wallet);
const { WalletProvider, useWallet } = await import("./WalletProvider");

const SAVED = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
const TESTNET = "Test SDF Network ; September 2015";

function Probe() {
  const { hydrated, address, restoreFailure, disconnect } = useWallet();
  if (!hydrated) return <p>checking</p>;
  return (
    <>
      <p>{address ?? `none ${restoreFailure?.kind ?? ""}`.trim()}</p>
      <button onClick={() => void disconnect().then(() => document.body.setAttribute("data-done", "1"))}>disconnect</button>
    </>
  );
}

function renderProvider() {
  render(
    <WalletProvider>
      <Probe />
    </WalletProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.resetAllMocks();
});

describe("WalletProvider disconnect", () => {
  it("ends the session and resolves even when the wallet fails to disconnect", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    wallet.getAddress.mockResolvedValue(SAVED);
    wallet.getNetworkPassphrase.mockResolvedValue(TESTNET);
    wallet.disconnect.mockRejectedValue(new Error("relay did not answer"));
    renderProvider();
    await waitFor(() => expect(screen.getByText(SAVED)).toBeTruthy());
    screen.getByText("disconnect").click();
    await waitFor(() => expect(document.body.getAttribute("data-done")).toBe("1"));
    expect(screen.getByText("none")).toBeTruthy();
    expect(window.localStorage.getItem("forepay.wallet")).toBeNull();
    document.body.removeAttribute("data-done");
  });
});

describe("WalletProvider on reload", () => {
  it("restores a saved session the wallet still confirms, on testnet", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    wallet.getAddress.mockResolvedValue(SAVED);
    wallet.getNetworkPassphrase.mockResolvedValue(TESTNET);
    renderProvider();
    await waitFor(() => expect(screen.getByText(SAVED)).toBeTruthy());
  });

  it("restores a wallet that cannot report its network (xBull, Rabet), instead of dropping it", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    wallet.getAddress.mockResolvedValue(SAVED);
    wallet.getNetworkPassphrase.mockResolvedValue(null);
    renderProvider();
    await waitFor(() => expect(screen.getByText(SAVED)).toBeTruthy());
  });

  it("drops a saved address the wallet no longer reports", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    wallet.getAddress.mockResolvedValue("GBOTHER");
    renderProvider();
    await waitFor(() => expect(screen.getByText("none")).toBeTruthy());
    expect(window.localStorage.getItem("forepay.wallet")).toBeNull();
  });

  it("drops the session and says to unlock when Freighter, asked silently, gives no address", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    // What the kit's Freighter module rejects with for getAddress({ skipRequestAccess: true }), once
    // wallet-real has made it a WalletError.
    wallet.getAddress.mockRejectedValue(
      new WalletError("Getting the address from Freighter is not allowed, please request access first.", -3),
    );
    renderProvider();
    await waitFor(() => expect(screen.getByText("none locked")).toBeTruthy());
    expect(window.localStorage.getItem("forepay.wallet")).toBeNull();
  });

  it("drops the session without a reason for anything it does not recognise", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    wallet.getAddress.mockRejectedValue(new Error("boom"));
    renderProvider();
    await waitFor(() => expect(screen.getByText("none")).toBeTruthy());
  });

  it("drops the session and says why when the wallet moved off testnet", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    wallet.getAddress.mockResolvedValue(SAVED);
    wallet.getNetworkPassphrase.mockResolvedValue("Public Global Stellar Network ; September 2015");
    renderProvider();
    await waitFor(() => expect(screen.getByText("none wrongNetwork")).toBeTruthy());
    expect(window.localStorage.getItem("forepay.wallet")).toBeNull();
  });

  it("starts disconnected with nothing saved, without asking the wallet", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByText("none")).toBeTruthy());
    expect(wallet.getAddress).not.toHaveBeenCalled();
  });
});
