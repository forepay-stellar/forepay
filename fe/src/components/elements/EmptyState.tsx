import type { ReactNode } from "react";

// Empty state from "05 Product components": a white card with a spot illustration, a centred title and
// body, and one action under them.
export function EmptyState({
  illustration,
  title,
  body,
  action,
}: {
  illustration: ReactNode;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <section className="flex w-full max-w-[440px] flex-col items-center gap-4 rounded-card bg-surface px-7 py-10">
      <div className="flex w-full justify-center">{illustration}</div>
      <h2 className="text-[20px] font-semibold tracking-[-0.3px] text-fg">{title}</h2>
      <p className="w-full max-w-[320px] text-center text-[15px] leading-[23px] text-fg-muted">{body}</p>
      {action}
    </section>
  );
}
