import { KitEventType, Networks, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FREIGHTER_ID, FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import {
  WALLET_CONNECT_ID,
  WalletConnectModule,
  WalletConnectTargetChain,
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { createAppKit, type AppKit } from "@reown/appkit/core";
import { mainnet } from "@reown/appkit/networks";
import { UniversalProvider } from "@walletconnect/universal-provider";
import { anyBrowserWallet } from "./wallet-detect";
import { isUnsupportedCall, toWalletError } from "./wallet-error";

// Ported from Sorosense `frontend/lib/wallet-real.ts`.
//
// @creit.tech/stellar-wallets-kit 2.x ships `StellarWalletsKit` as a *static* class: `init()`,
// `authModal()`, `getAddress()`, `signTransaction()` and `disconnect()` are static methods. `authModal()`
// opens the library's wallet picker, sets the chosen wallet as active and resolves with its address.
// We only theme it (brief §6, 1b).
//
// On Freighter's mobile app the page runs inside Freighter's own browser, which the kit's Freighter
// module refuses (it expects WalletConnect there), so that one case goes through WalletConnect with
// Reown AppKit as the bottom sheet.

let initialized = false;

const WALLET_ID_KEY = "forepay.wallet.id";
const FREIGHTER_WC_ID = "997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380";
const WC_TESTNET = "stellar:testnet";

type StellarWindow = Window &
  typeof globalThis & { stellar?: { provider?: string; platform?: string }; xBullSDK?: unknown };
type WcProvider = Awaited<ReturnType<typeof UniversalProvider.init>>;

let mobileWc: { provider: WcProvider; modal: AppKit; address?: string } | null = null;

const METADATA = {
  name: "Forepay",
  description: "A USDC advance on the AdSense revenue you already earn",
};

class ForepayWalletConnectModule extends WalletConnectModule {
  async isPlatformWrapper(): Promise<boolean> {
    return false;
  }
}

function walletConnectProjectId() {
  return process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";
}

function walletModules() {
  // The three browser wallets the 1b screen names.
  const extensions = [new FreighterModule(), new xBullModule(), new RabetModule()];
  const projectId = walletConnectProjectId();
  if (!projectId) return extensions;
  return [
    ...extensions,
    new ForepayWalletConnectModule({
      projectId,
      allowedChains: [WalletConnectTargetChain.TESTNET],
      metadata: {
        ...METADATA,
        url: window.location.origin,
        icons: [`${window.location.origin}/icon.svg`],
      },
    }),
  ];
}

function isFreighterMobile() {
  const stellar = (window as StellarWindow).stellar;
  return stellar?.provider === "freighter" && stellar?.platform === "mobile";
}

function viaMobileWalletConnect() {
  return isFreighterMobile() && walletConnectProjectId() !== "";
}

async function getMobileWalletConnect() {
  if (mobileWc) return mobileWc;
  const projectId = walletConnectProjectId();
  const provider = await UniversalProvider.init({
    projectId,
    metadata: { ...METADATA, url: window.location.origin, icons: [`${window.location.origin}/icon.svg`] },
  });
  const modal = createAppKit({
    projectId,
    // AppKit needs an EVM network to boot; the session itself is negotiated on `stellar:testnet` below.
    networks: [mainnet],
    universalProvider: provider as unknown as Parameters<typeof createAppKit>[0]["universalProvider"],
    manualWCControl: true,
    enableReconnect: true,
    featuredWalletIds: [FREIGHTER_WC_ID],
  });
  provider.on("display_uri", (uri: string) => {
    void modal.open({ uri });
  });
  provider.on("session_delete", () => {
    mobileWc = null;
  });
  mobileWc = { provider, modal };
  return mobileWc;
}

async function connectMobileWalletConnect(): Promise<{ address: string; name: string; id: string }> {
  const wc = await getMobileWalletConnect();
  try {
    const session = await wc.provider.connect({
      namespaces: {
        stellar: {
          methods: ["stellar_signXDR", "stellar_signAndSubmitXDR", "stellar_signMessage", "stellar_signAuthEntry"],
          chains: [WC_TESTNET],
          events: ["accountsChanged"],
        },
      },
    });
    void wc.modal.close();
    if (!session) throw new Error("Connection cancelled.");
    const address = session.namespaces.stellar?.accounts[0]?.split(":")[2];
    if (!address) throw new Error("Freighter did not return an account.");
    wc.address = address;
    return { address, name: "Freighter", id: WALLET_CONNECT_ID };
  } catch (e) {
    void wc.modal.close();
    throw e;
  }
}

async function mobileWalletConnectAddress() {
  const wc = await getMobileWalletConnect();
  if (wc.address) return wc.address;
  const account = wc.provider.session?.namespaces.stellar?.accounts[0]?.split(":")[2];
  if (!account) throw new Error("No WalletConnect session found.");
  wc.address = account;
  return account;
}

/**
 * The picker's colours. The kit writes each value into a `--swk-*` CSS variable, so these point at the
 * `--fp-*` primitives in `tokens.css` (the semantic `--color-*` names live in `@theme inline` and are
 * not on `:root`). Stone canvas rows on a white sheet, near black text, no shadow.
 */
const PICKER_THEME = {
  background: "var(--fp-white)",
  "background-secondary": "var(--fp-stone-canvas)",
  "foreground-strong": "var(--fp-stone-950)",
  foreground: "var(--fp-stone-950)",
  "foreground-secondary": "var(--fp-stone-600)",
  primary: "var(--fp-stone-950)",
  "primary-foreground": "var(--fp-white)",
  transparent: "rgba(0, 0, 0, 0)",
  lighter: "var(--fp-white)",
  light: "var(--fp-stone-100)",
  "light-gray": "var(--fp-stone-200)",
  gray: "var(--fp-stone-400)",
  danger: "var(--fp-rose-600)",
  border: "var(--fp-stone-150)",
  shadow: "none",
  "border-radius": "22px",
  "font-family": "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
};

export function getKit(): typeof StellarWalletsKit {
  if (typeof window === "undefined") throw new Error("wallet is client-only");
  if (!initialized) {
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      selectedWalletId: initialWalletId(),
      modules: walletModules(),
      theme: PICKER_THEME,
      authModal: { showInstallLabel: true },
    });
    initialized = true;
  }
  return StellarWalletsKit;
}

function initialWalletId() {
  try {
    return window.localStorage.getItem(WALLET_ID_KEY) ?? FREIGHTER_ID;
  } catch {
    return FREIGHTER_ID;
  }
}

export function getWalletName(): string {
  if (viaMobileWalletConnect()) return "Freighter";
  return getKit().selectedModule.productName;
}

export function getWalletId(): string {
  if (viaMobileWalletConnect()) return WALLET_CONNECT_ID;
  return getKit().selectedModule.productId;
}

/**
 * Whether the creator has any way to connect: an installed browser extension, or WalletConnect.
 * False is the "Install a Stellar wallet" state.
 */
export async function hasWallet(): Promise<boolean> {
  if (viaMobileWalletConnect() || walletConnectProjectId()) return true;
  const wallets = await getKit().refreshSupportedWallets();
  return anyBrowserWallet(wallets, !!(window as StellarWindow).xBullSDK);
}

/**
 * Open the picker and connect. `onWalletSelected` fires once the creator picks a wallet, before that
 * wallet asks for permission, so the page can say "Waiting for Freighter".
 */
export async function connect(
  onWalletSelected?: (name: string) => void,
): Promise<{ address: string; name: string; id: string }> {
  try {
    if (viaMobileWalletConnect()) {
      onWalletSelected?.("Freighter");
      return await connectMobileWalletConnect();
    }
    const kit = getKit();
    const unsubscribe = kit.on(KitEventType.WALLET_SELECTED, () => {
      onWalletSelected?.(kit.selectedModule.productName);
    });
    try {
      const { address } = await kit.authModal();
      const id = getWalletId();
      try {
        window.localStorage.setItem(WALLET_ID_KEY, id);
      } catch {
        // Storage unavailable: the session still works, it just will not survive a reload.
      }
      return { address, name: getWalletName(), id };
    } finally {
      unsubscribe();
    }
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function getAddress(): Promise<string> {
  if (viaMobileWalletConnect()) return mobileWalletConnectAddress();
  const { address } = await getKit().getAddress();
  return address;
}

/**
 * The network passphrase the wallet is on right now, compared with testnet after connecting and on
 * reload. `null` when the wallet cannot say: xBull, Rabet and WalletConnect reject the kit's
 * `getNetwork` with code -3 ("does not support"), and that is not a failure. Those sessions are
 * negotiated on testnet by the kit, and a wallet on the wrong network still fails by name at signing.
 */
export async function getNetworkPassphrase(): Promise<string | null> {
  if (viaMobileWalletConnect()) return Networks.TESTNET; // the session was negotiated on stellar:testnet
  try {
    const { networkPassphrase } = await getKit().getNetwork();
    return networkPassphrase;
  } catch (e) {
    const err = toWalletError(e);
    if (isUnsupportedCall(err)) return null;
    throw err;
  }
}

export async function signTransaction(xdr: string): Promise<string> {
  try {
    if (viaMobileWalletConnect()) {
      const wc = await getMobileWalletConnect();
      if (!wc.provider.session) throw new Error("No WalletConnect session found.");
      const { signedXDR } = await wc.provider.request<{ signedXDR: string }>(
        { method: "stellar_signXDR", params: { xdr } },
        WC_TESTNET,
      );
      return signedXDR;
    }
    const { signedTxXdr } = await getKit().signTransaction(xdr, { networkPassphrase: Networks.TESTNET });
    return signedTxXdr;
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function disconnect(): Promise<void> {
  try {
    window.localStorage.removeItem(WALLET_ID_KEY);
  } catch {
    // nothing to clear
  }
  if (viaMobileWalletConnect()) {
    if (mobileWc?.provider.session) await mobileWc.provider.disconnect();
    mobileWc = null;
    return;
  }
  await getKit().disconnect();
}
