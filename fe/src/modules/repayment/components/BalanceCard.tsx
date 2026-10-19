import { cn } from "@/lib/cn";
import { formatUsdc, usdcParts } from "@/lib/format";

// Balance card from "05 Product components" (3a hero). Tangerine while something is left to repay,
// emerald once nothing is ("Fully repaid": the card turns quiet). Flat: two translucent circles are the
// only decoration, and only where the desktop card is wide enough to show them.
export function BalanceCard({
  number,
  left,
  repaid,
  principal,
  percent,
}: {
  number: number;
  left: bigint;
  repaid: bigint;
  principal: bigint;
  percent: number;
}) {
  const done = left === 0n;
  const { whole, decimals } = usdcParts(left);
  const repaidOf = `${usdcParts(repaid).whole}${usdcParts(repaid).decimals} of ${formatUsdc(principal)} repaid`;

  return (
    <section
      aria-label="What is left to repay"
      className={cn(
        "relative flex w-full flex-col gap-5 overflow-hidden rounded-hero p-[22px] md:p-7",
        done ? "bg-success-subtle text-success-strong" : "bg-brand text-fg-on-brand",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-[560px] top-[60px] hidden size-[300px] rounded-full md:block",
          done ? "bg-surface/40" : "bg-surface/12",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute left-[610px] top-[110px] hidden size-[200px] rounded-full md:block",
          done ? "bg-surface/27" : "bg-surface/8",
        )}
      />

      <div className="relative flex w-full items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-medium">Advance {number}</h2>
          <span
            className={cn(
              "rounded-chip px-2.5 py-[5px] text-[12px] font-medium",
              done ? "bg-surface text-success-strong" : "bg-surface/18",
            )}
          >
            {done ? "Repaid" : "Active"}
          </span>
        </div>
        {!done && (
          <span className="hidden rounded-pill bg-surface/18 px-3.5 py-[9px] text-[12px] font-medium md:inline">
            USDC on Stellar testnet
          </span>
        )}
      </div>

      <div className="relative flex flex-col gap-1.5">
        <p className={cn("text-[15px]", !done && "text-fg-on-brand/80")}>{done ? "Nothing left to repay" : "Left to repay"}</p>
        {/* The hero amount role: 56, 72, 88 (section 08). */}
        <p className="flex items-end text-hero">
          <span>{whole}</span>
          <span className={cn(done ? "text-success" : "text-fg-on-brand/55")}>
            {decimals}
          </span>
          <span
            className={cn("pb-2 pl-2.5 text-[22px] font-medium tracking-normal", !done && "text-fg-on-brand/80")}
          >
            USDC
          </span>
        </p>
      </div>

      <div className="relative flex w-full flex-col gap-2.5">
        <div className="flex w-full justify-between text-[14px]">
          <span>{repaidOf}</span>
          <span className="font-semibold">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Repaid"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className={cn("relative h-2 w-full rounded-pill", done ? "bg-success-strong/13" : "bg-black/18")}
        >
          <span
            className={cn("absolute inset-y-0 left-0 rounded-pill", done ? "bg-success" : "bg-surface")}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}
