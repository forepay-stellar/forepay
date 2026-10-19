import { ArrowUpFromLine, ArrowUpRight, CircleCheck, FileCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Quick action tiles from "05 Product components", under the hero. A phone shows four narrow tiles with
// shorter labels ("Pay all", "Stellar", "Proof").
const tile =
  "flex min-w-0 flex-1 flex-col items-center gap-2 rounded-tile bg-surface px-1.5 py-3.5 outline-none transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand md:gap-3 md:px-4 md:py-[22px] disabled:pointer-events-none";

function Face({ icon, label, short, disabled }: { icon: ReactNode; label: string; short: string; disabled?: boolean }) {
  return (
    <>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-icon [&_svg]:size-[18px] md:size-11 md:[&_svg]:size-6",
          disabled ? "bg-subtle text-fg-subtle" : "bg-brand-subtle text-icon",
        )}
      >
        {icon}
      </span>
      {/* A label with no room wraps under itself rather than being cut (section 08). */}
      <span className={cn("text-center text-[12px] font-medium md:text-[15px]", disabled ? "text-fg-subtle" : "text-fg")}>
        <span className="md:hidden">{short}</span>
        <span className="hidden md:inline">{label}</span>
      </span>
    </>
  );
}

export function QuickActions({
  onRepay,
  onPayInFull,
  stellarHref,
  proofHref,
  off,
}: {
  onRepay: () => void;
  onPayInFull: () => void;
  /** The creator's account on stellar.expert. */
  stellarHref: string;
  /** The transaction that verified the revenue proof and paid the advance. */
  proofHref: string;
  /** Nothing left to repay, or a repayment under way: the two repay tiles turn off with the form. */
  off: boolean;
}) {
  return (
    <div role="group" aria-label="Quick actions" className="flex w-full gap-2 md:gap-3">
      <button type="button" className={tile} onClick={onRepay} disabled={off}>
        <Face icon={<ArrowUpFromLine aria-hidden />} label="Repay" short="Repay" disabled={off} />
      </button>
      <button type="button" className={tile} onClick={onPayInFull} disabled={off}>
        <Face icon={<CircleCheck aria-hidden />} label="Pay in full" short="Pay all" disabled={off} />
      </button>
      <a className={tile} href={stellarHref} target="_blank" rel="noreferrer">
        <Face icon={<ArrowUpRight aria-hidden />} label="View on Stellar" short="Stellar" />
      </a>
      <a className={tile} href={proofHref} target="_blank" rel="noreferrer">
        <Face icon={<FileCheck aria-hidden />} label="Revenue proof" short="Proof" />
      </a>
    </div>
  );
}
