import { cn } from "@/lib/cn";
import { usdcParts } from "@/lib/format";

/**
 * Money the way the design shows it (brief §3): the whole part solid, the decimals faded, the unit
 * smaller beside it. Sizes and colours come from the caller, since each screen sets its own.
 */
export function Amount({
  stroops,
  sign,
  className,
  decimalsClassName,
  unitClassName,
}: {
  stroops: bigint;
  /** `+` for money that arrived. */
  sign?: "+";
  className?: string;
  decimalsClassName?: string;
  unitClassName?: string;
}) {
  const { whole, decimals } = usdcParts(stroops);
  return (
    <span className="flex items-end">
      <span className={className}>
        {sign}
        {whole}
      </span>
      <span className={cn(className, decimalsClassName)}>{decimals}</span>
      <span className={cn("pl-2", unitClassName)}>USDC</span>
    </span>
  );
}
