"use client";

import { Dialog as Base } from "@base-ui/react/dialog";
import { PenLine, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatUsdc } from "@/lib/format";

// "3a Approve repayment": the wallet window is open, and the amount is repeated so the creator can
// check it against the one the wallet shows. A dialog on desktop (lo2Ex), a bottom sheet on a phone
// (lLjjC). Cancel closes it; the wallet window is not ours to close.

const DESKTOP = "(min-width: 1024px)";

function useDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

function Amounts({ amount, after }: { amount: bigint; after: bigint }) {
  return (
    <dl className="flex w-full flex-col gap-2.5 rounded-tile bg-canvas p-4 text-[14px]">
      <div className="flex justify-between">
        <dt className="text-fg-muted">You repay</dt>
        <dd className="font-medium text-fg">{formatUsdc(amount)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-fg-muted">Left after this</dt>
        <dd className="font-medium text-fg">{formatUsdc(after)}</dd>
      </div>
    </dl>
  );
}

export function ApproveRepayment({
  open,
  onCancel,
  walletName,
  amount,
  after,
}: {
  open: boolean;
  onCancel: () => void;
  walletName: string | null;
  amount: bigint;
  after: bigint;
}) {
  const desktop = useDesktop();
  const name = walletName ?? "Your wallet";
  const fade =
    "transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none";

  return (
    // A press outside does not close it: the press that opened it would count as outside.
    <Base.Root open={open} onOpenChange={(next) => !next && onCancel()} disablePointerDismissal>
      <Base.Portal>
        <Base.Backdrop className={`fixed inset-0 z-50 bg-fg/60 ${fade}`} />
        {desktop ? (
          <Base.Popup
            className={`fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card bg-surface p-7 outline-none ${fade}`}
          >
            <div className="flex w-full items-start justify-between">
              <span className="flex size-12 items-center justify-center rounded-icon bg-brand-subtle">
                <PenLine className="size-6 text-icon" aria-hidden />
              </span>
              <Base.Close
                aria-label="Close"
                className="rounded-full text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X className="size-5" aria-hidden />
              </Base.Close>
            </div>
            <div className="flex flex-col gap-1.5">
              <Base.Title className="text-[20px] font-semibold tracking-[-0.3px] text-fg">Confirm in your wallet</Base.Title>
              <Base.Description className="text-[15px] leading-[23px] text-fg-muted">
                {name} opened a window. Check the amount and approve it there.
              </Base.Description>
            </div>
            <Amounts amount={amount} after={after} />
            <Button variant="outline" className="w-full" onClick={onCancel}>
              Cancel
            </Button>
          </Base.Popup>
        ) : (
          <Base.Popup
            className={`fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-[28px] bg-surface px-5 pb-8 pt-2.5 outline-none ${fade}`}
          >
            <div className="flex w-full justify-center" aria-hidden>
              <span className="h-[5px] w-10 rounded-[3px] bg-line-strong" />
            </div>
            <Spinner />
            <Base.Title className="text-[20px] font-semibold tracking-[-0.3px] text-fg">
              Approve in {walletName ?? "your wallet"}
            </Base.Title>
            <Base.Description className="text-[15px] leading-[23px] text-fg-muted">
              {name} opened. Check the amount and approve it there.
            </Base.Description>
            <Amounts amount={amount} after={after} />
            <Button variant="outline" className="w-full" onClick={onCancel}>
              Cancel
            </Button>
          </Base.Popup>
        )}
      </Base.Portal>
    </Base.Root>
  );
}
