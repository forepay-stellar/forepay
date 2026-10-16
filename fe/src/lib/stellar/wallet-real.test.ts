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
