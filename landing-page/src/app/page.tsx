import { Nav } from "@/components/Nav";
import { ClosingAndFooter } from "@/sections/ClosingAndFooter";
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
      </main>
      <ClosingAndFooter />
    </>
  );
}
