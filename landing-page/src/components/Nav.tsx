"use client";

import { Menu } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { landing } from "@/content/landing";
import { cn } from "@/lib/cn";
import { APP_URL } from "@/lib/env";
import { Mark, Wordmark } from "./brand/Logo";
import { ButtonLink } from "./Button";
import { MobileMenu } from "./MobileMenu";

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

// After the first scroll the bar gets shorter and a frosted canvas background.
function useScrolled() {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 24,
    () => false,
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const scrolled = useScrolled();
  const desktopLinks = landing.nav.links.filter((l) =>
    (landing.nav.desktopHrefs as readonly string[]).includes(l.href),
  );

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 transition-[background-color,backdrop-filter] duration-300",
          scrolled && "bg-canvas/85 backdrop-blur-md",
        )}
      >
        {/* Landing / Desktop → Nav */}
        <div
          className={cn(
            "mx-auto hidden max-w-[1440px] items-center justify-between px-20 transition-[height] duration-300 lg:flex",
            scrolled ? "h-[72px]" : "h-24",
          )}
        >
          <a href="#top" className="w-[300px]" aria-label="Forepay, back to top">
            <Wordmark aria-hidden />
          </a>
          <nav className="flex gap-9">
            {desktopLinks.map((l) => (
              <a key={l.href} href={l.href} className="text-[15px] font-medium text-fg-muted transition-colors hover:text-fg">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex w-[300px] justify-end">
            <ButtonLink href={APP_URL} size="md">
              {landing.nav.cta}
            </ButtonLink>
          </div>
        </div>

        {/* Landing / Mobile menu / Closed → Nav */}
        <div className="flex h-15 items-center justify-between px-4 lg:hidden">
          <a href="#top" aria-label="Forepay, back to top">
            <Mark aria-hidden />
          </a>
          <div className="flex items-center gap-2">
            <ButtonLink href={APP_URL} size="sm">
              {landing.nav.cta}
            </ButtonLink>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={landing.nav.menu}
              aria-expanded={open}
              className="grid size-10 place-items-center rounded-pill border border-brand bg-surface text-fg"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={open} onClose={close} />
    </>
  );
}
