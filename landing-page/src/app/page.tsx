import { Nav } from "@/components/Nav";
import { FaqSection } from "@/sections/FaqSection";
import { Hero } from "@/sections/Hero";
import { HowItWorks } from "@/sections/HowItWorks";
import { TheMath } from "@/sections/TheMath";
import { YourData } from "@/sections/YourData";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <HowItWorks />
        <YourData />
        <TheMath />
        <FaqSection />
        <div className="h-[60vh]" />
      </main>
    </>
  );
}
