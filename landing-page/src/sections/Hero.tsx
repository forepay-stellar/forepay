import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { landing } from "@/content/landing";
import { APP_URL } from "@/lib/env";
import { HeroScene } from "./HeroScene";
import { HeroWordsDrift } from "./HeroWordsDrift";

// Landing / Desktop → Hero (1440 × 860) and Landing / Mobile → Hero (option C).
// Desktop measures are the design's pixels times --u (see below), so the composition holds from
// 1024 wide up, and on short screens too.
// The design's 20 × 34 px, 17 px buttons, in design pixels.
const HERO_BUTTON = "px-[calc(var(--u)*34)] py-[calc(var(--u)*20)] text-[length:max(14px,calc(var(--u)*17))]";

export function Hero() {
  const h = landing.hero;
  const giant = "font-semibold leading-[0.9] tracking-[-0.047em] text-fg";

  return (
    <section aria-labelledby="hero-title" className="relative mx-auto max-w-[1440px] overflow-hidden">
      {/* Desktop. --u is one design pixel: the design is 1440 × 860 under a 96 px nav, so the hero
          scales with whichever is tighter, the width or the height left under the nav, and always
          fits the first screen. Side gutters follow the width only, to line up with the nav. */}
      <div
        className="relative hidden h-[calc(var(--u)*860)] lg:block"
        style={{ "--u": "max(0.68px, min(1px, calc(100vw / 1440), calc((100svh - 96px) / 860)))" } as React.CSSProperties}
      >
        <h1 id="hero-title" className={`${giant} text-[calc(var(--u)*180)]`}>
          <span data-hero-word="left" className="absolute top-[calc(var(--u)*60)] left-[min(5.6vw,80px)]">
            <span className="hero-word-in inline-block">{h.wordLeft}</span>
          </span>{" "}
          <span data-hero-word="right" className="absolute top-[calc(var(--u)*470)] right-[min(5.6vw,80px)]">
            <span className="hero-word-in inline-block [animation-delay:80ms]">{h.wordRight}</span>
          </span>
        </h1>
        <div
          data-hero-stage
          className="absolute top-[calc(var(--u)*60)] left-1/2 h-[calc(var(--u)*640)] w-[calc(var(--u)*616)] -translate-x-1/2"
        >
          <Image src="/clay/hero-still.webp" alt="" fill priority sizes="616px" className="object-contain" />
          <HeroScene media="(min-width: 1024px)" />
        </div>
        {/* The copy and buttons shrink with --u too, so on a short screen they never meet "Early";
            floors keep the text readable. */}
        <div className="absolute bottom-[calc(var(--u)*88)] left-[min(5.6vw,80px)] flex w-[min(30.5vw,440px)] flex-col gap-[calc(var(--u)*14)]">
          <span className="text-[length:max(13px,calc(var(--u)*15))] font-medium text-brand-strong">{h.eyebrow}</span>
          <p className="text-[length:max(15px,calc(var(--u)*18))] leading-normal text-fg-muted">{h.body}</p>
        </div>
        <div className="absolute right-[min(5.6vw,80px)] bottom-[calc(var(--u)*88)] flex flex-col items-end gap-[calc(var(--u)*14)]">
          <div className="flex gap-[calc(var(--u)*12)]">
            <ButtonLink href={APP_URL} className={HERO_BUTTON}>
              {h.primary}
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="outline" className={`${HERO_BUTTON} px-[calc(var(--u)*30)]`}>
              {h.secondary}
            </ButtonLink>
          </div>
          <span className="text-[length:max(12px,calc(var(--u)*14))] text-fg-subtle">{h.note}</span>
        </div>
      </div>

      {/* Phone: the scene, then "Paid Early" on one line, then copy and two full width buttons */}
      <div className="lg:hidden">
        <div className="relative h-[327px]">
          <div data-hero-stage className="absolute -top-[21px] left-1/2 h-[287px] w-[276px] -translate-x-1/2">
            <Image src="/clay/hero-still.webp" alt="" fill priority sizes="276px" className="object-contain" />
            <HeroScene media="(max-width: 1023.98px)" />
          </div>
          <h1 className="hero-word-in absolute inset-x-0 top-[244px] text-center text-[76px] leading-[0.88] font-semibold tracking-[-3.6px] whitespace-nowrap text-fg">
            {`${h.wordLeft} ${h.wordRight}`}
          </h1>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-10">
          <span className="text-sm font-medium text-brand-strong">{h.eyebrow}</span>
          <p className="text-[17px] leading-normal text-fg-muted">{h.body}</p>
          <div className="flex flex-col gap-2.5">
            <ButtonLink href={APP_URL} size="menu" className="w-full">
              {h.primary}
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="outline" size="menu" className="w-full">
              {h.secondary}
            </ButtonLink>
          </div>
        </div>
      </div>
      <HeroWordsDrift />
    </section>
  );
}
