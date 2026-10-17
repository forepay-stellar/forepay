"use client";

import dynamic from "next/dynamic";
import { useCanRender3D, useMediaQuery } from "@/lib/motion";

// The 3D scene loads late and only in the browser, so the headline and the still image paint
// first. Without WebGL, or with reduced motion, nothing loads and the still stays.
const Canvas3D = dynamic(() => import("./scene/Canvas3D").then((m) => m.Canvas3D), { ssr: false });

// The hero has a desktop and a phone layout; each mounts the scene only while it is the one on
// screen, so a phone never runs a second WebGL context for the hidden desktop stage.
export function HeroScene({ media }: { media: string }) {
  const ok = useCanRender3D();
  const shown = useMediaQuery(media);
  if (!ok || !shown) return null;
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
