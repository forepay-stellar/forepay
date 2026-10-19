"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

gsap.registerPlugin(ScrollTrigger);

// Storyboard frame 4: "Paid" and "Early" drift apart slightly over the first 35% of the hero's
// scroll, alongside the coin drop. Independent of the 3D scene, so it also runs without WebGL.
export function HeroWordsDrift() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const left = document.querySelector<HTMLElement>('[data-hero-word="left"]');
    const right = document.querySelector<HTMLElement>('[data-hero-word="right"]');
    const section = left?.closest("section");
    if (!left || !right || !section) return;
    const scroll = {
      trigger: section,
      // Absolute scroll positions: the hero sits under the nav, so "top top" would start late.
      start: 0,
      end: () => section.offsetHeight * 0.35,
      scrub: true,
    };
    const tweens = [
      gsap.to(left, { x: -32, ease: "none", scrollTrigger: scroll }),
      gsap.to(right, { x: 32, ease: "none", scrollTrigger: scroll }),
    ];
    return () => {
      tweens.forEach((t) => {
        t.scrollTrigger?.kill();
        t.kill();
      });
      gsap.set([left, right], { clearProps: "transform" });
    };
  }, [reduced]);

  return null;
}
