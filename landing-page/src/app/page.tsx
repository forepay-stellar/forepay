import { Nav } from "@/components/Nav";
import { Hero } from "@/sections/Hero";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <div id="how-it-works" className="h-[100vh]" />
      </main>
    </>
  );
}
