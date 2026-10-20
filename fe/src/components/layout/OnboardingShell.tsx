import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Mark, Wordmark } from "@/components/brand/Logo";
import { OnboardingProgress, OnboardingStepper } from "@/components/elements/OnboardingStepper";
import { NetworkChip } from "@/components/ui/NetworkChip";
import { cn } from "@/lib/cn";

/**
 * The frame every onboarding step shares (01 Onboarding, 1a to 1c).
 *
 * Desktop (lg, 1440 frame): a 90px top bar with the wordmark, the step bars and the Testnet chip, then
 * one centred 520px column. A phone (390 frame): a 60px header with the mark or a back button, the
 * "Step 2 of 3" segments, the content, and the actions pinned to the bottom.
 */
export function OnboardingShell({
  step,
  onBack,
  wallet,
  narrow = false,
  children,
  actions,
}: {
  step: number;
  /** A 400px column, for the error panels, so "Back" lines up with the panel. */
  narrow?: boolean;
  /** 1b only. Desktop shows "Back" above the column, a phone shows a round back button in the header. */
  onBack?: () => void;
  /** The wallet chip, once a wallet is connected. */
  wallet?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // Section 08: a 32px gutter on a tablet, 40 at 1024, 80 from 1280.
    <div className="flex min-h-dvh flex-col bg-canvas md:px-8 lg:px-10 xl:px-20">
      {/* Top bar, from 768. On a tablet the three sit side by side as drawn (wordmark, the 480 stepper,
          the chips). From 1024 the outer two columns are equal and at least as wide as the widest chips,
          so the stepper stays centred and keeps its place from step to step whatever the wallet chip
          says. */}
      <header className="mx-auto hidden h-[90px] w-full grid-cols-[auto_minmax(0,480px)_auto] items-center justify-between gap-[18px] md:grid lg:max-w-[1200px] lg:grid-cols-[minmax(15.5rem,1fr)_minmax(0,480px)_minmax(15.5rem,1fr)] lg:gap-6">
        <div className="flex">
          <Wordmark />
        </div>
        <OnboardingStepper current={step} />
        <div className="flex items-center justify-end gap-2.5">
          <NetworkChip />
          {wallet}
        </div>
      </header>

      {/* Phone header */}
      <header className="flex h-[60px] items-center justify-between px-4 md:hidden">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex size-10 items-center justify-center rounded-pill bg-surface text-fg outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        ) : (
          <Mark />
        )}
        <div className="flex items-center gap-2">
          <NetworkChip />
          {wallet}
        </div>
      </header>
      <div className="md:hidden">
        <OnboardingProgress current={step} />
      </div>

      {/* From 768 the column is centred in the page, as on the tablet and desktop frames. */}
      <main className="flex flex-1 flex-col md:items-center md:justify-center md:py-10">
        <div
          className={cn(
            "flex w-full flex-1 flex-col items-center gap-4 px-5 pt-5 md:flex-none md:gap-5 md:px-0 md:pt-0",
            narrow ? "md:w-[400px]" : "md:w-[520px]",
          )}
        >
          {onBack && (
            <div className="hidden w-full md:flex">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-2 rounded-pill py-2 text-small font-medium text-brand-strong outline-none hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Back
              </button>
            </div>
          )}
          {children}
          {actions && (
            <div className="mt-auto flex w-full flex-col items-center gap-3 pb-8 pt-4 md:mt-0 md:contents">
              {actions}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** Title and body of a step, sized for a phone and for the 520px column from a tablet up. */
export function StepText({ title, body, extra }: { title: string; body: string; extra?: string }) {
  return (
    <>
      <h1 className="w-full text-center text-page-title text-fg">
        {title}
      </h1>
      <p className="w-full text-center text-body text-fg-muted">
        {body}
      </p>
      {extra && <p className="w-full text-center text-body text-fg-muted">{extra}</p>}
    </>
  );
}
