import { ArrowUpRight } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Link from "04 Base components": rust text, with the arrow only when it leaves Forepay.
const base =
  "inline-flex items-center gap-1 rounded-sm text-small font-medium text-brand-strong hover:underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function ExternalLink({ className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a target="_blank" rel="noreferrer" className={cn(base, className)} {...rest}>
      {children}
      <ArrowUpRight className="size-[15px]" aria-hidden />
    </a>
  );
}

export function TextButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn(base, className)} {...rest} />;
}
