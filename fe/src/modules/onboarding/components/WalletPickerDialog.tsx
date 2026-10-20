"use client";

import { Dialog as Base } from "@base-ui/react/dialog";
import { LoaderCircle } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/Button";
import type { PickedWallet } from "@/lib/stellar/wallet";

/**
 * The wallet picker, in a dialog of our own. While the creator chooses, the kit renders its themed
 * wallet list into `pickerRef`. Once a wallet is pressed, the same dialog says which wallet we are
 * waiting for and where to look, with a way out: the kit's own modal shows nothing while a wallet
 * asks, and the popup it opens sits beside the page, not in it.
 *
 * Phone: a sheet from the bottom edge. From a tablet up: centred, the width of the kit's list (22rem).
 */
export function WalletPickerDialog({
  open,
  waitingFor,
  pickerRef,
  onCancel,
}: {
  open: boolean;
  waitingFor: PickedWallet | null;
  pickerRef: Ref<HTMLDivElement>;
  onCancel: () => void;
}) {
  return (
    // A press outside does not close it: the press that opened it would count as outside. The kit's
    // close button, Cancel and Escape all do.
    <Base.Root open={open} onOpenChange={(next) => !next && onCancel()} disablePointerDismissal>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-50 bg-fg/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Base.Popup
          aria-label={waitingFor ? `Waiting for ${waitingFor.name}` : "Connect wallet"}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-[22rem] justify-center outline-none transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none md:inset-x-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2"
        >
          {/* Kept mounted while waiting: the kit's pending connection lives in it. The kit wraps its card
              in an inline-flex section that shrinks to its content; stretch it to the dialog instead. */}
          <div
            ref={pickerRef}
            className={waitingFor ? "hidden" : "w-full [&_.stellar-wallets-kit]:flex [&_.stellar-wallets-kit]:w-full"}
          />
          {waitingFor && <Waiting wallet={waitingFor} onCancel={onCancel} />}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

function Waiting({ wallet, onCancel }: { wallet: PickedWallet; onCancel: () => void }) {
  return (
    <div className="flex w-full flex-col items-center gap-5 rounded-[22px] bg-surface px-6 pb-6 pt-8">
      <div className="relative flex size-20 items-center justify-center" role="status" aria-label={`Waiting for ${wallet.name}`}>
        <LoaderCircle
          className="absolute inset-0 size-20 animate-spin text-brand [stroke-width:1.25] motion-reduce:animate-none"
          aria-hidden
        />
        {wallet.icon ? (
          // The kit's own icon for the wallet, a data URL or the wallet's site.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.icon} alt="" className="size-12 rounded-full" />
        ) : (
          <span className="size-12 rounded-full bg-subtle" aria-hidden />
        )}
      </div>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <Base.Title className="text-card-title text-fg">Waiting for {wallet.name}</Base.Title>
        <Base.Description className="text-body text-fg-muted">
          Approve the connection in the {wallet.name} window.
        </Base.Description>
      </div>
      <Button variant="outline" className="w-full" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
