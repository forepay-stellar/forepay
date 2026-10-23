import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The canvas-coloured box of label and value rows on 2c and 2d. */
export function DetailRows({ rows }: { rows: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="flex w-full flex-col gap-3 rounded-tile bg-canvas p-[18px]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <dt className="text-body text-fg-muted">{r.label}</dt>
          <dd className={cn("text-body font-medium text-fg", r.mono && "font-mono")}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
