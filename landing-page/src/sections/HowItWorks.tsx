import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { landing } from "@/content/landing";
import { cn } from "@/lib/cn";

// Landing / Desktop → How it works: three warm glass cards, the middle one shorter,
// each with a faint glass ring, a mono number, one clay object and the words at the bottom.
const CARDS = [
  {
    fill: "bg-[radial-gradient(140%_140%_at_85%_15%,#F8A97AB3,#F8A97A00_50%),linear-gradient(#FFF3EA,#FFF3EA)]",
    glassLeft: "left-[200px]",
    height: "lg:h-[640px]",
  },
  {
    fill: "bg-[radial-gradient(140%_140%_at_20%_10%,#F7B48AB3,#F7B48A00_50%),linear-gradient(#FFE9D8,#FFE9D8)]",
    glassLeft: "-left-[120px]",
    height: "lg:h-[560px]",
  },
  {
    fill: "bg-[radial-gradient(140%_140%_at_85%_20%,#F59A66B3,#F59A6600_50%),linear-gradient(#F6EFE9,#F6EFE9)]",
    glassLeft: "left-[200px]",
    height: "lg:h-[640px]",
  },
];

export function HowItWorks() {
  const s = landing.howItWorks;
  return (
    <section
      id="how-it-works"
      className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 pt-20 pb-10 lg:gap-16 lg:px-20 lg:pt-40 lg:pb-20"
    >
      <div className="flex flex-col gap-2.5 pb-2 lg:gap-3.5 lg:pb-0">
        <p className="text-sm font-medium text-fg-muted lg:text-[15px]">{s.eyebrow}</p>
        <h2 className="text-[44px] leading-[1.02] font-medium tracking-[-1.6px] lg:text-[88px] lg:leading-none lg:tracking-[-3.4px]">
          {s.title}
        </h2>
      </div>
      <div className="flex flex-col gap-5 lg:h-[640px] lg:flex-row lg:items-end lg:gap-6">
        {s.steps.map((step, i) => (
          <Reveal key={step.number} delay={i * 90} className={cn("lg:min-w-0 lg:flex-1", CARDS[i].height)}>
            <article
              className={cn(
                "relative flex h-[540px] flex-col justify-between overflow-hidden rounded-[36px] p-7 lg:h-full lg:rounded-[44px] lg:p-10",
                CARDS[i].fill,
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -top-40 size-[520px] rounded-full border-[1.5px] border-white/70 bg-white/15",
                  CARDS[i].glassLeft,
                )}
              />
              <span className="relative font-mono text-[15px] text-fg-muted">{step.number}</span>
              <div className="relative h-[300px]">
                <Image src={step.image} alt="" fill sizes="(min-width: 1024px) 330px, 90vw" className="object-contain" />
              </div>
              <div className="relative flex flex-col gap-2.5">
                <h3 className="text-[32px] leading-[1.02] font-medium tracking-[-1px] lg:text-[40px] lg:tracking-[-1.3px]">
                  {step.title}
                </h3>
                <p className="text-[17px] leading-[1.45] text-fg-muted">{step.body}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
