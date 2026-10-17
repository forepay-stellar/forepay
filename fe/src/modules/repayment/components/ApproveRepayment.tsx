"use client";

import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogSlot } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { formatUsdc } from "@/lib/format";
import { useDesktop } from "@/lib/useDesktop";

// "3a Approve repayment": the wallet window is open, and the amount is repeated so the creator can
// check it against the one the wallet shows. The shared Dialog on desktop (lo2Ex), its sheet form on a
// phone (lLjjC). Cancel closes it; the wallet window is not ours to close.

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
    { label: "You repay", value: formatUsdc(amount) },
    { label: "Left after this", value: formatUsdc(after) },
  ];
  const cancel = (
    <Button variant="outline" className="w-full" onClick={onCancel}>
      Cancel
    </Button>
  );

  return desktop ? (
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
  ) : (
    <Dialog
      open={open}
      onClose={onCancel}
      variant="sheet"
      lead={<Spinner />}
      title={`Approve in ${walletName ?? "your wallet"}`}
      body={`${name} opened. Check the amount and approve it there.`}
    >
      <DialogSlot rows={rows} />
      {cancel}
    </Dialog>
  );
}
