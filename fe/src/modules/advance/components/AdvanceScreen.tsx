"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AdvanceProgress, AdvanceStepper } from "@/components/elements/AdvanceStepper";

/**
 * What 2a to 2d share: the "Advance" eyebrow and the page title, the stepper, then the step itself.
 * Desktop (1440 frame) spaces them 32 apart, a phone (390 frame) 16 apart and drops the eyebrow.
 */
export function AdvanceScreen({
  title,
  step,
  focusKey,
  children,
}: {
  title: string;
  step: number;
  /** Changes whenever what is on screen changes. Focus then moves to the new card's heading. */
  focusKey: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  // The key focus was last moved for. Starts as the first key, so first load never moves focus, even
  // when Strict Mode runs the effect twice.
  const focusedFor = useRef(focusKey);
  // A press that swaps the card (Prove, Accept, Try again) would leave keyboard and screen reader
  // users on a button that is gone. Put them on what replaced it: the element a card marks with
  // `data-focus` (the offer), or else its first heading.
  useEffect(() => {
    if (focusedFor.current === focusKey) return;
    focusedFor.current = focusKey;
    const heading = root.current?.querySelector<HTMLElement>("[data-focus]") ?? root.current?.querySelector<HTMLElement>("h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <div ref={root} className="flex w-full flex-col gap-4 lg:gap-8 lg:pt-8 [&_[data-focus]:focus]:outline-none [&_h2:focus]:outline-none">
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
