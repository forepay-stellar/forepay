import type { ReactNode } from "react";
import { OnboardingShell } from "@/components/layout/OnboardingShell";
import { SkeletonBlock, useDelayedReveal } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/**
 * Reading the ledger right after connecting: a skeleton in the shape of 1c (illustration, two line
 * title, body, wallet status card, button and link), shown after about 200 ms.
 */
export function CheckingWallet({ wallet }: { wallet: ReactNode }) {
  const shown = useDelayedReveal();
  const fade = cn("transition-opacity duration-200 motion-reduce:transition-none", shown ? "opacity-100" : "opacity-0");
  return (
    <OnboardingShell
      step={2}
      wallet={wallet}
      actions={
        <>
          <SkeletonBlock className={cn("h-[57px] w-full rounded-pill", fade)} />
          <SkeletonBlock className={cn("h-[18px] w-40 rounded-chip", fade)} />
        </>
      }
    >
      <div role="status" aria-label="Checking your wallet" className="contents">
        <SkeletonBlock className={cn("h-[160px] w-[200px] rounded-tile", fade)} />
        <SkeletonBlock className={cn("h-[60px] w-4/5 rounded-chip md:h-[76px] lg:h-[92px]", fade)} />
        <SkeletonBlock className={cn("h-[69px] w-full rounded-chip md:h-[52px]", fade)} />
        <SkeletonBlock className={cn("h-[94px] w-full rounded-tile", fade)} />
      </div>
    </OnboardingShell>
  );
}
