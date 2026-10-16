import { IlloWaitingForSignature } from "@/components/illustrations/WaitingForSignature";
import { Button } from "@/components/ui/Button";
import { formatUsdc, shortAddress } from "@/lib/format";
import { DetailRows } from "./DetailRows";

/**
 * 2c Sign: the wallet has opened its window and the creator approves there. "Cancel" closes this
 * card, but the wallet window is not ours to close, so a signature given after it is never sent.
 */
export function SignAdvance({
  walletName,
  address,
  advance,
  onCancel,
}: {
  walletName: string;
  address: string;
  /** Stroops, from `quote`. */
  advance: bigint;
  onCancel: () => void;
}) {
  return (
    <section className="flex w-full flex-col items-center gap-5 rounded-card bg-surface p-8 lg:w-[520px]">
      <IlloWaitingForSignature />
      <h2 className="text-[24px] font-semibold tracking-[-0.5px] text-fg">Approve in {walletName}</h2>
      <p className="text-center text-[15px] leading-[23px] text-fg-muted">
        {walletName} opened a window. Check the details and approve. This page updates on its own.
      </p>
      <DetailRows
        rows={[
          { label: "You receive", value: formatUsdc(advance) },
          { label: "Sent to", value: shortAddress(address), mono: true },
          { label: "Network fee", value: "Under 0.01 XLM" },
        ]}
      />
      <Button variant="outline" className="w-full" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
