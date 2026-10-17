import Image from "next/image";
import { CountUp } from "@/components/CountUp";
import { landing } from "@/content/landing";

// Landing / Desktop → The math: one big warm card with the clay quarter coin, and two white
// fact cards, 25% with a quarter ring and 100 USDC with capped bars.

function QuarterRing() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="shrink-0">
      <circle cx="28" cy="28" r="24" fill="none" stroke="var(--fp-stone-150)" strokeWidth="1" />
      {/* A quarter, from twelve o'clock to three, as thick as the design's 0.72 inner radius */}
      <path d="M28 0 A28 28 0 0 1 56 28 L48.16 28 A20.16 20.16 0 0 0 28 7.84 Z" fill="var(--color-brand)" />
    </svg>
  );
}

function CapBars() {
  return (
    <div aria-hidden className="flex h-14 shrink-0 items-end gap-[5px]">
      {[20, 32, 44, 56, 56].map((h, i) => (
        <span
          key={i}
          className={i > 2 ? "w-[9px] rounded-pill bg-brand" : "w-[9px] rounded-pill bg-[var(--fp-stone-150)]"}
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

export function TheMath() {
  const s = landing.theMath;
  const facts = [
    { ...s.rate, visual: <QuarterRing /> },
    { ...s.cap, visual: <CapBars /> },
  ];

  return (
    <section
      id="the-math"
      className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 pt-20 pb-10 lg:gap-12 lg:px-20 lg:py-[120px]"
    >
      <div className="flex flex-col gap-2.5 pb-2 lg:gap-3.5 lg:pb-0">
        <p className="text-sm font-medium text-fg-muted lg:text-[15px]">{s.eyebrow}</p>
        <h2 className="text-[44px] font-medium tracking-[-1.6px] lg:text-[76px] lg:tracking-[-3px]">{s.title}</h2>
      </div>

      <div className="flex flex-col gap-3 lg:h-[560px] lg:flex-row lg:gap-5">
        <article className="flex h-[470px] flex-col justify-between overflow-hidden rounded-[36px] bg-[radial-gradient(120%_120%_at_50%_35%,#F8A97A99,#F8A97A00_50%),linear-gradient(#FFF3EA,#FFF3EA)] p-7 lg:h-full lg:min-w-0 lg:flex-1 lg:rounded-[40px] lg:p-10">
          <div className="flex justify-between text-sm text-fg-muted">
            <span className="font-mono">{s.big.number}</span>
            <span>{s.big.tag}</span>
          </div>
          {/* The export is 800 × 370 with room for the shadow below the 300 px stage */}
          <div className="relative h-[250px] lg:h-[300px]">
            <div className="absolute -top-3.5 left-1/2 h-[288px] w-[624px] -translate-x-1/2 lg:top-0 lg:h-[370px] lg:w-[800px]">
              <Image src="/clay/quarter-coin.webp" alt="" fill sizes="(min-width: 1024px) 800px, 624px" />
            </div>
          </div>
          <div className="relative flex flex-col gap-2">
            <h3 className="text-[26px] leading-[1.15] font-medium tracking-[-0.8px] lg:text-4xl lg:tracking-[-1.2px]">{s.big.title}</h3>
            <p className="text-[17px] leading-[1.45] text-fg-muted">{s.big.body}</p>
          </div>
        </article>

        <div className="flex gap-3 lg:w-[380px] lg:flex-col lg:gap-5">
          {facts.map((f) => (
            <article
              key={f.label}
              className="flex h-[220px] min-w-0 flex-1 flex-col justify-between rounded-[28px] bg-surface p-5 lg:h-auto lg:rounded-[36px] lg:p-8"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[13px] font-medium lg:text-[15px]">{f.label}</h3>
                <span className="hidden lg:block">{f.visual}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="flex items-end gap-1.5">
                  <span className="text-[52px] leading-[0.9] font-medium tracking-[-2px] lg:text-[88px] lg:tracking-[-3.6px]">
                    <CountUp to={f.value} />
                  </span>
                  <span className="text-lg leading-[1.7] font-medium text-fg-subtle lg:text-[28px]">{f.unit}</span>
                </p>
                <p className="text-[13px] text-fg-muted lg:text-[15px]">{f.sub}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
