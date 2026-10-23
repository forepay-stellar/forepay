import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Error panel from "05 Product components": a white card with a spot illustration, a title that says
// what happened, one sentence on what to do, and the actions. Never "Something went wrong".
export function ErrorPanel({
  illustration,
  title,
  body,
  actions,
  centered = false,
  stacked = false,
  row = false,
  className,
}: {
  illustration: ReactNode;
  title: string;
  body: string;
  actions: ReactNode;
  /** Most panels on the board centre their title; "Wrong network" and "Wallet locked" do not. */
  centered?: boolean;
  /** Actions one above the other at every width, as the board draws some panels. */
  stacked?: boolean;
  /**
   * Two actions side by side on a phone too. Only for a pair whose labels fit on one line at 320, such
   * as "Try again" and "Back" (section 08).
   */
  row?: boolean;
  className?: string;
}) {
  return (
    <section
      role="alert"
      className={cn(
        "flex w-full max-w-[400px] flex-col gap-3.5 rounded-card bg-surface p-6",
        centered && "items-center",
        className,
      )}
    >
      <div className="flex w-full justify-center">{illustration}</div>
      <h2 className="text-card-title text-fg">{title}</h2>
      <p className="w-full text-body text-fg-muted">{body}</p>
      {/* Section 08: under 768 two buttons sit one under the other, the main one (passed first) on top,
          unless the pair fits at 320 (`row`). */}
      <div
        className={cn(
          "flex w-full gap-2.5",
          stacked ? "flex-col" : row ? "[&>*]:flex-1" : "flex-col md:flex-row md:[&>*]:flex-1",
        )}
      >
        {actions}
      </div>
    </section>
  );
}
