import { Account, Asset, BASE_FEE, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
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
const closes = vi.hoisted(() => ({ count: 0 }));
const answers = vi.hoisted(() => ({ listeners: [] as ((a: unknown) => void)[] }));
const available = vi.hoisted(() => ({
  freighter: (): Promise<boolean> => Promise.resolve(false),
  rabet: (): Promise<boolean> => Promise.resolve(false),
}));

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  Networks: { TESTNET: "Test SDF Network ; September 2015" },
  StellarWalletsKit: kit,
  closeEvent: { next: () => closes.count++ },
  addressUpdatedEvent: {
    subscribe: (fn: (a: unknown) => void) => {
      answers.listeners.push(fn);
      return () => {
        answers.listeners = answers.listeners.filter((l) => l !== fn);
      };
    },
  },
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
  closes.count = 0;
  answers.listeners = [];
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
  /** A press on a picker row, as the kit makes it: it selects the wallet, then tells its listeners. */
  function press(id: string, name: string, icon?: string) {
    kit.selectedModule = { productId: id, productName: name };
    for (const l of picks.listeners) l({ id, name, icon });
  }
  /** The wallet's answer on the kit's shared answer event. */
  function answer(a: unknown) {
    for (const l of answers.listeners) l(a);
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("names each wallet the creator picks, and nothing on opening the picker", async () => {
    const named: unknown[] = [];
    kit.authModal.mockImplementation(() => new Promise(() => {}));
    const { connect } = await load();
    const session = connect({ onWalletSelected: (w) => named.push(w) });
    await tick();
    expect(named).toEqual([]);
    // The selected wallet picked again still counts as a pick.
    press("freighter", "Freighter", "data:freighter");
    press("xbull", "xBull", "data:xbull");
    answer("GABC");
    expect(await session).toEqual({ address: "GABC", name: "xBull", id: "xbull" });
    expect(named).toEqual([
      { name: "Freighter", icon: "data:freighter" },
      { name: "xBull", icon: "data:xbull" },
    ]);
    expect(picks.listeners).toHaveLength(0);
    expect(answers.listeners).toHaveLength(0);
    expect(window.localStorage.getItem("forepay.wallet.id")).toBe("xbull");
  });

  it("hears an approval the kit itself would miss, while it is still checking wallets", async () => {
    // The kit's promise never settles: it subscribed too late to hear the answer.
    kit.authModal.mockImplementation(() => new Promise(() => {}));
    const { connect } = await load();
    const session = connect({ mountPicker: async () => document.createElement("div") });
    await tick();
    press("rabet", "Rabet");
    answer("GRABET");
    expect(await session).toMatchObject({ address: "GRABET", name: "Rabet" });
    // The kit is told to take down its list.
    expect(closes.count).toBe(1);
  });

  it("ignores a late answer from a wallet other than the one picked", async () => {
    kit.authModal.mockImplementation(() => new Promise(() => {}));
    const { connect } = await load();
    const session = connect();
    await tick();
    // A popup from a cancelled attempt approves before anything is picked here: not ours.
    answer("GSTALE");
    press("xbull", "xBull");
    // ...or after xBull was picked, while Freighter is still the module that answered: not ours either.
    kit.selectedModule = { productId: "freighter", productName: "Freighter" };
    answer("GFREIGHTER");
    kit.selectedModule = { productId: "xbull", productName: "xBull" };
    answer("GXBULL");
    expect(await session).toMatchObject({ address: "GXBULL", name: "xBull", id: "xbull" });
  });

  it("passes on a wallet's refusal after a pick", async () => {
    kit.authModal.mockImplementation(() => new Promise(() => {}));
    const { connect } = await load();
    const session = connect();
    await tick();
    press("freighter", "Freighter");
    answer({ code: -4, message: "The user rejected this request." });
    await expect(session).rejects.toMatchObject({ name: "WalletError", code: -4 });
  });

  it("stops listening when the kit's close button closes the picker", async () => {
    kit.authModal.mockRejectedValue({ code: -1, message: "The user closed the modal." });
    const { connect } = await load();
    await expect(connect({ onWalletSelected: () => {} })).rejects.toMatchObject({ name: "WalletError", code: -1 });
    expect(picks.listeners).toHaveLength(0);
    expect(answers.listeners).toHaveLength(0);
  });

  it("renders the picker into the page's own element when the page gives one", async () => {
    kit.authModal.mockImplementation(() => new Promise(() => {}));
    const container = document.createElement("div");
    const { connect } = await load();
    const session = connect({ mountPicker: async () => container });
    await tick();
    expect(kit.authModal).toHaveBeenCalledWith({ container });
    press("freighter", "Freighter");
    answer("GABC");
    await session;
  });

  it("opens the kit's own modal when the page gives no element", async () => {
    kit.authModal.mockImplementation(() => new Promise(() => {}));
    const session = (await load()).connect();
    await tick();
    expect(kit.authModal).toHaveBeenCalledWith(undefined);
    press("freighter", "Freighter");
    answer("GABC");
    await session;
  });

  it("cancels through the kit's close event, the same path as its close button", async () => {
    (await load()).cancelConnect();
    expect(closes.count).toBe(1);
  });

  it("ends the connection on cancel even before the kit listens for it", async () => {
    // The kit is still checking wallets: its close event goes unheard and its promise never settles.
    kit.authModal.mockImplementation(() => new Promise(() => {}));
    const { connect, cancelConnect } = await load();
    const session = connect({ mountPicker: async () => document.createElement("div") });
    await tick();
    cancelConnect();
    await expect(session).rejects.toMatchObject({ name: "WalletError", code: -1 });
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

describe("signTransaction", () => {
  const creator = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
  const xdr = new TransactionBuilder(new Account(creator, "1"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", creator) }))
    .setTimeout(30)
    .build()
    .toXDR();

  it("asks the wallet to sign for testnet, as the account the transaction is for", async () => {
    kit.signTransaction.mockResolvedValue({ signedTxXdr: "signed" });
    expect(await (await load()).signTransaction(xdr)).toBe("signed");
    expect(kit.signTransaction).toHaveBeenCalledWith(xdr, { networkPassphrase: Networks.TESTNET, address: creator });
  });

  it("names no account to Rabet, which cannot take one", async () => {
    kit.selectedModule = { productId: "rabet", productName: "Rabet" };
    kit.signTransaction.mockResolvedValue({ signedTxXdr: "signed" });
    await (await load()).signTransaction(xdr);
    expect(kit.signTransaction).toHaveBeenCalledWith(xdr, { networkPassphrase: Networks.TESTNET });
  });
});

describe("disconnect", () => {
  it("awaits the wallet's own disconnect and passes its failure on, after the kit forgets the wallet", async () => {
    class Module {
      productId = "wallet_connect";
      async disconnect() {
        throw new Error("relay did not answer");
      }
    }
    const walletConnect = new Module();
    kit.selectedModule = walletConnect as unknown as Record<string, unknown>;
    // The kit's own disconnect, which calls the module's without awaiting it.
    kit.disconnect.mockImplementation(async () => {
      void (kit.selectedModule as unknown as Module).disconnect();
    });
    window.localStorage.setItem("forepay.wallet.id", "wallet_connect");
    await expect((await load()).disconnect()).rejects.toThrow("relay did not answer");
    expect(kit.disconnect).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("forepay.wallet.id")).toBeNull();
    // The module is left as it was.
    expect(Object.prototype.hasOwnProperty.call(walletConnect, "disconnect")).toBe(false);
  });
});
