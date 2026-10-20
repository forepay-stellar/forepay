"use client";

import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/elements/EmptyState";
import { ErrorPanel } from "@/components/elements/ErrorPanel";
import { IlloNoAdvanceYet } from "@/components/illustrations/NoAdvanceYet";
import { IlloProofNotConfirmed } from "@/components/illustrations/ProofNotConfirmed";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock, useDelayedReveal } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

// The repayment board's row 4 ("Loading", "Cannot reach Stellar") and row 1 "No advance yet". Shared by
// 3a and 3b, which read the same figures.

function Bar({ className }: { className: string }) {
  return <SkeletonBlock className={cn("bg-divider", className)} />;
}

/** "Loading": shapes stand in for the figures, and only once loading has lasted about 200 ms. */
export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex w-full flex-col gap-4 rounded-card bg-surface p-6", className)}>
      <Bar className="h-3 w-[120px] rounded-[6px]" />
      <Bar className="h-11 w-[220px] max-w-full rounded-[10px]" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex w-full items-center gap-3.5">
          <Bar className="size-11 shrink-0 rounded-icon" />
          <div className="flex flex-1 flex-col gap-2">
            <Bar className="h-3 w-full rounded-[6px]" />
            <Bar className="h-2.5 w-[120px] rounded-[5px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingLedger({ children }: { children: React.ReactNode }) {
  const shown = useDelayedReveal();
  return (
    <div
      role="status"
      aria-label="Reading your balance from Stellar"
      className={cn("w-full transition-opacity duration-200 motion-reduce:transition-none", shown ? "opacity-100" : "opacity-0")}
    >
      {shown && children}
    </div>
  );
}

/** "Cannot reach Stellar": the API is down or slow. Old numbers are never shown from memory. */
export function CannotRead({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <ErrorPanel
      illustration={<IlloProofNotConfirmed />}
      title="We cannot read your balance right now"
      body="Stellar is not answering. We would rather show nothing than a number that might be wrong."
      actions={
        <Button onClick={onRetry} loading={retrying} loadingLabel="Trying again">
          Try again
        </Button>
      }
    />
  );
}

/** "No advance yet": repayment before any advance points back to the Advance tab. */
export function NoAdvance() {
  const router = useRouter();
  return (
    <EmptyState
      illustration={<IlloNoAdvanceYet />}
      title="No advance yet"
      body="Prove your AdSense revenue to see how much you can get. Your repayments will show up here."
      action={<Button onClick={() => router.push("/advance")}>Get an advance</Button>}
    />
  );
}
