"use client";

import { useEffect, useRef } from "react";
import { heroEntrance } from "@/lib/heroEntrance";

// Every load opens on the wave mark: orange rises inside the circle like
// water, the two waves draw through it, it holds, then the same motion plays backwards (a third
// faster) and the hero builds itself. A click, a key, the wheel or a touch skips it. With
// reduced motion the mark just shows briefly and fades.
// Whether it plays is decided in <head>: see lib/intro.ts.

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const MARK = 112;

const WAVE_D = (y: number) => `M-2 ${y}c4.5-3 8.5-3 12.5 0 4 3 8 3 12 0 4-3 8-3 11.5 0`;

// The water: a block with one soft crest on top, tall enough to cover the circle when risen.
const WATER = "M-4 -6 q9 -4 18 0 t18 0 t18 0 L40 36 L-4 36 Z";

// The mark, built to be drawn: the orange water inside the circle, with the two waves cut out
// through a mask. At rest it is the mark exactly; CSS holds it undrawn until the intro runs.
function DrawnMark() {
  return (
    <svg width={MARK} height={MARK} viewBox="0 0 32 32" aria-hidden className="block overflow-visible">
      <defs>
        <clipPath id="intro-circle">
          <rect width="32" height="32" rx="16" />
        </clipPath>
        <mask id="intro-cut" maskUnits="userSpaceOnUse" x="-8" y="-8" width="48" height="48">
          <rect x="-8" y="-8" width="48" height="48" fill="white" />
          {[18.5, 24.5].map((y) => (
            <path
              key={y}
              data-intro-cut
              pathLength={1}
              strokeDasharray={1}
              d={WAVE_D(y)}
              fill="none"
              stroke="black"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          ))}
        </mask>
      </defs>
      <g mask="url(#intro-cut)">
        <g clipPath="url(#intro-circle)">
          <path data-intro-water d={WATER} fill="#F2620F" />
        </g>
      </g>
    </svg>
  );
}

type Track = { el: Element; keyframes: Keyframe[]; start: number; duration: number; easing: string };

export function Intro() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const r = root.current;
    if (!r || !("intro" in html.dataset)) return;
    // The hero is where the intro hands over, whatever moved the page before hydration.
    window.scrollTo(0, 0);

    const end = () => delete html.dataset.intro;
    if (typeof r.animate !== "function") {
      end();
      return;
    }

    const anims: Animation[] = [];
    let finish = 0;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      anims.push(r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 500, fill: "forwards" }));
      finish = 800;
    } else {
      // Each step is a track; the undraw plays every track backwards in reverse order, so the
      // last thing drawn is the first to go.
      const tracks: Track[] = [];
      const undrawn = [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }];
      const water = r.querySelector("[data-intro-water]");
      if (water)
        tracks.push({
          el: water,
          keyframes: [{ transform: "translateY(44px)" }, { transform: "none" }],
          start: 80,
          duration: 760,
          easing: EASE_IN_OUT,
        });
      // The waves start while the water is still coming up.
      r.querySelectorAll("[data-intro-cut]").forEach((cut, i) =>
        tracks.push({ el: cut, keyframes: undrawn, start: 520 + i * 160, duration: 750, easing: EASE_OUT }),
      );

      const drawn = Math.max(...tracks.map((t) => t.start + t.duration));
      const undraw = drawn + 320;
      // The same motion backwards, a third faster: leaving should take less time than arriving.
      const BACK = 0.65;
      tracks.forEach((t) => {
        anims.push(t.el.animate(t.keyframes, { duration: t.duration, delay: t.start, easing: t.easing, fill: "both" }));
        anims.push(
          t.el.animate(t.keyframes, {
            duration: t.duration * BACK,
            delay: undraw + (drawn - t.start - t.duration) * BACK,
            easing: t.easing,
            direction: "reverse",
            fill: "forwards",
          }),
        );
      });
      const gone = undraw + (drawn - 80) * BACK;
      // The page starts building just before the last stroke leaves; the cream cover drops then.
      const at = gone - 80;
      const cover = r.querySelector("[data-intro-cover]");
      if (cover) anims.push(cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: at, fill: "forwards" }));
      anims.push(...heroEntrance(at));
      finish = gone + 40;
    }

    const timer = window.setTimeout(end, finish);
    const skip = () => {
      anims.forEach((a) => a.finish());
      window.clearTimeout(timer);
      end();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, skip, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, skip));
      anims.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <div ref={root} data-intro-overlay aria-hidden className="fixed inset-0 z-[60] hidden">
      <div data-intro-cover className="absolute inset-0 bg-canvas" />
      <div className="absolute inset-0 grid place-items-center">
        <DrawnMark />
      </div>
    </div>
  );
}
