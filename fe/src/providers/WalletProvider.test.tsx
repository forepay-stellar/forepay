import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  const { hydrated, address, restoreFailure } = useWallet();
  if (!hydrated) return <p>checking</p>;
  return <p>{address ?? `none ${restoreFailure?.kind ?? ""}`.trim()}</p>;
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

  it("drops the session when Freighter, asked silently, gives no address (locked or revoked)", async () => {
    window.localStorage.setItem("forepay.wallet", SAVED);
    // What the kit's Freighter module rejects with for getAddress({ skipRequestAccess: true }).
    wallet.getAddress.mockRejectedValue({
      code: -3,
      message: "Getting the address from Freighter is not allowed, please request access first.",
    });
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
