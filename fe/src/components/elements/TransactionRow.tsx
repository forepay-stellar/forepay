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

/** A label that a phone says shorter ("Failed, not charged" → "Not charged"). */
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
      <span className="lg:hidden">{label.short}</span>
      <span className="hidden lg:inline">{label.text}</span>
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
  noReceipt,
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
  /** What stands where the receipt would be, for a repayment that never reached Stellar. */
  noReceipt?: Label;
}) {
  const body = (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-icon [&_svg]:size-[22px]", tile[icon].className)}>
        {tile[icon].icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[15px] font-medium text-fg">
          <Text label={title} />
        </span>
        <span className="flex gap-2.5 whitespace-nowrap text-[13px]">
          <span className={tone[statusTone]}>
            <Text label={status} />
          </span>
          <span className="text-fg-muted">{date}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap">
        <span className={cn("text-[15px] font-semibold", tone[amountTone])}>
          <Text label={amount} />
        </span>
        {receiptHref ? (
          <span className="flex items-center gap-1 text-[13px] text-fg-muted group-hover:text-brand-strong">
            Receipt
            <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
        ) : (
          noReceipt && (
            <span className="text-[13px] text-fg-muted">
              <Text label={noReceipt} />
            </span>
          )
        )}
      </span>
    </>
  );

  const row = "flex w-full items-center gap-3.5 py-4";
  return (
    <li className="w-full border-b border-divider last:border-b-0">
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
