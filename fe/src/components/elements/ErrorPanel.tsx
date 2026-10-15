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
  className,
}: {
  illustration: ReactNode;
  title: string;
  body: string;
  actions: ReactNode;
  /** Most panels on the board centre their title; "Wrong network" and "Wallet locked" do not. */
  centered?: boolean;
  /** Actions one above the other, for labels too long to share a row. */
  stacked?: boolean;
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
      <h2 className="text-[19px] font-semibold tracking-[-0.3px] text-fg">{title}</h2>
      <p className="w-full text-[14px] leading-[21px] text-fg-muted">{body}</p>
      <div className={cn("flex w-full gap-2.5", stacked ? "flex-col" : "[&>*]:flex-1")}>{actions}</div>
    </section>
  );
}
