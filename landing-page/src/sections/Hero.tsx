import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { landing } from "@/content/landing";
import { APP_URL } from "@/lib/env";
import { HeroScene } from "./HeroScene";

// Landing / Desktop → Hero (1440 × 860) and Landing / Mobile → Hero (option C).
// Desktop measures are the design's pixels, scaled down with the viewport below 1440
// (min(Nvw, Npx)) so the words and the scene keep their composition at 1024.
export function Hero() {
  const h = landing.hero;
  const giant = "font-semibold leading-[0.9] tracking-[-0.047em] text-fg";

  return (
    <section aria-labelledby="hero-title" className="relative mx-auto max-w-[1440px] overflow-hidden">
      {/* Desktop */}
      <div className="relative hidden h-[min(59.7vw,860px)] min-h-[700px] lg:block">
        <h1 id="hero-title" className={`${giant} text-[min(12.5vw,180px)]`}>
          <span className="absolute top-[min(4.2vw,60px)] left-[min(5.6vw,80px)]">{h.wordLeft}</span>{" "}
          <span className="absolute top-[min(32.6vw,470px)] right-[min(5.6vw,80px)]">{h.wordRight}</span>
        </h1>
        <div
          data-hero-stage
          className="absolute top-[min(4.2vw,60px)] left-1/2 aspect-[616/640] w-[min(42.8vw,616px)] -translate-x-1/2"
        >
          <Image src="/clay/hero-still.webp" alt="" fill priority sizes="(min-width: 1440px) 616px, 43vw" className="object-contain" />
          <HeroScene />
        </div>
        <div className="absolute bottom-[min(6.1vw,88px)] left-[min(5.6vw,80px)] flex w-[min(30.5vw,440px)] flex-col gap-3.5">
          <span className="text-[15px] font-medium text-brand-strong">{h.eyebrow}</span>
          <p className="text-lg leading-normal text-fg-muted">{h.body}</p>
        </div>
        <div className="absolute right-[min(5.6vw,80px)] bottom-[min(6.1vw,88px)] flex flex-col items-end gap-3.5">
          <div className="flex gap-3">
            <ButtonLink href={APP_URL}>{h.primary}</ButtonLink>
            <ButtonLink href="#how-it-works" variant="outline" className="px-[30px]">
              {h.secondary}
            </ButtonLink>
          </div>
          <span className="text-sm text-fg-subtle">{h.note}</span>
        </div>
      </div>

      {/* Phone: the scene, then "Paid Early" on one line, then copy and two full width buttons */}
      <div className="lg:hidden">
        <div className="relative h-[327px]">
          <div data-hero-stage className="absolute -top-[21px] left-1/2 h-[287px] w-[276px] -translate-x-1/2">
            <Image src="/clay/hero-still.webp" alt="" fill priority sizes="276px" className="object-contain" />
            <HeroScene />
          </div>
          <h1 className="absolute inset-x-0 top-[244px] text-center text-[76px] leading-[0.88] font-semibold tracking-[-3.6px] whitespace-nowrap text-fg">
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
    </section>
  );
}
