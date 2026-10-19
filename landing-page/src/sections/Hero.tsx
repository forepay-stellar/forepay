import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { landing } from "@/content/landing";
import { APP_URL } from "@/lib/env";
import { HeroScene } from "./HeroScene";
import { HeroWordsDrift } from "./HeroWordsDrift";

// Landing / Desktop → Hero (1440 × 860), Landing / Tablet → Hero (834 × 980) and
// Landing / Mobile → Hero (option C).
// Desktop measures are the design's pixels times --u (see below), so the composition holds from
// 1024 wide up, and on short screens too.
// The design's 20 × 34 px, 17 px buttons, in design pixels.
const HERO_BUTTON = "px-[calc(var(--u)*34)] py-[calc(var(--u)*20)] text-[length:max(14px,calc(var(--u)*17))]";
const TABLET_BUTTON = "px-[calc(var(--th)*34)] py-[calc(var(--th)*20)] text-[length:max(14px,calc(var(--th)*17))]";
// Tablet measures: --th is one design pixel of the 834 wide tablet hero, held to the height left
// under the 80 px nav so a short screen still sees the whole hero; gutters follow the width.
const th = (px: number) => `calc(var(--th) * ${px})`;
const TABLET_GUTTER = "calc(100vw * 40 / 834)";

// One span per letter, so the intro can raise them one by one from under their line. Screen
// readers get the word whole.
function Letters({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden data-hero-line className="inline-block">
        {[...text].map((ch, i) => (
          <span key={i} data-hero-letter className="inline-block">
            {ch}
          </span>
        ))}
      </span>
    </>
  );
}

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
            <span className="hero-word-in inline-block">
              <Letters text={h.wordLeft} />
            </span>
          </span>{" "}
          <span data-hero-word="right" className="absolute top-[calc(var(--u)*470)] right-[min(5.6vw,80px)]">
            <span className="hero-word-in inline-block [animation-delay:80ms]">
              <Letters text={h.wordRight} />
            </span>
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
          <span data-hero-rise className="text-[length:max(13px,calc(var(--u)*15))] font-medium text-brand-strong">{h.eyebrow}</span>
          <p data-hero-rise className="text-[length:max(15px,calc(var(--u)*18))] leading-normal text-fg-muted">{h.body}</p>
        </div>
        <div className="absolute right-[min(5.6vw,80px)] bottom-[calc(var(--u)*88)] flex flex-col items-end gap-[calc(var(--u)*14)]">
          <div data-hero-rise className="flex gap-[calc(var(--u)*12)]">
            <ButtonLink href={APP_URL} className={HERO_BUTTON}>
              {h.primary}
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="outline" className={`${HERO_BUTTON} px-[calc(var(--u)*30)]`}>
              {h.secondary}
            </ButtonLink>
          </div>
          <span data-hero-rise className="text-[length:max(12px,calc(var(--u)*14))] text-fg-subtle">{h.note}</span>
        </div>
      </div>

      {/* Tablet: "Paid" over the scene, "Early" under it on the right, copy left, buttons right */}
      <div
        className="relative hidden md:block lg:hidden"
        style={{ height: th(980), "--th": "max(0.6px, min(calc(100vw / 834), calc((100svh - 80px) / 900)))" } as React.CSSProperties}
      >
        <h1 className={giant} style={{ fontSize: th(180) }}>
          <span data-hero-word="left" className="absolute" style={{ top: th(56), left: TABLET_GUTTER }}>
            <span className="hero-word-in inline-block">
              <Letters text={h.wordLeft} />
            </span>
          </span>{" "}
          <span data-hero-word="right" className="absolute" style={{ top: th(580), right: TABLET_GUTTER }}>
            <span className="hero-word-in inline-block [animation-delay:80ms]">
              <Letters text={h.wordRight} />
            </span>
          </span>
        </h1>
        <div data-hero-stage className="absolute left-1/2 -translate-x-1/2" style={{ top: th(140), width: th(493), height: th(512) }}>
          <Image src="/clay/hero-still.webp" alt="" fill priority sizes="493px" className="object-contain" />
          <HeroScene media="(min-width: 768px) and (max-width: 1023.98px)" />
        </div>
        <div className="absolute flex flex-col" style={{ left: TABLET_GUTTER, top: th(808), width: th(360), gap: th(14) }}>
          <span data-hero-rise className="font-medium text-brand-strong" style={{ fontSize: `max(13px, ${th(15)})` }}>
            {h.eyebrow}
          </span>
          <p data-hero-rise className="leading-normal text-fg-muted" style={{ fontSize: `max(15px, ${th(18)})` }}>
            {h.body}
          </p>
        </div>
        <div className="absolute flex flex-col items-end" style={{ right: TABLET_GUTTER, top: th(826), gap: th(14) }}>
          <div data-hero-rise className="flex" style={{ gap: th(12) }}>
            <ButtonLink href={APP_URL} className={TABLET_BUTTON}>
              {h.primary}
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="outline" className={`${TABLET_BUTTON} px-[calc(var(--th)*30)]`}>
              {h.secondary}
            </ButtonLink>
          </div>
          <span data-hero-rise className="text-fg-subtle" style={{ fontSize: `max(12px, ${th(14)})` }}>
            {h.note}
          </span>
        </div>
      </div>

      {/* Phone: the scene, then "Paid Early" on one line, then copy and two full width buttons */}
      <div className="md:hidden">
        <div className="relative h-[327px]">
          <div data-hero-stage className="absolute -top-[21px] left-1/2 h-[287px] w-[276px] -translate-x-1/2">
            <Image src="/clay/hero-still.webp" alt="" fill priority sizes="276px" className="object-contain" />
            <HeroScene media="(max-width: 767.98px)" />
          </div>
          <h1 className="hero-word-in absolute inset-x-0 top-[244px] text-center text-[76px] leading-[0.88] font-semibold tracking-[-3.6px] whitespace-nowrap text-fg">
            <Letters text={h.wordLeft} /> <Letters text={h.wordRight} />
          </h1>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-10">
          <span data-hero-rise className="text-sm font-medium text-brand-strong">{h.eyebrow}</span>
          <p data-hero-rise className="text-[17px] leading-normal text-fg-muted">{h.body}</p>
          <div data-hero-rise className="flex flex-col gap-2.5">
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
