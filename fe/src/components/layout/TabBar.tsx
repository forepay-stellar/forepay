"use client";

import { ArrowDownToLine, ArrowUpFromLine, List, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** The three places a connected creator moves between (brief §7, "Top Nav"). */
export const APP_TABS: { href: "/advance" | "/repayment" | "/history"; label: string; icon: LucideIcon }[] = [
  { href: "/advance", label: "Advance", icon: ArrowDownToLine },
  { href: "/repayment", label: "Repayment", icon: ArrowUpFromLine },
  { href: "/history", label: "History", icon: List },
];

function useActiveTab() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

const tab =
  "rounded-pill font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-action motion-reduce:transition-none";

/** Segmented tabs from "05 Product components": the desktop tabs in the middle of the top nav. */
export function SegmentedTabs() {
  const isActive = useActiveTab();
  return (
    <nav aria-label="Main" className="flex gap-1 rounded-pill bg-action p-[5px]">
      {APP_TABS.map(({ href, label }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              tab,
              "px-2.5 py-2.5 text-[14px] nav:px-5",
              active ? "bg-brand text-fg-on-brand" : "text-fg-subtle hover:text-fg-on-brand",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile tab bar from "05 Product components": pinned 24px above the bottom of a phone screen. */
export function TabBar() {
  const isActive = useActiveTab();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-4 bottom-6 z-40 flex gap-1 rounded-pill bg-action p-1.5 md:hidden"
    >
      {APP_TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              tab,
              "flex flex-1 flex-col items-center gap-[3px] py-2 text-[11px]",
              active ? "bg-brand text-fg-on-brand" : "text-fg-subtle hover:text-fg-on-brand",
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
