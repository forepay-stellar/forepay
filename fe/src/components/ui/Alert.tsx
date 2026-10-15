import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";

// Alert (success) from "04 Base components". Emerald only ever means the thing worked.
export function SuccessAlert({ title, body, className }: { title: string; body: string; className?: string }) {
  return (
    <div role="status" className={cn("flex gap-3.5 rounded-tile bg-success-subtle p-[18px]", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-surface">
        <CircleCheck className="size-[18px] text-success" aria-hidden />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-[15px] font-medium text-success-strong">{title}</p>
        <p className="text-[14px] leading-[20px] text-success-strong">{body}</p>
      </div>
    </div>
  );
}
