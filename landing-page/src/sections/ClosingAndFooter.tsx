import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { landing } from "@/content/landing";
import { APP_URL, CONTRACT_URL } from "@/lib/env";

// Landing / Desktop → CTA and footer: "Paid early." in tangerine with the clay wallet over it,
// an orange sunrise rising from below, and the footer continuing the sunrise's deep orange
// down to the giant cream wordmark. Desktop measures scale with the viewport below 1440.
const v = (px: number) => `min(${(px / 14.4).toFixed(3)}vw, ${px}px)`;

// The sunrise: a soft peach halo, then the orange disc fading to the footer's deep orange.
const SUNRISE = "radial-gradient(55% 45% at 50% 5%, #F2620F, #C24A08 55%)";

function resolve(href: string) {
  if (href === "APP") return APP_URL;
  if (href === "CONTRACT") return CONTRACT_URL;
  return href;
}

function isExternal(href: string) {
  return href.startsWith("http");
}

export function ClosingAndFooter() {
  const c = landing.closing;
  const f = landing.footer;

  return (
    <div className="relative overflow-hidden">
      <section className="relative mx-auto max-w-[1440px]">
        {/* Desktop */}
        <div className="relative hidden lg:block" style={{ height: v(860) }}>
          <div
            aria-hidden
            className="absolute rounded-full bg-glow"
            style={{ left: v(-420), top: v(500), width: v(2280), height: v(1000), filter: "blur(90px)" }}
          />
          <div
            aria-hidden
            className="absolute rounded-full"
            style={{ left: v(-300), top: v(575), width: v(2040), height: v(960), background: SUNRISE, filter: "blur(40px)" }}
          />
          <h2
            className="absolute inset-x-0 text-center leading-[0.9] font-semibold tracking-[-0.048em] text-brand"
            style={{ top: v(40), fontSize: v(230) }}
          >
            {c.headline}
          </h2>
          <div className="absolute" style={{ left: v(464), top: v(105), width: v(505), height: v(525) }}>
            <Image src="/clay/sunrise-wallet.webp" alt="" fill sizes="505px" />
          </div>
          <div className="absolute inset-x-0 flex flex-col items-center gap-[18px]" style={{ top: v(640) }}>
            <ButtonLink href={APP_URL} variant="light" className="px-10 py-[22px] text-lg">
              {c.cta}
            </ButtonLink>
            <p className="w-[560px] text-center text-[17px] leading-normal text-white/85">{c.body}</p>
          </div>
        </div>

        {/* Phone */}
        <div className="relative h-[680px] lg:hidden">
          <div
            aria-hidden
            className="absolute top-[410px] left-1/2 h-[520px] w-[910px] -translate-x-1/2 rounded-full bg-glow blur-[50px]"
          />
          <div
            aria-hidden
            className="absolute top-[470px] left-1/2 h-[500px] w-[810px] -translate-x-1/2 rounded-full blur-[24px]"
            style={{ background: SUNRISE }}
          />
          {/* "Paid early." on two lines, as drawn for phones */}
          <h2 className="absolute inset-x-0 top-[30px] text-center text-[112px] leading-[0.88] font-semibold tracking-[-5.5px] text-brand">
            {c.headline.split(" ").map((word) => (
              <span key={word} className="block">
                {word}
              </span>
            ))}
          </h2>
          <div className="absolute top-[205px] left-1/2 h-[262px] w-[253px] -translate-x-1/2">
            <Image src="/clay/sunrise-wallet.webp" alt="" fill sizes="253px" />
          </div>
          <div className="absolute inset-x-5 top-[500px] flex flex-col items-center gap-3.5">
            <ButtonLink href={APP_URL} variant="light" size="menu" className="w-full">
              {c.cta}
            </ButtonLink>
            <p className="text-center text-[15px] leading-normal text-white/85">{c.body}</p>
          </div>
        </div>
      </section>

      <footer className="relative bg-footer text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-9 px-5 pt-7 lg:gap-[72px] lg:px-20 lg:pt-16">
          <div className="flex flex-col gap-9 lg:flex-row lg:gap-24">
            <p className="text-[15px] leading-normal text-white/80 lg:w-[320px] lg:flex-1 lg:text-base">
              <span className="block lg:max-w-[320px]">{f.line}</span>
            </p>
            <nav aria-label="Footer" className="flex gap-6 lg:gap-24">
              {f.columns.map((col) => (
                <div key={col.heading} className="flex flex-1 flex-col gap-2.5 lg:w-[200px] lg:flex-none lg:gap-3">
                  <h2 className="text-sm font-semibold lg:text-[15px]">{col.heading}</h2>
                  <ul className="flex flex-col gap-2.5 lg:gap-3">
                    {col.links.map((l) => {
                      const href = resolve(l.href);
                      return (
                        <li key={l.label}>
                          <a
                            href={href}
                            {...(isExternal(href) ? { target: "_blank", rel: "noreferrer" } : {})}
                            className="text-sm text-white/80 transition-colors hover:text-white lg:text-[15px]"
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
          <div className="flex flex-col gap-1.5 border-t border-white/20 pt-[18px] text-[13px] text-white/70 lg:flex-row lg:justify-between lg:pt-5 lg:text-sm">
            <span>{f.legal}</span>
            <span>{f.testnet}</span>
          </div>
          <div className="h-[60px] overflow-hidden lg:h-[240px]">
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
    </div>
  );
}
