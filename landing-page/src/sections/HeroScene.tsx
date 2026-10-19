"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { whenIntroSettled } from "@/lib/intro";
import { canRender3D, hasWebGL, useMediaQuery, usePrefersReducedMotion } from "@/lib/motion";

// The 3D scene loads late and only in the browser, so the headline and the still image paint
// first. Without WebGL, or with reduced motion, nothing loads and the still stays.
const Canvas3D = dynamic(() => import("./scene/Canvas3D").then((m) => m.Canvas3D), { ssr: false });

// True once the still hero is decoded and on screen, the intro and the hero's entrance are over,
// the browser is idle, and WebGL works. Building the scene is one long task (three.js, geometry,
// shaders); run before that paint it delays the largest contentful paint, and run during the
// intro it makes the waves stutter, so the still image always paints first and covers the wait.
function useIdleAfterStill(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let cancelIdle = () => {};
    const afterPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const whenLoaded = () =>
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true }));
    const stills = [...document.querySelectorAll<HTMLImageElement>("[data-hero-stage] > img")];

    whenLoaded()
      .then(whenIntroSettled)
      .then(() => Promise.all(stills.map((img) => img.decode().catch(() => {}))))
      .then(afterPaint)
      .then(() => {
        if (cancelled) return;
        if ("requestIdleCallback" in window) {
          const id = window.requestIdleCallback(() => setIdle(hasWebGL()), { timeout: 1500 });
          cancelIdle = () => window.cancelIdleCallback(id);
        } else {
          const id = setTimeout(() => setIdle(hasWebGL()), 200);
          cancelIdle = () => clearTimeout(id);
        }
      });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);
  return idle;
}

// The hero has a desktop and a phone layout; each mounts the scene only while it is the one on
// screen, so a phone never runs a second WebGL context for the hidden desktop stage.
export function HeroScene({ media }: { media: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const shown = useMediaQuery(media);
  const webgl = useIdleAfterStill();
  if (!shown || !canRender3D({ reducedMotion, webgl })) return null;
  return (
    <>
      {/* The glow behind the scene is part of the still image; keep it when the still fades out */}
      <div
        aria-hidden
        className="hero-live-only absolute top-[6.25%] left-[8.4%] h-[81.25%] w-[84.4%] rounded-full bg-[radial-gradient(65%_65%_at_50%_50%,#FFE2CC,#F3EEE800)]"
      />
      <Canvas3D />
    </>
  );
}
