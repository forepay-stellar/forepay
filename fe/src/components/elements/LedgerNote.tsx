import { BookOpenCheck } from "lucide-react";
import { cn } from "@/lib/cn";

// Ledger note from "05 Product components": the reminder that every figure on the page is read from
// Stellar, on the brand-subtle tile.
export function LedgerNote({ className }: { className?: string }) {
  return (
    <aside className={cn("flex w-full items-center gap-3.5 rounded-tile bg-brand-subtle p-[18px]", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-surface">
        <BookOpenCheck className="size-[18px] text-icon" aria-hidden />
      </span>
      <p className="flex-1 text-small text-brand-strong">
        Every number on this page comes straight from Stellar, not from your browser.
      </p>
    </aside>
  );
}
