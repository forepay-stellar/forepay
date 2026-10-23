import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { ScrollLift } from "@/components/ScrollLift";
import { landing } from "@/content/landing";
import { APP_URL } from "@/lib/env";
import { Footer } from "./Footer";

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

export function ClosingAndFooter() {
  const c = landing.closing;

  return (
    <div className="relative overflow-hidden">
      <section className="relative mx-auto max-w-[1440px]">
        {/* Desktop */}
        <div className="relative hidden lg:block" style={{ height: S(860) }}>
          {/* The sunrise rises as the section scrolls in. Its wrapper gets its own layer
              (will-change), so the large blurs are drawn once and only moved while scrolling;
              without it they were repainted every frame and the footer stuttered. */}
          <ScrollLift from={120} to={-40} className="absolute inset-0 will-change-transform">
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
          <ScrollLift from={100} to={-30} className="absolute inset-0 will-change-transform">
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
          <ScrollLift from={80} to={-30} className="absolute inset-0 will-change-transform">
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

      <Footer onHome />
    </div>
  );
}
