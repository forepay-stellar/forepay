import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";

// Alert from "04 Base components" (hKCUV): a tinted tile, a white square with the glyph, the title and
// one sentence. Info is the brand tint, success is emerald and only ever means the thing worked, danger
// is rose and only ever means it did not.
const TONES = {
  info: { tile: "bg-brand-subtle", glyph: "text-icon", text: "text-brand-strong", Icon: CircleAlert, role: "status" },
  success: { tile: "bg-success-subtle", glyph: "text-success", text: "text-success-strong", Icon: CircleCheck, role: "status" },
  danger: { tile: "bg-danger-subtle", glyph: "text-danger", text: "text-danger", Icon: CircleAlert, role: "alert" },
} as const;

export function Alert({
  tone,
  title,
  body,
  className,
}: {
  tone: keyof typeof TONES;
  title: string;
  body: string;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div role={t.role} className={cn("flex gap-3.5 rounded-tile p-[18px]", t.tile, className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-surface">
        <t.Icon className={cn("size-[18px]", t.glyph)} aria-hidden />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <p className={cn("text-[15px] font-medium", t.text)}>{title}</p>
        <p className={cn("text-[14px] leading-[20px]", t.text)}>{body}</p>
      </div>
    </div>
  );
}
