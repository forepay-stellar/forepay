import { Faq } from "@/components/Faq";
import { landing } from "@/content/landing";
import { RiseText } from "@/components/RiseText";

// Landing / Desktop → FAQ: centred title, seven questions, the second one open.
export function FaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto flex max-w-[1440px] flex-col items-center gap-8 px-5 pt-20 pb-10 md:gap-[calc(var(--t)*44)] md:px-[calc(var(--t)*40)] md:py-[calc(var(--t)*96)] lg:gap-[calc(var(--s)*56)] lg:px-20 lg:py-[calc(var(--s)*120)]"
    >
      <h2 className="max-w-[350px] text-center text-[40px] leading-[1.05] font-medium tracking-[-1.6px] md:max-w-none md:text-[length:calc(var(--t)*60)] md:tracking-[-0.04em] lg:text-[length:calc(var(--s)*80)] lg:tracking-[-0.0375em]">
        <RiseText text={landing.faq.title} />
      </h2>
      <div className="w-full lg:max-w-[max(640px,calc(var(--s)*820))]">
        <Faq items={landing.faq.items} defaultOpen={1} />
      </div>
    </section>
  );
}
