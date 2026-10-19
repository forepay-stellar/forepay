import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  CircleAlert,
  FileCheck,
  LoaderCircle,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Transaction row from "05 Product components": an icon tile, what happened with its status and date,
// and the amount with its receipt. A row with a receipt is one link to stellar.expert, opened in a new
// tab; on hover its receipt link turns orange ("Receipt link", repayment board row 4).

export type RowIcon = "advance" | "repayment" | "failed" | "pending" | "proof" | "trustline";
export type RowTone = "success" | "danger" | "pending" | "fg" | "subtle" | "muted";

/** A label that a phone says shorter ("Failed, no USDC moved" → "Failed"). */
export type Label = { text: string; short?: string };

const tile: Record<RowIcon, { className: string; icon: ReactNode }> = {
  advance: { className: "bg-brand text-fg-on-brand", icon: <ArrowDownToLine aria-hidden /> },
  repayment: { className: "bg-brand-subtle text-icon", icon: <ArrowUpFromLine aria-hidden /> },
  failed: { className: "bg-danger-subtle text-danger", icon: <CircleAlert aria-hidden /> },
  pending: {
    className: "bg-brand-subtle text-icon",
    icon: <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />,
  },
  proof: { className: "bg-brand-subtle text-icon", icon: <FileCheck aria-hidden /> },
  trustline: { className: "bg-brand-subtle text-icon", icon: <Wallet aria-hidden /> },
};

const tone: Record<RowTone, string> = {
  success: "text-success",
  danger: "text-danger",
  pending: "text-brand",
  fg: "text-fg",
  subtle: "text-fg-subtle",
  muted: "text-fg-muted",
};

function Text({ label }: { label: Label }) {
  if (!label.short) return <>{label.text}</>;
  return (
    <>
      <span className="md:hidden">{label.short}</span>
      <span className="hidden md:inline">{label.text}</span>
    </>
  );
}

export function TransactionRow({
  icon,
  title,
  status,
  statusTone,
  date,
  amount,
  amountTone,
  receiptHref,
}: {
  icon: RowIcon;
  title: Label;
  status: Label;
  statusTone: RowTone;
  date: string;
  amount: Label;
  amountTone: RowTone;
  /** The transaction on stellar.expert. Without it the row is not a link. */
  receiptHref?: string;
}) {
  const body = (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-icon [&_svg]:size-[22px]", tile[icon].className)}>
        {tile[icon].icon}
      </span>
      {/* Section 08: the title column keeps at least its longest word, so a title wraps between words
          and is never cut; on a narrow phone the amount gives way instead (its unit wraps under it). */}
      <span className="flex min-w-min flex-1 flex-col gap-1">
        <span className="text-[15px] font-medium text-fg">
          <Text label={title} />
        </span>
        {/* On a narrow phone the date moves under the status rather than past the row (section 08). */}
        <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[13px]">
          <span className={tone[statusTone]}>
            <Text label={status} />
          </span>
          <span className="text-fg-muted">{date}</span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 text-right">
        <span className={cn("text-[15px] font-semibold", tone[amountTone])}>
          <Text label={amount} />
        </span>
        {receiptHref && (
          <span className="flex items-center gap-1 whitespace-nowrap text-[13px] text-fg-muted group-hover:text-brand-strong">
            Receipt
            <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
        )}
      </span>
    </>
  );

  const row = "flex w-full items-center gap-3.5 py-4";
  return (
    // The divider is drawn inside the row, as the pen's stroke is, so a row stays 76 tall.
    <li className="w-full shadow-[inset_0_-1px_0_var(--color-divider)] last:shadow-none">
      {receiptHref ? (
        <a
          href={receiptHref}
          target="_blank"
          rel="noreferrer"
          className={cn(row, "group rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-brand")}
        >
          {body}
        </a>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}
