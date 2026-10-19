"use client";

import { ArrowUpRight, FlaskConical, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { lockScroll } from "@/lib/scroll";
import { landing } from "@/content/landing";
import { APP_URL } from "@/lib/env";
import { Mark } from "./brand/Logo";
import { ButtonLink } from "./Button";

// Landing / Mobile menu / Open. Opening: the overlay fades in over 200 ms, the links rise
// 16 px one after another (40 ms apart), the button and the testnet line come last. Closing plays
// the same motion backwards and a little faster: the bottom goes first, the links sink from the
// last one up, then the overlay fades. The menu stays mounted until that has finished.
// The whole close, in ms: the overlay's fade (globals.css) starts at 160 and lasts 180.
const CLOSE_MS = 340;

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const firstLink = useRef<HTMLAnchorElement>(null);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  // Follow `open` during render, so the closing frames start in the same paint.
  if (open && (!mounted || closing)) {
    setMounted(true);
    setClosing(false);
  }
  if (!open && mounted && !closing) setClosing(true);

  useEffect(() => {
    if (!closing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setMounted(false), reduced ? 0 : CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (!open) return;
    const unlock = lockScroll();
    firstLink.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      unlock();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  const links = landing.nav.links.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      inert={closing}
      data-closing={closing || undefined}
      className="menu-enter fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas lg:hidden"
    >
      <div className="flex h-15 shrink-0 items-center justify-between px-4">
        <Mark />
        <button
          type="button"
          onClick={onClose}
          aria-label={landing.nav.close}
          className="grid size-10 place-items-center rounded-pill bg-action text-fg-on-brand"
        >
          <X size={18} />
        </button>
      </div>
      <nav className="flex flex-col px-5 pt-7">
        {landing.nav.links.map((link, i) => (
          <a
            key={link.href}
            ref={i === 0 ? firstLink : undefined}
            href={link.href}
            onClick={onClose}
            style={{ animationDelay: closing ? `${60 + (links - 1 - i) * 30}ms` : `${120 + i * 40}ms` }}
            className="menu-link flex items-center justify-between border-b border-line-strong py-[18px] outline-none focus-visible:bg-subtle"
          >
            <span className="flex items-end gap-3.5">
              <span className="font-mono text-[13px] leading-[2.2] text-fg-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[40px] leading-none font-medium tracking-[-1.4px]">{link.label}</span>
            </span>
            <ArrowUpRight size={24} className="text-fg-subtle" aria-hidden />
          </a>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="menu-bottom relative flex flex-col items-center gap-3.5 px-5 pb-9">
        <div
          aria-hidden
          className="pointer-events-none absolute top-[60px] left-1/2 h-[400px] w-[790px] -translate-x-1/2 rounded-full bg-[radial-gradient(50%_50%_at_50%_30%,#F8A97A99,#F8A97A00)] blur-[30px]"
        />
        <ButtonLink href={APP_URL} size="menu" className="relative w-full">
          {landing.nav.cta}
        </ButtonLink>
        <span className="relative flex items-center gap-2 text-[13px] text-fg-subtle">
          <FlaskConical size={14} aria-hidden /> {landing.footer.testnet}
        </span>
      </div>
    </div>
  );
}
