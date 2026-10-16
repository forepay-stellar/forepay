import type { ReactNode } from "react";
import { AdvanceProgress, AdvanceStepper } from "@/components/elements/AdvanceStepper";

/**
 * What 2a to 2d share: the "Advance" eyebrow and the page title, the stepper, then the step itself.
 * Desktop (1440 frame) spaces them 32 apart, a phone (390 frame) 16 apart and drops the eyebrow.
 */
export function AdvanceScreen({ title, step, children }: { title: string; step: number; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-4 lg:gap-8">
      <div className="flex flex-col gap-1.5">
        <p className="hidden text-[15px] text-brand lg:block">Advance</p>
        <h1 className="text-[30px] font-semibold tracking-[-0.9px] text-fg lg:text-[40px] lg:tracking-[-1.2px]">{title}</h1>
      </div>
      <AdvanceStepper current={step} />
      <AdvanceProgress current={step} />
      {children}
    </div>
  );
}

/** A card centred under the stepper on desktop, full width on a phone (2c, 2d and every panel). */
export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex w-full justify-center">{children}</div>;
}
