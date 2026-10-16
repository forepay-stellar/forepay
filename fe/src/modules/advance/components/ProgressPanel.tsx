import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The waiting panels on the Prove and accept board (rows 1 and 4): a spinner, what is happening and
 * what to do meanwhile. Same card as the error panel, so a failure replaces it in place.
 */
export function ProgressPanel({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex w-full max-w-[400px] flex-col gap-3.5 rounded-card bg-surface p-6"
    >
      <Spinner />
      <h2 className="text-[19px] font-semibold tracking-[-0.3px] text-fg">{title}</h2>
      <p className="text-[14px] leading-[21px] text-fg-muted">{body}</p>
      {action && <div className="flex w-full [&>*]:flex-1">{action}</div>}
    </section>
  );
}
