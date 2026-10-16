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
    <div className="flex min-h-dvh flex-col bg-canvas lg:px-20">
      {/* Desktop top bar */}
      {/* Three columns, the outer two equal, so the stepper stays centred whatever the wallet chip says. */}
      <header className="hidden h-[90px] grid-cols-[1fr_minmax(0,480px)_1fr] items-center gap-6 lg:grid">
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
      <header className="flex h-[60px] items-center justify-between px-4 lg:hidden">
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
      <div className="lg:hidden">
        <OnboardingProgress current={step} />
      </div>

      <main className="flex flex-1 flex-col lg:items-center lg:justify-center">
        <div
          className={cn(
            "flex w-full flex-1 flex-col items-center gap-4 px-5 pt-5 lg:flex-none lg:gap-5 lg:px-0 lg:pt-0",
            narrow ? "lg:w-[400px]" : "lg:w-[520px]",
          )}
        >
          {onBack && (
            <div className="hidden w-full lg:flex">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-2 rounded-pill py-2 text-[14px] font-medium text-brand-strong outline-none hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Back
              </button>
            </div>
          )}
          {children}
          {actions && (
            <div className="mt-auto flex w-full flex-col items-center gap-3 pb-8 pt-4 lg:mt-0 lg:contents">
              {actions}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** Title and body of a step, sized for a phone and for the 520px desktop column. */
export function StepText({ title, body, extra }: { title: string; body: string; extra?: string }) {
  return (
    <>
      <h1 className="w-full text-center text-[28px] font-semibold leading-[30px] tracking-[-0.8px] text-fg lg:text-[44px] lg:leading-[46px] lg:tracking-[-1.3px]">
        {title}
      </h1>
      <p className="w-full text-center text-[15px] leading-[23px] text-fg-muted lg:text-[17px] lg:leading-[26px]">
        {body}
      </p>
      {extra && <p className="w-full text-center text-[14px] leading-[21px] text-fg-muted">{extra}</p>}
    </>
  );
}
