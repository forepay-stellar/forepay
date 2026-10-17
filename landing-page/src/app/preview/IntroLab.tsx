"use client";

import { useEffect, useRef, useState } from "react";

// Intro candidates for the first visit, played over the real nav and hero. Internal tool for
// choosing one; not linked from the page. Every intro is under 1.5 s, skippable with a click,
// animates only transform, opacity and clip-path, and never starts from scale(0).

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

type Variant = { id: string; name: string; note: string };

const VARIANTS: Variant[] = [
  { id: "A", name: "Wave mark", note: "The two waves draw, the mark flies to the nav" },
  { id: "B", name: "Coin iris", note: "A coin drops, the page opens from it" },
  { id: "C", name: "Curtain", note: "Tangerine panel with Paid early., lifts away" },
  { id: "D", name: "Camera", note: "No overlay, the scene pulls back from the coin" },
];

function heroParts() {
  const words = [...document.querySelectorAll<HTMLElement>("[data-hero-word] > span")].filter((el) => el.offsetParent);
  const stage = [...document.querySelectorAll<HTMLElement>("[data-hero-stage]")].find((el) => el.offsetParent) ?? null;
  const logo = document.querySelector<HTMLElement>("header a[aria-label]");
  const visibleLogo = [...document.querySelectorAll<HTMLElement>("header a[aria-label]")].find((el) => el.offsetParent) ?? logo;
  return { words, stage, logo: visibleLogo };
}

// The hero words rise in, left then right, as the intro ends.
function wordsIn(words: HTMLElement[], delay: number) {
  return words.map((w, i) =>
    w.animate(
      [
        { opacity: 0, transform: `translateX(${i === 0 ? -40 : 40}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: 700, delay: delay + i * 80, easing: EASE_OUT, fill: "backwards" },
    ),
  );
}

function WaveMark({ size, draw }: { size: number; draw: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <clipPath id="intro-mark">
        <rect width="32" height="32" rx="16" />
      </clipPath>
      <g clipPath="url(#intro-mark)">
        <rect width="32" height="32" rx="16" fill="#F2620F" />
        {[18.5, 24.5].map((y, i) => (
          <path
            key={y}
            className={draw ? "intro-wave" : undefined}
            style={{ animationDelay: `${120 + i * 110}ms` }}
            pathLength={1}
            d={`M-2 ${y}c4.5-3 8.5-3 12.5 0 4 3 8 3 12 0 4-3 8-3 11.5 0`}
            fill="none"
            stroke="#F3EEE8"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}

function Coin({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="55" r="44" fill="#8A3207" />
      <circle cx="50" cy="48" r="44" fill="#EE6A22" />
      <circle cx="50" cy="48" r="31" fill="#FDE8D6" />
      {[40, 56].map((y) => (
        <path key={y} d={`M33 ${y}c6-6 11-6 17 0s11 6 17 0`} fill="none" stroke="#953202" strokeWidth="4.5" strokeLinecap="round" />
      ))}
    </svg>
  );
}

// The iris in B animates a custom property, so it has to be registered as a length.
function registerIris() {
  try {
    CSS.registerProperty({ name: "--iris", syntax: "<length>", inherits: false, initialValue: "0px" });
  } catch {
    // already registered
  }
}

export function IntroLab() {
  const [variant, setVariant] = useState("A");
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const overlay = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLDivElement>(null);
  const extra = useRef<HTMLDivElement>(null);

  useEffect(registerIris, []);

  useEffect(() => {
    const o = overlay.current;
    const a = actor.current;
    const x = extra.current;
    if (!o || !a) return;
    window.scrollTo(0, 0);
    const { words, stage, logo } = heroParts();
    const anims: Animation[] = [];
    const add = (anim: Animation | Animation[]) => anims.push(...(Array.isArray(anim) ? anim : [anim]));
    let done = 0;

    if (variant === "A") {
      // 1. canvas screen, the mark settles in and its waves draw (CSS, 120 to 600 ms)
      add(a.animate([{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1)" }], { duration: 400, easing: EASE_OUT, fill: "both" }));
      // 2. the mark flies into the nav logo's place while the screen clears
      const from = a.getBoundingClientRect();
      const to = logo?.getBoundingClientRect();
      if (to) {
        const dx = to.left + to.height / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const s = to.height / from.height;
        add(a.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 }], { duration: 600, delay: 750, easing: EASE_IN_OUT, fill: "forwards" }));
      }
      add(o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 900, easing: "ease", fill: "forwards" }));
      if (stage) add(stage.animate([{ opacity: 0, transform: "translateY(24px) scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 800, delay: 950, easing: EASE_OUT, fill: "backwards" }));
      add(wordsIn(words, 1000));
      done = 1400;
    }

    if (variant === "B") {
      // 1. a coin drops to the centre and lands with a small squash
      add(a.animate(
        [
          { transform: "translateY(-60vh) rotate(-20deg)", opacity: 1, offset: 0 },
          { transform: "translateY(0) rotate(0) scale(1.08, 0.9)", offset: 0.72 },
          { transform: "translateY(-14px) scale(0.98, 1.02)", offset: 0.86 },
          { transform: "translateY(0) scale(1)", opacity: 1, offset: 1 },
        ],
        { duration: 650, easing: EASE_OUT, fill: "both" },
      ));
      // 2. the page opens from the coin: a hole in the overlay grows from the centre outward
      add(o.animate([{ "--iris": "0px" }, { "--iris": "150vmax" }], { duration: 750, delay: 700, easing: EASE_IN_OUT, fill: "forwards" }));
      // the coin sinks into the opening as it starts
      add(a.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.6)", opacity: 0 }], { duration: 300, delay: 700, easing: EASE_OUT, fill: "forwards" }));
      if (stage) add(stage.animate([{ opacity: 0, transform: "scale(0.94)" }, { opacity: 1, transform: "none" }], { duration: 800, delay: 800, easing: EASE_OUT, fill: "backwards" }));
      add(wordsIn(words, 900));
      done = 1450;
    }

    if (variant === "C" && x) {
      // 1. "Paid early." rises inside the tangerine panel
      add(x.animate([{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "none" }], { duration: 500, easing: EASE_OUT, fill: "both" }));
      // 2. the panel lifts away from the bottom, taking the words with it
      add(o.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(0 0 100% 0)" }], { duration: 700, delay: 650, easing: EASE_IN_OUT, fill: "forwards" }));
      add(x.animate([{ transform: "none" }, { transform: "translateY(-80px)" }], { duration: 700, delay: 650, easing: EASE_IN_OUT, fill: "forwards", composite: "add" }));
      if (stage) add(stage.animate([{ opacity: 0, transform: "translateY(60px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 800, easing: EASE_OUT, fill: "backwards" }));
      add(wordsIn(words, 850));
      done = 1400;
    }

    if (variant === "D") {
      // No overlay: the scene starts close on the hero coin and pulls back; the words slide in.
      if (stage) add(stage.animate(
        [
          { opacity: 0, transform: "translateY(30%) scale(1.9)", filter: "blur(6px)" },
          { opacity: 1, transform: "none", filter: "blur(0)" },
        ],
        { duration: 1100, easing: EASE_OUT, fill: "backwards" },
      ));
      add(wordsIn(words, 350));
      done = 1200;
    }

    const end = window.setTimeout(() => setPlaying(false), done);
    const skip = () => {
      anims.forEach((anim) => anim.finish());
      setPlaying(false);
    };
    o.addEventListener("click", skip);
    return () => {
      window.clearTimeout(end);
      o.removeEventListener("click", skip);
      anims.forEach((anim) => anim.cancel());
    };
  }, [variant, run]);

  const current = VARIANTS.find((v) => v.id === variant)!;
  const showOverlay = variant !== "D";

  return (
    <>
      {showOverlay && (
        <div
          key={`${variant}-${run}`}
          ref={overlay}
          aria-hidden
          className={`fixed inset-0 z-[60] grid place-items-center ${playing ? "" : "pointer-events-none"} ${variant === "C" ? "bg-brand" : "bg-canvas"}`}
          style={
            variant === "B"
              ? { maskImage: "radial-gradient(circle at 50% 50%, #0000 var(--iris), #000 calc(var(--iris) + 1px))" }
              : undefined
          }
        >
          {variant === "A" && (
            <div ref={actor}>
              <WaveMark size={112} draw />
            </div>
          )}
          {variant === "B" && (
            <div ref={actor}>
              <Coin size={140} />
            </div>
          )}
          {variant === "C" && (
            <>
              <div ref={actor} />
              <p ref={extra} className="text-[min(16vw,230px)] leading-[0.9] font-semibold tracking-[-0.048em] text-cream">
                Paid early.
              </p>
            </>
          )}
        </div>
      )}
      {!showOverlay && <div key={`${variant}-${run}`} ref={(el) => { overlay.current = el; actor.current = el; }} className="hidden" />}

      <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1.5 rounded-pill bg-fg/90 p-1.5 pl-4 text-sm text-white shadow-nav backdrop-blur">
        <span className="mr-2 hidden whitespace-nowrap text-white/70 sm:inline">{current.note}</span>
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setVariant(v.id);
              setRun((r) => r + 1);
              setPlaying(true);
            }}
            className={`rounded-pill px-3 py-1.5 font-medium whitespace-nowrap transition-[background-color,transform] duration-150 active:scale-[0.97] ${v.id === variant ? "bg-white text-fg" : "hover:bg-white/15"}`}
            title={v.name}
          >
            {v.id} <span className="hidden md:inline">{v.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setRun((r) => r + 1);
            setPlaying(true);
          }}
          className="rounded-pill bg-brand px-3.5 py-1.5 font-medium transition-transform duration-150 active:scale-[0.97]"
        >
          Replay
        </button>
      </div>
    </>
  );
}
