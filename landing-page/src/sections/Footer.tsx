import Image from "next/image";
import Link from "next/link";
import { landing } from "@/content/landing";
import { cn } from "@/lib/cn";
import { APP_URL, CONTRACT_URL } from "@/lib/env";

// Landing / Footer from forepay.pen, shared by the home page and the legal pages (#85).
// On the home page its top fades in from clear, so the closing sunrise runs into it without a
// line; on a page with no sunrise above it, it is solid. Section links point back to the home
// page from anywhere else.
function resolve(href: string, onHome: boolean) {
  if (href === "APP") return APP_URL;
  if (href === "CONTRACT") return CONTRACT_URL;
  if (href.startsWith("#") && !onHome) return `/${href}`;
  return href;
}

function isExternal(href: string) {
  return href.startsWith("http");
}

const LINK = "text-white/80 transition-colors hover:text-white";

export function Footer({ onHome = false }: { onHome?: boolean }) {
  const f = landing.footer;

  return (
    <footer
      className={cn(
        "relative text-white",
        onHome ? "bg-[linear-gradient(to_bottom,transparent,var(--color-footer)_200px)]" : "bg-footer",
      )}
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-9 px-5 pt-7 md:gap-[calc(var(--t)*56)] md:px-[calc(var(--t)*40)] md:pt-[calc(var(--t)*56)] lg:gap-[72px] lg:px-20 lg:pt-16">
        <div className="flex flex-col gap-9 md:flex-row md:gap-12 lg:gap-24">
          <p className="text-[15px] leading-normal text-white/80 md:flex-1 md:text-base lg:w-[320px]">
            <span className="block md:max-w-[300px] lg:max-w-[320px]">{f.line}</span>
          </p>
          <nav aria-label="Footer" className="flex gap-6 md:gap-12 lg:gap-24">
            {f.columns.map((col) => (
              <div key={col.heading} className="flex flex-1 flex-col gap-2.5 md:w-[160px] md:flex-none md:gap-3 lg:w-[200px]">
                <h2 className="text-sm font-semibold md:text-[15px]">{col.heading}</h2>
                <ul className="flex flex-col gap-2.5 md:gap-3">
                  {col.links.map((l) => {
                    const href = resolve(l.href, onHome);
                    return (
                      <li key={l.label}>
                        <a
                          href={href}
                          {...(isExternal(href) ? { target: "_blank", rel: "noreferrer" } : {})}
                          className={cn(LINK, "text-sm md:text-[15px]")}
                        >
                          {l.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-white/20 pt-[18px] text-[13px] text-white/70 md:flex-row md:justify-between md:pt-5 md:text-sm">
          <div className="flex flex-col gap-1.5 md:flex-row md:gap-6">
            <span>{f.legal}</span>
            <span className="flex gap-4">
              {f.legalLinks.map((l) => (
                <Link key={l.href} href={l.href} className={LINK}>
                  {l.label}
                </Link>
              ))}
            </span>
          </div>
          <span>{f.testnet}</span>
        </div>
        <div className="h-[60px] overflow-hidden md:h-[calc(var(--t)*141)] lg:h-[240px]">
          <Image
            src="/brand/wordmark-cream.webp"
            alt="Forepay"
            width={1283}
            height={204}
            sizes="(min-width: 1440px) 1280px, 90vw"
            className="h-auto w-full"
          />
        </div>
      </div>
    </footer>
  );
}
