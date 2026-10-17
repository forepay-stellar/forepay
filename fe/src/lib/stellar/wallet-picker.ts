// Kit-free types shared by the wallet layers and the page that hosts the wallet picker.

/** The wallet the creator pressed in the picker: shown by name, with its icon, while it asks. */
export type PickedWallet = { name: string; icon?: string };

/**
 * How `connect()` reaches the page. `mountPicker` opens the page's own dialog and resolves with the
 * element the picker's wallet list renders into; a connection that needs no picker (Freighter's mobile
 * app, through WalletConnect) never calls it. `onWalletSelected` fires on every press of a wallet row.
 */
export type ConnectHooks = {
  mountPicker?: () => Promise<HTMLElement>;
  onWalletSelected?: (wallet: PickedWallet) => void;
};
