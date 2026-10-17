import { Nav } from "@/components/Nav";
import { Hero } from "@/sections/Hero";
import { HowItWorks } from "@/sections/HowItWorks";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <HowItWorks />
        <div className="h-[60vh]" />
      </main>
    </>
  );
}
