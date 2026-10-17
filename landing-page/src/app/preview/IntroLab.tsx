"use client";

import { useEffect, useRef, useState } from "react";

// Intro candidates for the first visit, played over the real nav and hero. Internal tool for
// choosing one; not linked from the page. All open the same way (the wave mark settles and its
// two waves draw) and differ in how they hand over to the hero. Every one is under 1.6 s,
// skippable with a click, animates only transform, opacity, clip-path or a mask, and never
// starts from scale(0).

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const MARK = 112;

type Variant = { id: string; name: string; note: string };

const VARIANTS: Variant[] = [
  { id: "A", name: "Fly to nav", note: "The first one, for comparison" },
  { id: "A1", name: "Flood", note: "The mark grows until its orange fills the screen, then the page opens from the middle" },
  { id: "A2", name: "Tide", note: "The cover ebbs upward with a wavy edge" },
  { id: "A3", name: "Into the wallet", note: "The mark settles into the hero coin above the wallet" },
  { id: "A4", name: "Ripple", note: "The mark pulses, rings spread, the page opens with the first ring" },
  { id: "A5", name: "Split", note: "Cover and mark split, the top half rises, the bottom half falls" },
];

const WAVE_D = (y: number) => `M-2 ${y}c4.5-3 8.5-3 12.5 0 4 3 8 3 12 0 4-3 8-3 11.5 0`;

function WaveMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="block">
      <clipPath id="intro-mark">
        <rect width="32" height="32" rx="16" />
      </clipPath>
      <g clipPath="url(#intro-mark)">
        <rect width="32" height="32" rx="16" fill="#F2620F" />
        {[18.5, 24.5].map((y, i) => (
          <path
            key={y}
            className="intro-wave"
            style={{ animationDelay: `${120 + i * 110}ms` }}
            pathLength={1}
            d={WAVE_D(y)}
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

// A wavy edge for the tide: one period every 160 px, long enough to slide sideways.
function TideEdge() {
  const period = 160;
  const count = 40;
  let d = "M0 0 L0 30";
  for (let i = 0; i < count; i++) d += ` q${period / 4} 24 ${period / 2} 0 t${period / 2} 0`;
  d += ` L${period * count} 0 Z`;
  return (
    <svg
      className="intro-tide absolute top-full left-0 h-[54px]"
      width={period * count}
      viewBox={`0 0 ${period * count} 54`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} fill="#F3EEE8" />
    </svg>
  );
}

function visible<T extends HTMLElement>(selector: string) {
  return [...document.querySelectorAll<T>(selector)].filter((el) => el.offsetParent);
}

// The hero words slide in from their sides and the scene rises, as the intro hands over.
function heroIn(at: number) {
  const anims: Animation[] = [];
  visible<HTMLElement>("[data-hero-word] > span").forEach((w, i) =>
    anims.push(
      w.animate(
        [
          { opacity: 0, transform: `translateX(${i === 0 ? -40 : 40}px)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: 700, delay: at + i * 80, easing: EASE_OUT, fill: "backwards" },
      ),
    ),
  );
  const stage = visible<HTMLElement>("[data-hero-stage]")[0];
  if (stage)
    anims.push(
      stage.animate([{ opacity: 0, transform: "translateY(24px) scale(0.96)" }, { opacity: 1, transform: "none" }], {
        duration: 800,
        delay: at,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );
  return anims;
}

// The shared opening: the mark settles in; its waves draw through CSS (.intro-wave).
function settle(mark: HTMLElement) {
  return mark.animate([{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1)" }], {
    duration: 400,
    easing: EASE_OUT,
    fill: "both",
  });
}

// The iris in A1 and A4 animates a custom property, so it has to be registered as a length.
function registerIris() {
  try {
    CSS.registerProperty({ name: "--iris", syntax: "<length>", inherits: false, initialValue: "0px" });
  } catch {
    // already registered
  }
}

const IRIS_MASK = "radial-gradient(circle at 50% 50%, #0000 var(--iris), #000 calc(var(--iris) + 1px))";

export function IntroLab() {
  const [variant, setVariant] = useState("A1");
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const root = useRef<HTMLDivElement>(null);

  useEffect(registerIris, []);

  useEffect(() => {
    const r = root.current;
    if (!r) return;
    window.scrollTo(0, 0);
    const q = (sel: string) => r.querySelector<HTMLElement>(sel);
    const anims: Animation[] = [];
    const add = (...list: (Animation | Animation[] | undefined)[]) => list.flat().forEach((a) => a && anims.push(a));
    const HAND_OVER = 720;
    let done = 1500;

    const marks = [...r.querySelectorAll<HTMLElement>("[data-mark]")];
    marks.forEach((m) => add(settle(m)));
    const mark = marks[0];

    if (variant === "A") {
      const logo = visible<HTMLElement>("header a[aria-label]")[0];
      const from = mark.getBoundingClientRect();
      const to = logo?.getBoundingClientRect();
      if (to) {
        const dx = to.left + to.height / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        add(
          mark.animate(
            [
              { transform: "none", opacity: 1 },
              { transform: `translate(${dx}px, ${dy}px) scale(${to.height / from.height})`, opacity: 0 },
            ],
            { duration: 600, delay: HAND_OVER + 30, easing: EASE_IN_OUT, fill: "forwards" },
          ),
        );
      }
      add(r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 900, easing: "ease", fill: "forwards" }));
      add(heroIn(950));
      done = 1400;
    }

    if (variant === "A1") {
      // The mark grows past the corners of the screen: its orange floods it and the waves
      // become two broad cream bands. Then the page opens from the middle.
      const cover = (Math.hypot(innerWidth, innerHeight) / MARK) * 1.15;
      add(
        mark.animate([{ transform: "scale(1)" }, { transform: `scale(${cover})` }], {
          duration: 650,
          delay: HAND_OVER,
          easing: EASE_IN_OUT,
          fill: "forwards",
        }),
      );
      add(
        r.animate([{ "--iris": "0px" }, { "--iris": "120vmax" }], {
          duration: 650,
          delay: HAND_OVER + 560,
          easing: EASE_IN_OUT,
          fill: "forwards",
        }),
      );
      add(heroIn(HAND_OVER + 620));
      done = 1550;
    }

    if (variant === "A2") {
      // The cover ebbs upward like a tide going out, its wavy edge sliding sideways.
      const cover = q("[data-cover]");
      add(
        mark.animate([{ transform: "none" }, { transform: "translateY(-30px)", opacity: 0 }], {
          duration: 450,
          delay: HAND_OVER,
          easing: EASE_OUT,
          fill: "forwards",
        }),
      );
      if (cover)
        add(
          cover.animate([{ transform: "translateY(0)" }, { transform: "translateY(calc(-100% - 60px))" }], {
            duration: 800,
            delay: HAND_OVER + 80,
            easing: EASE_IN_OUT,
            fill: "forwards",
          }),
        );
      add(heroIn(HAND_OVER + 380));
      done = 1600;
    }

    if (variant === "A3") {
      // The mark becomes the hero coin: it travels to the coin above the wallet and settles
      // there as the scene appears around it.
      const stage = visible<HTMLElement>("[data-hero-stage]")[0];
      const from = mark.getBoundingClientRect();
      if (stage) {
        const s = stage.getBoundingClientRect();
        const coinX = s.left + s.width * (306 / 616);
        const coinY = s.top + s.height * (148 / 640);
        const scale = (s.width * (156 / 616)) / from.width;
        const dx = coinX - (from.left + from.width / 2);
        const dy = coinY - (from.top + from.height / 2);
        add(
          mark.animate(
            [
              { transform: "none", opacity: 1 },
              { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 1, offset: 0.85 },
              { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
            ],
            { duration: 800, delay: HAND_OVER, easing: EASE_IN_OUT, fill: "forwards" },
          ),
        );
      }
      const bg = q("[data-bg]");
      if (bg)
        add(bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: HAND_OVER + 150, easing: "ease", fill: "forwards" }));
      add(heroIn(HAND_OVER + 250));
      done = 1550;
    }

    if (variant === "A4") {
      // A small pulse, then rings spread from the mark; the page opens with the first ring.
      add(
        mark.animate([{ transform: "scale(1)" }, { transform: "scale(0.92)", offset: 0.4 }, { transform: "scale(1.04)" }], {
          duration: 320,
          delay: HAND_OVER - 60,
          easing: EASE_OUT,
        }),
      );
      r.querySelectorAll<HTMLElement>("[data-ring]").forEach((ring, i) =>
        add(
          ring.animate([{ transform: "scale(1)", opacity: 0.55 }, { transform: "scale(14)", opacity: 0 }], {
            duration: 1000,
            delay: HAND_OVER + 120 + i * 140,
            easing: EASE_OUT,
            fill: "both",
          }),
        ),
      );
      add(
        r.animate([{ "--iris": "0px" }, { "--iris": "120vmax" }], {
          duration: 900,
          delay: HAND_OVER + 160,
          easing: EASE_OUT,
          fill: "forwards",
        }),
      );
      add(
        mark.animate([{ opacity: 1, transform: "scale(1.04)" }, { opacity: 0, transform: "scale(0.9)" }], {
          duration: 300,
          delay: HAND_OVER + 260,
          easing: EASE_OUT,
          fill: "forwards",
        }),
      );
      add(heroIn(HAND_OVER + 260));
      done = 1550;
    }

    if (variant === "A5") {
      // Cover and mark split along the middle: the top half rises, the bottom half falls.
      const top = q("[data-half='top']");
      const bottom = q("[data-half='bottom']");
      const split = { duration: 750, delay: HAND_OVER + 60, easing: EASE_IN_OUT, fill: "forwards" as const };
      if (top) add(top.animate([{ transform: "none" }, { transform: "translateY(-55%)" }], split));
      if (bottom) add(bottom.animate([{ transform: "none" }, { transform: "translateY(55%)" }], split));
      add(heroIn(HAND_OVER + 300));
      done = 1550;
    }

    const end = window.setTimeout(() => setPlaying(false), done);
    const skip = () => {
      anims.forEach((a) => a.finish());
      setPlaying(false);
    };
    r.addEventListener("click", skip);
    return () => {
      window.clearTimeout(end);
      r.removeEventListener("click", skip);
      anims.forEach((a) => a.cancel());
    };
  }, [variant, run]);

  const current = VARIANTS.find((v) => v.id === variant)!;
  const replay = (id = variant) => {
    setVariant(id);
    setRun((n) => n + 1);
    setPlaying(true);
  };

  const markEl = (
    <div data-mark>
      <WaveMark size={MARK} />
    </div>
  );

  return (
    <>
      <div
        key={`${variant}-${run}`}
        ref={root}
        aria-hidden
        className={`fixed inset-0 z-[60] overflow-hidden ${playing ? "" : "pointer-events-none"}`}
        style={variant === "A1" || variant === "A4" ? { maskImage: IRIS_MASK, WebkitMaskImage: IRIS_MASK } : undefined}
      >
        {variant === "A2" ? (
          <div data-cover className="absolute inset-0 grid place-items-center bg-canvas">
            {markEl}
            <TideEdge />
          </div>
        ) : variant === "A5" ? (
          (["top", "bottom"] as const).map((half) => (
            <div
              key={half}
              data-half={half}
              className="absolute inset-0 grid place-items-center bg-canvas"
              style={{ clipPath: half === "top" ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)" }}
            >
              {markEl}
            </div>
          ))
        ) : (
          <>
            <div data-bg className="absolute inset-0 bg-canvas" />
            <div className="absolute inset-0 grid place-items-center">
              {variant === "A4" &&
                [0, 1, 2].map((i) => (
                  <span key={i} data-ring className="absolute size-28 rounded-full border-2 border-brand opacity-0" />
                ))}
              {markEl}
            </div>
          </>
        )}
      </div>

      <div className="fixed bottom-5 left-1/2 z-[70] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 rounded-pill bg-fg/90 p-1.5 text-sm text-white shadow-nav backdrop-blur">
        <span className="mx-3 hidden max-w-[300px] truncate text-white/70 xl:inline" title={current.note}>
          {current.note}
        </span>
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            title={v.name}
            onClick={() => replay(v.id)}
            className={`rounded-pill px-3 py-1.5 font-medium whitespace-nowrap transition-[background-color,transform] duration-150 active:scale-[0.97] ${v.id === variant ? "bg-white text-fg" : "hover:bg-white/15"}`}
          >
            {v.id} <span className="hidden lg:inline">{v.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => replay()}
          className="rounded-pill bg-brand px-3.5 py-1.5 font-medium whitespace-nowrap transition-transform duration-150 active:scale-[0.97]"
        >
          Replay
        </button>
      </div>
    </>
  );
}
