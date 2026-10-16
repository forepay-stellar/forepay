import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

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
      {/* The Spinner from "04 Base components", drawn here without its own status role: the panel is the one live region. */}
      <span className="flex size-10 items-center justify-center" aria-hidden>
        <LoaderCircle className="size-8 animate-spin text-brand motion-reduce:animate-none" />
      </span>
      <h2 className="text-[19px] font-semibold tracking-[-0.3px] text-fg">{title}</h2>
      <p className="text-[14px] leading-[21px] text-fg-muted">{body}</p>
      {action && <div className="flex w-full [&>*]:flex-1">{action}</div>}
    </section>
  );
}
