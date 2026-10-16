import { CircleAlert } from "lucide-react";
import type { FailureCopy } from "@/lib/errors";

// Alert (danger) from "04 Base components", as the repayment board's "Did not go through" draws it:
// rose tile, a white square with the alert glyph, the title and one sentence on what happens next.
export function FailureAlert({ failure }: { failure: FailureCopy }) {
  return (
    <div role="alert" className="flex w-full gap-3.5 rounded-tile bg-danger-subtle p-[18px]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-surface">
        <CircleAlert className="size-[18px] text-danger" aria-hidden />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-[15px] font-medium text-danger">{failure.title}</p>
        <p className="text-[14px] leading-[20px] text-danger">{failure.body}</p>
      </div>
    </div>
  );
}
