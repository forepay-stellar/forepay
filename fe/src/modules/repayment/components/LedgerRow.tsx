import { TransactionRow } from "@/components/elements/TransactionRow";
import { formatUsdc } from "@/lib/format";
import { explorerTxUrl } from "../links";
import { formatUsd, rowDate, type Row } from "../model";

// One line of 3a "Transactions" and 3b "All transactions", in the frames' words. Money leaving the
// wallet is written with a real minus sign (U+2212), money arriving with a plus, in emerald.
const MINUS = "−";

const completed = { status: { text: "Completed" }, statusTone: "success" as const };
const failed = {
  status: { text: "Failed, not charged", short: "Not charged" },
  statusTone: "danger" as const,
  noReceipt: { text: "No transaction", short: "Not sent" },
};

export function LedgerRow({ row }: { row: Row }) {
  switch (row.kind) {
    case "pending":
      return (
        <TransactionRow
          icon="pending"
          title={{ text: "Repayment" }}
          status={{ text: "Pending" }}
          statusTone="pending"
          date="Just now"
          amount={{ text: `${MINUS}${formatUsdc(row.amount)}` }}
          amountTone="fg"
          receiptHref={row.hash ? explorerTxUrl(row.hash) : undefined}
        />
      );
    case "advance":
    case "repayment": {
      const advance = row.kind === "advance";
      const amount = { text: `${advance ? "+" : MINUS}${formatUsdc(row.amount)}` };
      const title = { text: advance ? "Advance received" : "Repayment" };
      if (row.failed) {
        return <TransactionRow icon="failed" title={title} date={rowDate(row.at)} amount={amount} amountTone="subtle" {...failed} />;
      }
      return (
        <TransactionRow
          icon={row.kind}
          title={title}
          {...completed}
          date={rowDate(row.at)}
          amount={amount}
          amountTone={advance ? "success" : "fg"}
          receiptHref={explorerTxUrl(row.hash)}
        />
      );
    }
    case "proof":
      return (
        <TransactionRow
          icon="proof"
          title={{ text: "Revenue proof verified", short: "Proof verified" }}
          {...completed}
          date={rowDate(row.at)}
          amount={{ text: `${formatUsd(row.revenueCents)} proven`, short: formatUsd(row.revenueCents) }}
          amountTone="muted"
          receiptHref={explorerTxUrl(row.hash)}
        />
      );
    case "trustline": {
      const title = { text: "USDC allowed in wallet", short: "USDC allowed" };
      const amount = { text: "Network fee only", short: "Fee only" };
      if (row.failed) {
        return <TransactionRow icon="failed" title={title} date={rowDate(row.at)} amount={amount} amountTone="subtle" {...failed} />;
      }
      return (
        <TransactionRow
          icon="trustline"
          title={title}
          {...completed}
          date={rowDate(row.at)}
          amount={amount}
          amountTone="muted"
          receiptHref={explorerTxUrl(row.hash)}
        />
      );
    }
  }
}
