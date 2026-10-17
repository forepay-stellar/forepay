import { Faq } from "@/components/Faq";
import { landing } from "@/content/landing";

// Landing / Desktop → FAQ: centred title, seven questions, the second one open.
export function FaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto flex max-w-[1440px] flex-col items-center gap-8 px-5 pt-20 pb-10 lg:gap-14 lg:px-20 lg:py-[120px]"
    >
      <h2 className="max-w-[350px] text-center text-[40px] leading-[1.05] font-medium tracking-[-1.6px] lg:max-w-none lg:text-[80px] lg:tracking-[-3px]">
        {landing.faq.title}
      </h2>
      <div className="w-full lg:max-w-[820px]">
        <Faq items={landing.faq.items} defaultOpen={1} />
      </div>
    </section>
  );
}
