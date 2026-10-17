import Image from "next/image";
import { Marquee } from "@/components/Marquee";
import { landing } from "@/content/landing";

// Landing / Desktop → Your data (1440 × 900) and Landing / Mobile → Your data (390 × 760).
// Desktop positions are the design's pixels, scaled with the viewport below 1440 so the
// titles, the lock and the body keep their places at 1024.
const v = (px: number) => `min(${(px / 14.4).toFixed(3)}vw, ${px}px)`;

export function YourData() {
  const s = landing.yourData;
  const title = "font-medium leading-none tracking-[-0.04em] text-fg";
  const texture = "font-semibold leading-[1.2] tracking-[-0.04em] text-fg/5";

  return (
    <section id="your-data" className="relative mx-auto max-w-[1440px] overflow-hidden">
      {/* Desktop */}
      <div className="relative hidden lg:block" style={{ height: v(900) }}>
        <div className="absolute inset-x-0" style={{ top: v(298), fontSize: v(150) }}>
          <Marquee words={s.marquee} direction="left" className={texture} />
        </div>
        <div className="absolute inset-x-0" style={{ top: v(449), fontSize: v(150) }}>
          <Marquee words={s.marquee} startAt={1} offset={7} direction="right" className={texture} />
        </div>
        <div
          aria-hidden
          className="absolute rounded-full bg-[radial-gradient(closest-side,#F3EEE8_35%,#F3EEE800)]"
          style={{ left: v(430), top: v(200), width: v(600), height: v(463) }}
        />
        <p className="absolute text-[15px] font-medium text-fg-muted" style={{ left: v(80), top: v(96) }}>
          {s.eyebrow}
        </p>
        <h2 className="absolute" style={{ left: v(80), top: v(126) }}>
          <span className={`block ${title}`} style={{ fontSize: v(96) }}>
            {s.titleTop}
          </span>
          <span className="sr-only"> {s.titleBottom}</span>
        </h2>
        {/* The export carries room for the lock's shadow: 448 px square, top aligned and centred on the 260 × 343 frame */}
        <div className="absolute" style={{ left: v(506), top: v(260), width: v(448), height: v(448) }}>
          <Image src="/clay/lock.webp" alt="" fill sizes="448px" />
        </div>
        <p
          aria-hidden
          className={`absolute text-right ${title}`}
          style={{ right: v(80), top: v(680), fontSize: v(96) }}
        >
          {s.titleBottom}
        </p>
        <p className="absolute text-lg leading-normal text-fg-muted" style={{ left: v(80), top: v(700), width: v(470) }}>
          {s.body}
        </p>
      </div>

      {/* Phone */}
      <div className="relative h-[760px] lg:hidden">
        <div className="absolute inset-x-0 top-[200px] flex flex-col gap-1">
          <Marquee words={s.marquee} direction="left" className={`text-[84px] ${texture}`} />
          <Marquee words={s.marquee} startAt={1} offset={7} direction="right" className={`text-[84px] ${texture}`} />
        </div>
        <div
          aria-hidden
          className="absolute top-[200px] left-1/2 h-[330px] w-[280px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#F3EEE8_35%,#F3EEE800)]"
        />
        <p className="absolute top-10 left-5 text-sm font-medium text-fg-muted">{s.eyebrow}</p>
        <h2 className="absolute top-16 left-5">
          <span className={`block text-[44px] ${title}`}>{s.titleTop}</span>
          <span className="sr-only"> {s.titleBottom}</span>
        </h2>
        <div className="absolute top-[200px] left-1/2 size-[277px] -translate-x-1/2">
          <Image src="/clay/lock.webp" alt="" fill sizes="277px" />
        </div>
        <p aria-hidden className={`absolute top-[470px] right-5 text-right text-[44px] ${title}`}>
          {s.titleBottom}
        </p>
        <p className="absolute top-[560px] right-5 left-5 max-w-[350px] text-base leading-normal text-fg-muted">
          {s.body}
        </p>
      </div>
    </section>
  );
}
