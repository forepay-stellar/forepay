"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

// The FAQ accordion: rounded white cards, one open at a time, a tangerine minus on the open one.
// Answers stay mounted so they can open and close smoothly (globals.css, .faq-panel); a closed
// one is inert, so it is neither focusable nor read out.
export function Faq({ items, defaultOpen = 1 }: { items: readonly { q: string; a: string }[]; defaultOpen?: number }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const base = useId();

  return (
    <div className="flex w-full flex-col gap-2.5">
      {items.map((item, i) => {
        const isOpen = open === i;
        const answerId = `${base}-answer-${i}`;
        return (
          <div key={item.q} className="rounded-[20px] bg-surface p-[18px] lg:rounded-3xl lg:px-[calc(var(--s)*26)] lg:py-[max(16px,calc(var(--s)*22))]">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={answerId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 rounded-xl text-left text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand lg:text-[length:max(16px,calc(var(--s)*19))]"
              >
                {item.q}
                {/* A plus whose upright bar turns flat as the answer opens, making it a minus */}
                <span
                  aria-hidden
                  className={cn(
                    "relative grid size-8 shrink-0 place-items-center rounded-pill transition-colors duration-200",
                    isOpen ? "bg-brand text-fg-on-brand" : "bg-subtle text-fg",
                  )}
                >
                  <span className="absolute h-[1.75px] w-3.5 rounded-pill bg-current" />
                  <span
                    className={cn(
                      "absolute h-3.5 w-[1.75px] rounded-pill bg-current transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
                      isOpen && "rotate-90",
                    )}
                  />
                </span>
              </button>
            </h3>
            <div id={answerId} data-open={isOpen} inert={!isOpen} className="faq-panel">
              <div>
                <p className="faq-answer pt-3 text-[15px] leading-[1.55] text-fg-muted lg:text-base">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
