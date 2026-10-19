"use client";

import { useEffect, useRef } from "react";
import { heroEntrance } from "@/lib/heroEntrance";
import { lockScroll } from "@/lib/scroll";

// Every load opens on the wave mark: orange rises inside the circle like
// water, the two waves draw through it, it holds, then the same motion plays backwards (a third
// faster) and the hero builds itself. It plays through, the page held at the top meanwhile.
// With reduced motion the mark just shows briefly and fades. Until the hero has finished
// building, html carries data-settling, so heavy work waits (lib/intro.ts, whenIntroSettled).
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

// `back` is how fast the track plays when the mark undraws, as a share of its drawing time.
type Track = { el: Element; keyframes: Keyframe[]; start: number; duration: number; easing: string; back: number };

export function Intro() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const r = root.current;
    if (!r || !("intro" in html.dataset)) return;
    // The hero is where the intro hands over, whatever moved the page before hydration.
    window.scrollTo(0, 0);
    html.dataset.settling = "";
    const unlock = lockScroll();
    const timers: number[] = [];
    const end = () => {
      delete html.dataset.intro;
      unlock();
    };
    const settled = () => delete html.dataset.settling;
    if (typeof r.animate !== "function") {
      end();
      settled();
      return;
    }

    const anims: Animation[] = [];
    let finish = 0;
    let quiet = 0;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      anims.push(r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 500, fill: "forwards" }));
      finish = 800;
      quiet = 800;
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
          duration: 1030,
          easing: EASE_IN_OUT,
          // The water drains a little faster than it rose.
          back: 0.78,
        });
      // The waves start while the water is still coming up, about two thirds of the way.
      r.querySelectorAll("[data-intro-cut]").forEach((cut, i) =>
        tracks.push({ el: cut, keyframes: undrawn, start: 710 + i * 160, duration: 750, easing: EASE_OUT, back: 0.65 }),
      );

      const drawn = Math.max(...tracks.map((t) => t.start + t.duration));
      const undraw = drawn + 320;
      // The same motion backwards, the last thing drawn the first to go, each a little faster
      // (`back`): leaving should take less time than arriving.
      let gone = 0;
      tracks.forEach((t) => {
        anims.push(t.el.animate(t.keyframes, { duration: t.duration, delay: t.start, easing: t.easing, fill: "both" }));
        const delay = undraw + (drawn - t.start - t.duration) * 0.65;
        gone = Math.max(gone, delay + t.duration * t.back);
        anims.push(
          t.el.animate(t.keyframes, {
            duration: t.duration * t.back,
            delay,
            easing: t.easing,
            direction: "reverse",
            fill: "forwards",
          }),
        );
      });
      // The page starts building just before the last stroke leaves; the cream cover drops then.
      const at = gone - 80;
      const cover = r.querySelector("[data-intro-cover]");
      if (cover) anims.push(cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: at, fill: "forwards" }));
      const entrance = heroEntrance(at);
      anims.push(...entrance);
      finish = gone + 40;
      // The hero has built itself once its last entrance animation is over.
      quiet = Math.max(...entrance.map((a) => {
        const t = a.effect?.getComputedTiming();
        return Number(t?.endTime ?? 0);
      }), finish);
    }

    timers.push(window.setTimeout(end, finish), window.setTimeout(settled, quiet));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      anims.forEach((a) => a.cancel());
      unlock();
      settled();
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
