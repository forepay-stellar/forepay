import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Hero } from "@/sections/Hero";
import { IntroLab } from "./IntroLab";

// Internal: compare intro candidates over the real nav and hero. Not linked, not indexed.
export const metadata: Metadata = { title: "Intro preview", robots: { index: false, follow: false } };

export default function Preview() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
      </main>
      <IntroLab />
    </>
  );
}
