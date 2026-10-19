import Image from "next/image";
import { Marquee } from "@/components/Marquee";
import { landing } from "@/content/landing";
import { ClayIn } from "@/components/ClayIn";
import { Reveal } from "@/components/Reveal";
import { RiseText } from "@/components/RiseText";

// Landing / Desktop → Your data (1440 × 900) and Landing / Mobile → Your data (390 × 760).
// Desktop measures are the design's pixels times --s (globals.css), so the section shrinks with
// the width and the height. Text sits on the same side gutters as the nav and the hero; the lock
// and its glow stay centred.
const S = (px: number) => `calc(var(--s) * ${px})`;
const G = "min(5.6vw, 80px)";
// A design x position measured from the 1440 frame's centre, kept centred at any width.
const fromCentre = (x: number) => `calc(50% + var(--s) * ${x - 720})`;
// Landing / Tablet → Your data (834 × 860): the same composition, one design pixel is --t.
const T = (px: number) => `calc(var(--t) * ${px})`;
const TG = "calc(100vw * 40 / 834)";

export function YourData() {
  const s = landing.yourData;
  const title = "font-medium leading-none tracking-[-0.04em] text-fg";
  const texture = "font-semibold leading-[1.2] tracking-[-0.04em] text-fg/5";

  return (
    <section id="your-data" className="relative mx-auto max-w-[1440px] overflow-hidden">
      {/* Desktop */}
      <div className="relative hidden lg:block" style={{ height: S(900) }}>
        <div className="absolute inset-x-0" style={{ top: S(298), fontSize: S(150) }}>
          <Marquee words={s.marquee} direction="left" className={texture} />
        </div>
        <div className="absolute inset-x-0" style={{ top: S(449), fontSize: S(150) }}>
          <Marquee words={s.marquee} startAt={1} offset={7} direction="right" className={texture} />
        </div>
        <div
          aria-hidden
          className="absolute rounded-full bg-[radial-gradient(closest-side,#F3EEE8_35%,#F3EEE800)]"
          style={{ left: fromCentre(430), top: S(200), width: S(600), height: S(463) }}
        />
        <div className="absolute" style={{ left: G, top: S(96) }}>
          <Reveal>
            <p className="font-medium text-fg-muted" style={{ fontSize: `max(13px, ${S(15)})` }}>
              {s.eyebrow}
            </p>
          </Reveal>
        </div>
        <h2 className="absolute" style={{ left: G, top: S(126) }}>
          <span className={`block ${title}`} style={{ fontSize: S(96) }}>
            <RiseText text={s.titleTop} />
          </span>
          <span className="sr-only"> {s.titleBottom}</span>
        </h2>
        {/* The export carries room for the lock's shadow: 448 px square, top aligned and centred on the 260 × 343 frame */}
        <div className="absolute" style={{ left: fromCentre(506), top: S(260), width: S(448), height: S(448) }}>
          <ClayIn className="absolute inset-0" delay={150}>
            <Image src="/clay/lock.webp" alt="" fill sizes="448px" />
          </ClayIn>
        </div>
        <p
          aria-hidden
          className={`absolute text-right ${title}`}
          style={{ right: G, top: S(680), fontSize: S(96) }}
        >
          <RiseText text={s.titleBottom} delay={200} />
        </p>
        <div className="absolute" style={{ left: G, top: S(700), width: `max(360px, ${S(470)})` }}>
          <Reveal delay={150}>
            <p className="leading-normal text-fg-muted" style={{ fontSize: `max(15px, ${S(18)})` }}>
              {s.body}
            </p>
          </Reveal>
        </div>
      </div>

      {/* Tablet */}
      <div className="relative hidden md:block lg:hidden" style={{ height: T(860) }}>
        <div className="absolute inset-x-0" style={{ top: T(300), fontSize: T(120) }}>
          <Marquee words={s.marquee} direction="left" className={texture} />
        </div>
        <div className="absolute inset-x-0" style={{ top: T(420), fontSize: T(120) }}>
          <Marquee words={s.marquee} startAt={1} offset={7} direction="right" className={texture} />
        </div>
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#F3EEE8_35%,#F3EEE800)]"
          style={{ top: T(230), width: T(480), height: T(380) }}
        />
        <div className="absolute" style={{ left: TG, top: T(80) }}>
          <Reveal>
            <p className="font-medium text-fg-muted" style={{ fontSize: `max(13px, ${T(15)})` }}>
              {s.eyebrow}
            </p>
          </Reveal>
        </div>
        <h2 className="absolute" style={{ left: TG, top: T(108) }}>
          <span className={`block ${title}`} style={{ fontSize: T(72) }}>
            <RiseText text={s.titleTop} />
          </span>
          <span className="sr-only"> {s.titleBottom}</span>
        </h2>
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: T(250), width: T(448), height: T(448) }}>
          <ClayIn className="absolute inset-0" delay={150}>
            <Image src="/clay/lock.webp" alt="" fill sizes="448px" />
          </ClayIn>
        </div>
        <p aria-hidden className={`absolute text-right ${title}`} style={{ right: TG, top: T(618), fontSize: T(72) }}>
          <RiseText text={s.titleBottom} delay={200} />
        </p>
        <div className="absolute" style={{ left: TG, top: T(724), width: `max(360px, ${T(420)})` }}>
          <Reveal delay={150}>
            <p className="leading-normal text-fg-muted" style={{ fontSize: `max(15px, ${T(17)})` }}>
              {s.body}
            </p>
          </Reveal>
        </div>
      </div>

      {/* Phone */}
      <div className="relative h-[760px] md:hidden">
        <div className="absolute inset-x-0 top-[200px] flex flex-col gap-1">
          <Marquee words={s.marquee} direction="left" className={`text-[84px] ${texture}`} />
          <Marquee words={s.marquee} startAt={1} offset={7} direction="right" className={`text-[84px] ${texture}`} />
        </div>
        <div
          aria-hidden
          className="absolute top-[200px] left-1/2 h-[330px] w-[280px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#F3EEE8_35%,#F3EEE800)]"
        />
        <Reveal className="absolute top-10 left-5">
          <p className="text-sm font-medium text-fg-muted">{s.eyebrow}</p>
        </Reveal>
        <h2 className="absolute top-16 left-5">
          <span className={`block text-[44px] ${title}`}>
            <RiseText text={s.titleTop} />
          </span>
          <span className="sr-only"> {s.titleBottom}</span>
        </h2>
        <div className="absolute top-[200px] left-1/2 size-[277px] -translate-x-1/2">
          <ClayIn className="absolute inset-0" delay={150}>
            <Image src="/clay/lock.webp" alt="" fill sizes="277px" />
          </ClayIn>
        </div>
        <p aria-hidden className={`absolute top-[470px] right-5 text-right text-[44px] ${title}`}>
          <RiseText text={s.titleBottom} delay={200} />
        </p>
        <Reveal delay={150} className="absolute top-[560px] right-5 left-5 max-w-[350px]">
          <p className="text-base leading-normal text-fg-muted">{s.body}</p>
        </Reveal>
      </div>
    </section>
  );
}
