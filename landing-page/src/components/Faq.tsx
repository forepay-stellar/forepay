"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

// The FAQ accordion: rounded white cards, one open at a time, a tangerine minus on the open one.
export function Faq({ items, defaultOpen = 1 }: { items: readonly { q: string; a: string }[]; defaultOpen?: number }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const base = useId();

  return (
    <div className="flex w-full flex-col gap-2.5">
      {items.map((item, i) => {
        const isOpen = open === i;
        const answerId = `${base}-answer-${i}`;
        return (
          <div key={item.q} className="rounded-[20px] bg-surface p-[18px] lg:rounded-3xl lg:px-[26px] lg:py-[22px]">
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={isOpen ? answerId : undefined}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 rounded-xl text-left text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand lg:text-[19px]"
              >
                {item.q}
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-pill transition-colors",
                    isOpen ? "bg-brand text-fg-on-brand" : "bg-subtle text-fg",
                  )}
                >
                  {isOpen ? <Minus size={16} /> : <Plus size={16} />}
                </span>
              </button>
            </h3>
            {isOpen && (
              <p id={answerId} className="faq-answer mt-3 text-[15px] leading-[1.55] text-fg-muted lg:text-base">
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
