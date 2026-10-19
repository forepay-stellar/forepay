import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { ScrollLift } from "@/components/ScrollLift";
import { landing } from "@/content/landing";
import { APP_URL, CONTRACT_URL } from "@/lib/env";

// Landing / Desktop → CTA and footer: "Paid early." in tangerine with the clay wallet over it,
// an orange sunrise rising from below, and the footer continuing the sunrise's deep orange
// down to the giant cream wordmark. Desktop measures are the design's pixels times --s
// (globals.css), so the section shrinks with the width and the height; everything is centred.
const S = (px: number) => `calc(var(--s) * ${px})`;
// A design x position measured from the 1440 frame's centre, kept centred at any width.
const fromCentre = (x: number) => `calc(50% + var(--s) * ${x - 720})`;
// Landing / Tablet → CTA (834 × 760): the same composition, one design pixel is --t.
const T = (px: number) => `calc(var(--t) * ${px})`;

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
        <div className="relative hidden lg:block" style={{ height: S(860) }}>
          {/* The sunrise rises as the section scrolls in */}
          <ScrollLift from={120} to={-40} className="absolute inset-0">
            <div
              aria-hidden
              className="absolute rounded-full bg-glow"
              style={{ left: fromCentre(-420), top: S(500), width: S(2280), height: S(1000), filter: "blur(90px)" }}
            />
            <div
              aria-hidden
              className="absolute rounded-full"
              style={{ left: fromCentre(-300), top: S(575), width: S(2040), height: S(960), background: SUNRISE, filter: "blur(40px)" }}
            />
          </ScrollLift>
          <h2
            className="absolute inset-x-0 text-center leading-[0.9] font-semibold tracking-[-0.048em] text-brand"
            style={{ top: S(40), fontSize: S(230) }}
          >
            {c.headline}
          </h2>
          <div className="absolute" style={{ left: fromCentre(464), top: S(105), width: S(505), height: S(525) }}>
            <Image src="/clay/sunrise-wallet.webp" alt="" fill sizes="505px" />
          </div>
          <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: S(640), gap: S(18) }}>
            <ButtonLink
              href={APP_URL}
              variant="light"
              className="px-[calc(var(--s)*40)] py-[calc(var(--s)*22)] text-[length:max(15px,calc(var(--s)*18))]"
            >
              {c.cta}
            </ButtonLink>
            <p
              className="text-center leading-normal text-white/85"
              style={{ width: `max(440px, ${S(560)})`, fontSize: `max(15px, ${S(17)})` }}
            >
              {c.body}
            </p>
          </div>
        </div>

        {/* Tablet */}
        <div className="relative hidden md:block lg:hidden" style={{ height: T(760) }}>
          <ScrollLift from={100} to={-30} className="absolute inset-0">
            <div
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 rounded-full bg-glow"
              style={{ top: T(420), width: T(1360), height: T(600), filter: "blur(70px)" }}
            />
            <div
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 rounded-full"
              style={{ top: T(465), width: T(1220), height: T(576), background: SUNRISE, filter: "blur(30px)" }}
            />
          </ScrollLift>
          <h2
            className="absolute inset-x-0 text-center leading-[0.9] font-semibold tracking-[-0.048em] text-brand"
            style={{ top: T(36), fontSize: T(150) }}
          >
            {c.headline}
          </h2>
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: T(84), width: T(404), height: T(420) }}>
            <Image src="/clay/sunrise-wallet.webp" alt="" fill sizes="404px" />
          </div>
          <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: T(560), gap: T(18) }}>
            <ButtonLink
              href={APP_URL}
              variant="light"
              className="px-[calc(var(--t)*40)] py-[calc(var(--t)*22)] text-[length:max(15px,calc(var(--t)*18))]"
            >
              {c.cta}
            </ButtonLink>
            <p
              className="text-center leading-normal text-white/85"
              style={{ width: `min(90vw, ${T(560)})`, fontSize: `max(15px, ${T(17)})` }}
            >
              {c.body}
            </p>
          </div>
        </div>

        {/* Phone */}
        <div className="relative h-[680px] md:hidden">
          <ScrollLift from={80} to={-30} className="absolute inset-0">
            <div
              aria-hidden
              className="absolute top-[410px] left-1/2 h-[520px] w-[910px] -translate-x-1/2 rounded-full bg-glow blur-[50px]"
            />
            <div
              aria-hidden
              className="absolute top-[470px] left-1/2 h-[500px] w-[810px] -translate-x-1/2 rounded-full blur-[24px]"
              style={{ background: SUNRISE }}
            />
          </ScrollLift>
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

      {/* The top of the footer fades in from clear, so the sunrise runs into it without a line */}
      <footer className="relative bg-[linear-gradient(to_bottom,transparent,var(--color-footer)_200px)] text-white">
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
                      const href = resolve(l.href);
                      return (
                        <li key={l.label}>
                          <a
                            href={href}
                            {...(isExternal(href) ? { target: "_blank", rel: "noreferrer" } : {})}
                            className="text-sm text-white/80 transition-colors hover:text-white md:text-[15px]"
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
            <span>{f.legal}</span>
            <span>{f.testnet}</span>
          </div>
          <div className="h-[60px] overflow-hidden md:h-[calc(var(--t)*141)] lg:h-[240px]">
            <Image
              src="/brand/wordmark-cream.webp"
              alt="Forepay"
              width={1283}
              height={191}
              sizes="(min-width: 1440px) 1280px, 90vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
