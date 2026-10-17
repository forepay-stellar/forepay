import type { Ref } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { FailureCopy } from "@/lib/errors";
import { formatUsdc, formatUsdcExact } from "@/lib/format";
import { amountDisplay, type AmountCheck, type Chip } from "../model";
import { Alert } from "@/components/ui/Alert";

// Repay form from "05 Product components" and the board's row 2: the amount field, the 25% / 50% / Full
// amount chips, what is left after this, the network fee, and the button, which always says what
// happens next ("Enter an amount", "Repay 30.00 USDC", "Add USDC to your wallet").

const CHIPS: { chip: Chip; label: string }[] = [
  { chip: "quarter", label: "25%" },
  { chip: "half", label: "50%" },
  { chip: "full", label: "Full amount" },
];

export function RepayForm({
  input,
  onInput,
  inputRef,
  chip,
  onChip,
  onMax,
  left,
  balance,
  check,
  onSubmit,
  locked,
  busyLabel,
  failure,
  className,
}: {
  input: string;
  onInput: (value: string) => void;
  inputRef: Ref<HTMLInputElement>;
  chip: Chip | null;
  onChip: (chip: Chip) => void;
  onMax: () => void;
  left: bigint;
  /** The wallet's USDC. `undefined` while it is being read, or when it could not be read. */
  balance: bigint | null | undefined;
  check: AmountCheck;
  onSubmit: (amount: bigint) => void;
  /** A repayment is under way: nothing can be sent again until it settles. */
  locked: boolean;
  /**
   * What the button says while it waits ("Waiting for Stellar"). Null while the approve dialog covers
   * the form, which then stays exactly as it was (lo2Ex).
   */
  busyLabel: string | null;
  failure: FailureCopy | null;
  className?: string;
}) {
  const settled = left === 0n;
  const busy = busyLabel !== null;
  const shown = amountDisplay(settled ? "" : input);
  const invalid = check.kind === "overOutstanding" || check.kind === "overBalance";
  const lit = !invalid && (check.kind === "ok" || chip !== null);

  // What is signed is shown exactly, never rounded down to the cent (review S4).
  let after = formatUsdcExact(left);
  if (check.kind === "ok") after = formatUsdcExact(left - check.amount);
  if (check.kind === "overOutstanding") after = `Only ${formatUsdcExact(left)} left`;
  if (check.kind === "overBalance") after = "Not enough USDC in wallet";

  let action = "Enter an amount";
  if (settled) action = "Nothing left to repay";
  else if (check.kind === "ok") action = `Repay ${formatUsdcExact(check.amount)}`;
  else if (check.kind === "overOutstanding") action = `Repay ${formatUsdcExact(left)} instead`;
  else if (check.kind === "overBalance") action = "Add USDC to your wallet";

  return (
    <form
      aria-label="Make a repayment"
      className={cn("flex w-full flex-col gap-5 rounded-card bg-surface p-5 lg:p-6", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (check.kind === "ok" && !locked) onSubmit(check.amount);
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-semibold tracking-[-0.2px] text-fg">Make a repayment</h2>
        <p className="text-[14px] text-fg-muted">Any amount, any time. Every payment is recorded on Stellar.</p>
      </div>

      <div
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-input bg-surface px-5 py-4 outline",
          invalid
            ? "outline-[1.5px] -outline-offset-[0.75px] outline-danger"
            : lit
              ? "outline-[1.5px] -outline-offset-[0.75px] outline-brand"
              : "outline-1 -outline-offset-[0.5px] outline-line-strong focus-within:outline-[1.5px] focus-within:-outline-offset-[0.75px] focus-within:outline-brand",
        )}
      >
        <div className="flex w-full justify-between text-[13px]">
          <label htmlFor="repay-amount" className="text-fg-muted">
            Amount
          </label>
          {balance !== undefined && (
            <p className="flex gap-1.5">
              <span className="text-fg-subtle">In wallet</span>
              <span className={check.kind === "overBalance" ? "text-danger" : "text-fg-muted"}>{formatUsdc(balance ?? 0n)}</span>
            </p>
          )}
        </div>
        <div className="flex w-full items-center justify-between gap-3">
          <div className="relative min-w-0 flex-1 text-[36px] font-semibold tracking-[-1.1px]">
            <p aria-hidden className="truncate whitespace-pre">
              <span className="text-fg">{shown.whole}</span>
              <span className="text-fg-subtle">{shown.decimals}</span>
            </p>
            <input
              ref={inputRef}
              id="repay-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder=""
              aria-invalid={invalid || undefined}
              aria-describedby="repay-after"
              disabled={settled || busy}
              value={settled ? "" : input}
              onChange={(e) => onInput(e.target.value)}
              className="absolute inset-0 w-full bg-transparent text-transparent caret-fg outline-none disabled:cursor-not-allowed"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-pill px-2.5 py-1.5 text-[13px] font-medium text-fg outline outline-1 -outline-offset-[0.5px] outline-line">
              USDC
            </span>
            <button
              type="button"
              onClick={onMax}
              disabled={settled || busy}
              className="rounded-pill bg-action px-2.5 py-1.5 text-[12px] font-medium text-fg-on-brand outline-none hover:bg-action-hover focus-visible:ring-2 focus-visible:ring-brand disabled:bg-line disabled:text-fg-subtle"
            >
              Max
            </button>
          </div>
        </div>
      </div>

      <div className="flex w-full gap-2">
        {CHIPS.map(({ chip: c, label }) => {
          const on = chip === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              disabled={settled || busy}
              onClick={() => onChip(c)}
              className={cn(
                "flex min-w-0 flex-1 justify-center whitespace-nowrap rounded-pill px-4 py-2.5 text-[14px] font-medium outline outline-1 -outline-offset-[0.5px] transition-colors focus-visible:ring-2 focus-visible:ring-brand disabled:text-fg-subtle",
                on ? "bg-brand-subtle text-brand-strong outline-brand" : "bg-surface text-fg outline-line-strong hover:bg-subtle",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <dl className="flex w-full flex-col gap-3 text-[14px]">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Left after this</dt>
          <dd id="repay-after" className={cn("whitespace-nowrap font-medium", invalid ? "text-danger" : "text-fg")}>
            {after}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Network fee</dt>
          <dd className="whitespace-nowrap font-medium text-fg">Under 0.01 XLM</dd>
        </div>
      </dl>

      {failure && <Alert tone="danger" className="w-full" title={failure.title} body={failure.body} />}

      <Button
        type="submit"
        size="lg"
        className="w-full lg:px-6"
        disabled={check.kind !== "ok" || settled}
        loading={busy}
        loadingLabel={busyLabel ?? undefined}
      >
        {action}
      </Button>
    </form>
  );
}
