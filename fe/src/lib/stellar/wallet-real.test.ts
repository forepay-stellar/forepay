import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The kit is mocked whole: wallet-real.ts keeps `initialized` as module state, so each test loads a
// fresh copy (vi.resetModules) against a kit whose answers it sets.

const kit = vi.hoisted(() => ({
  init: vi.fn(),
  authModal: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  disconnect: vi.fn(),
  selectedModule: {} as Record<string, unknown>,
}));
const picks = vi.hoisted(() => ({ listeners: [] as ((p: object) => void)[] }));
const available = vi.hoisted(() => ({
  freighter: (): Promise<boolean> => Promise.resolve(false),
  rabet: (): Promise<boolean> => Promise.resolve(false),
}));

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  Networks: { TESTNET: "Test SDF Network ; September 2015" },
  StellarWalletsKit: kit,
  moduleSelectedEvent: {
    subscribe: (fn: (p: object) => void) => {
      picks.listeners.push(fn);
      return () => {
        picks.listeners = picks.listeners.filter((l) => l !== fn);
      };
    },
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FREIGHTER_ID: "freighter",
  FreighterModule: class {
    productId = "freighter";
    isAvailable = () => available.freighter();
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/rabet", () => ({
  RABET_ID: "rabet",
  RabetModule: class {
    productId = "rabet";
    isAvailable = () => available.rabet();
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/xbull", () => ({
  xBullModule: class {
    productId = "xbull";
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/wallet-connect", () => ({
  WALLET_CONNECT_ID: "wallet_connect",
  WalletConnectModule: class {},
  WalletConnectTargetChain: { TESTNET: "stellar:testnet" },
}));
vi.mock("@reown/appkit/core", () => ({ createAppKit: vi.fn() }));
vi.mock("@reown/appkit/networks", () => ({ mainnet: {} }));
vi.mock("@walletconnect/universal-provider", () => ({ UniversalProvider: { init: vi.fn() } }));

const load = () => import("./wallet-real");

beforeEach(() => {
  vi.resetModules();
  for (const fn of [kit.init, kit.authModal, kit.getAddress, kit.getNetwork, kit.signTransaction, kit.disconnect]) {
    fn.mockReset();
  }
  kit.selectedModule = { productId: "freighter", productName: "Freighter" };
  picks.listeners = [];
  available.freighter = () => Promise.resolve(false);
  available.rabet = () => Promise.resolve(false);
  window.localStorage.clear();
  delete (window as { xBullSDK?: unknown }).xBullSDK;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hasWallet", () => {
  it("is true when Freighter answers", async () => {
    available.freighter = () => Promise.resolve(true);
    expect(await (await load()).hasWallet()).toBe(true);
  });

  it("is false when no extension answers and xBull is absent", async () => {
    expect(await (await load()).hasWallet()).toBe(false);
  });

  it("gives up on a check after a second, as the picker does", async () => {
    vi.useFakeTimers();
    // Freighter's isConnected() without the extension: no answer for two seconds.
    available.freighter = () => new Promise((resolve) => setTimeout(() => resolve(false), 2000));
    available.rabet = () => Promise.resolve(true);
    const { hasWallet } = await load();
    let answer: boolean | undefined;
    void hasWallet().then((a) => (answer = a));
    await vi.advanceTimersByTimeAsync(1000);
    expect(answer).toBe(true);
  });

  it("counts a check that throws as no wallet", async () => {
    available.freighter = () => Promise.reject(new Error("boom"));
    expect(await (await load()).hasWallet()).toBe(false);
  });
});

describe("connect", () => {
  it("names each wallet the creator picks, and nothing on opening the picker", async () => {
    const named: string[] = [];
    let resolveModal: (v: { address: string }) => void = () => {};
    kit.authModal.mockImplementation(() => new Promise((resolve) => (resolveModal = resolve)));
    const { connect } = await load();
    const session = connect((name) => named.push(name));
    expect(named).toEqual([]);
    // The selected wallet picked again still counts as a pick.
    for (const l of picks.listeners) l({ name: "Freighter" });
    for (const l of picks.listeners) l({ name: "xBull" });
    kit.selectedModule = { productId: "xbull", productName: "xBull" };
    resolveModal({ address: "GABC" });
    expect(await session).toEqual({ address: "GABC", name: "xBull", id: "xbull" });
    expect(named).toEqual(["Freighter", "xBull"]);
    expect(picks.listeners).toHaveLength(0);
    expect(window.localStorage.getItem("forepay.wallet.id")).toBe("xbull");
  });

  it("stops listening when the picker is closed", async () => {
    kit.authModal.mockRejectedValue({ code: -1, message: "The user closed the modal." });
    const { connect } = await load();
    await expect(connect(() => {})).rejects.toMatchObject({ name: "WalletError", code: -1 });
    expect(picks.listeners).toHaveLength(0);
  });
});

describe("the wallet picked last time", () => {
  it("is selected again when this build has it", async () => {
    window.localStorage.setItem("forepay.wallet.id", "rabet");
    (await load()).getKit();
    expect(kit.init).toHaveBeenCalledWith(expect.objectContaining({ selectedWalletId: "rabet" }));
  });

  it("is forgotten for Freighter when this build does not have it", async () => {
    window.localStorage.setItem("forepay.wallet.id", "wallet_connect");
    (await load()).getKit();
    expect(kit.init).toHaveBeenCalledWith(expect.objectContaining({ selectedWalletId: "freighter" }));
    expect(window.localStorage.getItem("forepay.wallet.id")).toBeNull();
  });
});

describe("getAddress", () => {
  it("asks Freighter silently, so a locked one is caught", async () => {
    const getAddress = vi.fn().mockRejectedValue({ code: -3, message: "not allowed, please request access first" });
    kit.selectedModule = { productId: "freighter", productName: "Freighter", getAddress };
    await expect((await load()).getAddress()).rejects.toMatchObject({ name: "WalletError", code: -3 });
    expect(getAddress).toHaveBeenCalledWith({ skipRequestAccess: true });
    expect(kit.getAddress).not.toHaveBeenCalled();
  });

  it("takes the remembered address for a wallet that cannot be asked silently", async () => {
    const getAddress = vi.fn();
    kit.selectedModule = { productId: "xbull", productName: "xBull", getAddress };
    kit.getAddress.mockResolvedValue({ address: "GXBULL" });
    expect(await (await load()).getAddress()).toBe("GXBULL");
    expect(getAddress).not.toHaveBeenCalled();
  });
});

describe("getNetworkPassphrase", () => {
  it("is the wallet's passphrase when it can say", async () => {
    const mainnet = "Public Global Stellar Network ; September 2015";
    kit.getNetwork.mockResolvedValue({ network: "PUBLIC", networkPassphrase: mainnet });
    expect(await (await load()).getNetworkPassphrase()).toBe(mainnet);
  });

  it("is null for a wallet that does not support asking", async () => {
    kit.getNetwork.mockRejectedValue({ code: -3, message: 'xBull does not support the "getNetwork" function' });
    expect(await (await load()).getNetworkPassphrase()).toBeNull();
  });

  it("rethrows any other failure", async () => {
    kit.getNetwork.mockRejectedValue({ code: -3, message: "not allowed, please request access first" });
    await expect((await load()).getNetworkPassphrase()).rejects.toMatchObject({ name: "WalletError", code: -3 });
  });
});
