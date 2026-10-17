"use client";

import { Dialog as Base } from "@base-ui/react/dialog";
import { PenLine } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogSlot } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { formatUsdcExact } from "@/lib/format";

// "3a Approve repayment": the wallet window is open, and the amount is repeated so the creator can
// check it against the one the wallet shows. The shared Dialog on desktop (lo2Ex), a bottom sheet on a
// phone (lLjjC). Cancel closes it; the wallet window is not ours to close.

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
  const rows = [
    { label: "You repay", value: formatUsdcExact(amount) },
    { label: "Left after this", value: formatUsdcExact(after) },
  ];
  const cancel = (
    <Button variant="outline" className="w-full" onClick={onCancel}>
      Cancel
    </Button>
  );

  if (desktop) {
    return (
      <Dialog
        open={open}
        onClose={onCancel}
        wide
        icon={<PenLine aria-hidden />}
        title="Confirm in your wallet"
        body={`${name} opened a window. Check the amount and approve it there.`}
      >
        <DialogSlot rows={rows} />
        {cancel}
      </Dialog>
    );
  }

  const fade =
    "transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none";
  return (
    // A press outside does not close it: the press that opened it would count as outside.
    <Base.Root open={open} onOpenChange={(next) => !next && onCancel()} disablePointerDismissal>
      <Base.Portal>
        <Base.Backdrop className={`fixed inset-0 z-50 bg-fg/60 ${fade}`} />
        <Base.Popup
          className={`fixed inset-x-0 bottom-0 z-50 flex min-h-[420px] flex-col gap-4 rounded-t-[28px] bg-surface px-5 pb-8 pt-2.5 outline-none ${fade}`}
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
          <DialogSlot rows={rows} />
          {cancel}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
