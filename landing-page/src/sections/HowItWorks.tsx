import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { ScrollLift } from "@/components/ScrollLift";
import { landing } from "@/content/landing";
import { cn } from "@/lib/cn";
import { ClayIn } from "@/components/ClayIn";
import { RiseText } from "@/components/RiseText";

// Landing / Desktop → How it works: three warm glass cards, the middle one shorter,
// each with a faint glass ring, a mono number, one clay object and the words at the bottom.
// Landing / Tablet: the cards lie flat and stack, the clay to the side, the middle one mirrored.
const CARDS = [
  {
    fill: "bg-[radial-gradient(140%_140%_at_85%_15%,#F8A97AB3,#F8A97A00_50%),linear-gradient(#FFF3EA,#FFF3EA)]",
    glassLeft: "left-[200px] lg:left-[calc(var(--s)*200)]",
    height: "lg:h-[calc(var(--s)*640)]",
    lift: [0, 0],
  },
  {
    fill: "bg-[radial-gradient(140%_140%_at_20%_10%,#F7B48AB3,#F7B48A00_50%),linear-gradient(#FFE9D8,#FFE9D8)]",
    glassLeft: "-left-[120px] lg:-left-[calc(var(--s)*120)]",
    height: "lg:h-[calc(var(--s)*560)]",
    // The coin lifted off the stack rises a little further as the card passes.
    lift: [16, -16],
  },
  {
    fill: "bg-[radial-gradient(140%_140%_at_85%_20%,#F59A66B3,#F59A6600_50%),linear-gradient(#F6EFE9,#F6EFE9)]",
    glassLeft: "left-[200px] lg:left-[calc(var(--s)*200)]",
    height: "lg:h-[calc(var(--s)*640)]",
    // The wallet with the coin dropping in settles as the card passes.
    lift: [-24, 8],
  },
];

export function HowItWorks() {
  const s = landing.howItWorks;
  return (
    <section
      id="how-it-works"
      className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 pt-20 pb-10 md:gap-[calc(var(--t)*40)] md:px-[calc(var(--t)*40)] md:pt-[calc(var(--t)*104)] md:pb-[calc(var(--t)*64)] lg:gap-[calc(var(--s)*64)] lg:px-20 lg:pt-[calc(var(--s)*160)] lg:pb-[calc(var(--s)*80)]"
    >
      <div className="flex flex-col gap-2.5 pb-2 lg:gap-3.5 lg:pb-0">
        <Reveal>
          <p className="text-sm font-medium text-fg-muted md:text-[length:max(13px,calc(var(--t)*15))] lg:text-[length:max(13px,calc(var(--s)*15))]">{s.eyebrow}</p>
        </Reveal>
        <h2 className="text-[44px] leading-[1.02] font-medium tracking-[-1.6px] md:text-[length:calc(var(--t)*64)] md:leading-none md:tracking-[-0.039em] lg:text-[length:calc(var(--s)*88)] lg:leading-none lg:tracking-[-0.0386em]">
          <RiseText text={s.title} />
        </h2>
      </div>
      <div className="flex flex-col gap-5 md:gap-[calc(var(--t)*16)] lg:h-[calc(var(--s)*640)] lg:flex-row lg:items-end lg:gap-[calc(var(--s)*24)]">
        {s.steps.map((step, i) => {
          // On tablets the middle card puts its clay on the left.
          const mirrored = i === 1;
          const words = mirrored ? "md:col-start-2" : "md:col-start-1";
          return (
          <Reveal key={step.number} delay={i * 90} className={cn("lg:min-w-0 lg:flex-1", CARDS[i].height)}>
            <article
              className={cn(
                "relative flex h-[540px] flex-col justify-between overflow-hidden rounded-[36px] p-7 md:grid md:h-[calc(var(--t)*380)] md:grid-rows-[auto_1fr_auto] md:gap-x-[calc(var(--t)*32)] md:rounded-[calc(var(--t)*44)] md:p-[calc(var(--t)*40)] lg:flex lg:h-full lg:rounded-[calc(var(--s)*44)] lg:p-[calc(var(--s)*40)]",
                mirrored ? "md:grid-cols-[auto_1fr]" : "md:grid-cols-[1fr_auto]",
                CARDS[i].fill,
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -top-40 size-[520px] rounded-full lg:-top-[calc(var(--s)*160)] lg:size-[calc(var(--s)*520)] border-[1.5px] border-white/70 bg-white/15",
                  CARDS[i].glassLeft,
                )}
              />
              <span className={cn("relative text-[15px] text-fg-muted tabular-nums md:row-start-1", words)}>{step.number}</span>
              <ScrollLift
                from={CARDS[i].lift[0]}
                to={CARDS[i].lift[1]}
                className={cn(
                  "relative h-[300px] md:row-span-3 md:row-start-1 md:h-[calc(var(--t)*300)] md:w-[calc(var(--t)*331)] md:self-center lg:h-[calc(var(--s)*300)] lg:w-auto lg:self-auto",
                  mirrored ? "md:col-start-1" : "md:col-start-2",
                )}
              >
                <ClayIn className="absolute inset-0" delay={200 + i * 90} float={i * 0.9}>
                  <Image src={step.image} alt="" fill sizes="(min-width: 1024px) 330px, 90vw" className="object-contain" />
                </ClayIn>
              </ScrollLift>
              <div className={cn("relative flex flex-col gap-2.5 md:row-start-3", words)}>
                <h3 className="text-[32px] leading-[1.02] font-medium tracking-[-1px] md:text-[length:max(24px,calc(var(--t)*40))] md:tracking-[-0.0325em] lg:text-[length:max(26px,calc(var(--s)*40))] lg:tracking-[-0.0325em]">
                  {step.title}
                </h3>
                <p className="text-[17px] leading-[1.45] text-fg-muted md:text-[length:max(15px,calc(var(--t)*17))] lg:text-[length:max(15px,calc(var(--s)*17))]">{step.body}</p>
              </div>
            </article>
          </Reveal>
          );
        })}
      </div>
    </section>
  );
}
