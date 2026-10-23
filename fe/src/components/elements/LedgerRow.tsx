import { TransactionRow } from "@/components/elements/TransactionRow";
import { formatUsdCents, usdcParts } from "@/lib/format";
import { rowDate, type Row } from "@/lib/ledger";
import { explorerTxUrl } from "@/lib/stellar/network";

// One line of 3a "Transactions" and 3b "All transactions", in the frames' words. Money leaving the
// wallet is written with a real minus sign (U+2212), money arriving with a plus, in emerald.
const MINUS = "−";

/** A signed USDC amount, its unit apart (see `Label`). */
function usdc(sign: string, stroops: bigint) {
  const { whole, decimals } = usdcParts(stroops);
  return { text: `${sign}${whole}${decimals}`, unit: "USDC" };
}

const completed = { status: { text: "Completed" }, statusTone: "success" as const };
// A failed row reached the ledger and failed there (#16): the network fee was spent and no USDC moved.
// It is on chain, so it has a receipt. A transaction that never reached a ledger is not listed.
const failed = {
  status: { text: "Failed, no USDC moved", short: "Failed" },
  statusTone: "danger" as const,
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
          amount={usdc(MINUS, row.amount)}
          amountTone="fg"
          receiptHref={row.hash ? explorerTxUrl(row.hash) : undefined}
        />
      );
    case "advance":
    case "repayment": {
      const advance = row.kind === "advance";
      const amount = usdc(advance ? "+" : MINUS, row.amount);
      const title = { text: advance ? "Advance received" : "Repayment" };
      if (row.failed) {
        return <TransactionRow icon="failed" title={title} date={rowDate(row.at)} amount={amount} amountTone="subtle" receiptHref={explorerTxUrl(row.hash)} {...failed} />;
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
          amount={{ text: `${formatUsdCents(row.revenueCents)} proven`, short: formatUsdCents(row.revenueCents) }}
          amountTone="muted"
          receiptHref={explorerTxUrl(row.hash)}
        />
      );
    case "trustline": {
      const title = { text: "USDC allowed in wallet", short: "USDC allowed" };
      const amount = { text: "Network fee only", short: "Fee only" };
      if (row.failed) {
        return <TransactionRow icon="failed" title={title} date={rowDate(row.at)} amount={amount} amountTone="subtle" receiptHref={explorerTxUrl(row.hash)} {...failed} />;
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
