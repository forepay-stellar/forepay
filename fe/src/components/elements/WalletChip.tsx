"use client";

import { Menu } from "@base-ui/react/menu";
import { ArrowUpRight, ChevronDown, Copy, LogOut, Wallet } from "lucide-react";
import { notify } from "@/components/ui/Toaster";
import { shortAddress } from "@/lib/format";
import { explorerAccountUrl } from "@/lib/stellar/network";

// Wallet chip and Wallet menu from "05 Product components" (onboarding board, row 4).
export function WalletChip({
  address,
  walletName,
  onDisconnect,
}: {
  address: string;
  walletName: string | null;
  onDisconnect: () => void;
}) {
  const short = shortAddress(address);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      notify("Address copied");
    } catch {
      notify("Copying is blocked in this browser", { success: false });
    }
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-[12px] px-3 py-[11px] text-small font-medium outline-none data-[highlighted]:bg-subtle";

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Wallet ${short}`}
        className="group flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-pill bg-surface py-1.5 pl-1.5 pr-3.5 outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="flex size-[30px] items-center justify-center rounded-pill bg-brand-subtle">
          <Wallet className="size-4 text-icon" aria-hidden />
        </span>
        <span className="font-mono text-small font-medium text-fg">{short}</span>
        {/* A phone drops the chevron to fit the header (1c Mobile). It points up while the menu is open.
            The chip itself stays white, as on the board: a tint would melt into the canvas. */}
        <ChevronDown
          className="hidden size-4 text-fg-muted transition-transform duration-150 group-data-[popup-open]:rotate-180 motion-reduce:transition-none md:block"
          aria-hidden
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="flex w-[280px] flex-col gap-0.5 rounded-tile bg-surface p-2 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <div className="flex flex-col gap-1 px-3 pb-3 pt-2.5">
              {walletName && <p className="text-small text-fg-muted">{walletName}</p>}
              <p className="font-mono text-body font-medium text-fg">{short}</p>
            </div>
            <div className="h-px w-full bg-divider" />
            <Menu.Item className={`${item} text-fg`} onClick={copy}>
              <Copy className="size-[17px] text-fg-muted" aria-hidden />
              Copy address
            </Menu.Item>
            <Menu.LinkItem
              className={`${item} text-fg`}
              href={explorerAccountUrl(address)}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowUpRight className="size-[17px] text-fg-muted" aria-hidden />
              View on Stellar Expert
            </Menu.LinkItem>
            <Menu.Item className={`${item} text-danger`} onClick={onDisconnect}>
              <LogOut className="size-[17px] text-danger" aria-hidden />
              Disconnect
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
