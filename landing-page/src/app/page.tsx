import { Nav } from "@/components/Nav";
import { Hero } from "@/sections/Hero";
import { HowItWorks } from "@/sections/HowItWorks";
import { YourData } from "@/sections/YourData";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <HowItWorks />
        <YourData />
        <div className="h-[60vh]" />
      </main>
    </>
  );
}
