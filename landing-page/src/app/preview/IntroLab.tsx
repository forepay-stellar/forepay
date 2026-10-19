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
  { id: "F1", name: "Classic", note: "The flood from before: the page opens from the middle" },
  { id: "F2", name: "Drain", note: "The orange drains away downward with a wavy edge" },
  { id: "F3", name: "Dive", note: "Dive into a cream wave until the screen is cream, which is the page" },
  { id: "F4", name: "Message", note: "Paid early. appears on the orange, then the page opens" },
  { id: "F5", name: "Soft", note: "A feathered opening, the hero eases back as it appears" },
  { id: "C1", name: "Slide", note: "Three pieces slide together into the mark, then rewind apart, the page builds itself" },
  { id: "C2", name: "Stack", note: "The pieces drop in and stack into the mark, then rewind up and away, the page builds itself" },
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

// The same mark cut along the middle of its two waves into three orange pieces. Each piece is
// the whole mark clipped to its band, waves included, so at rest the three add up to the mark
// pixel for pixel.
// Each piece turns around its own middle, in the mark's 32 × 32 box.
const PIECE_ORIGINS = ["16px 9px", "16px 21px", "16px 28px"];

const PIECE_REGIONS = [
  `${WAVE_D(18.5)} L40 -10 L-8 -10 Z`,
  `${WAVE_D(18.5)} L40 42 L-8 42 Z`,
  `${WAVE_D(24.5)} L40 42 L-8 42 Z`,
];

function PiecesMark({ size, draw }: { size: number; draw: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="block overflow-visible">
      <defs>
        <clipPath id="piece-circle">
          <rect width="32" height="32" rx="16" />
        </clipPath>
        {PIECE_REGIONS.map((d, i) => (
          <clipPath key={i} id={`piece-${i}`}>
            <path d={d} />
          </clipPath>
        ))}
        {/* The waves are cut out, not painted cream, so a moving piece never drags a cream sliver
            over the page */}
        <mask id="piece-cut" maskUnits="userSpaceOnUse" x="-8" y="-10" width="48" height="52">
          <rect x="-8" y="-10" width="48" height="52" fill="white" />
          {[18.5, 24.5].map((y, w) => (
            <path
              key={y}
              className={draw ? "intro-wave" : undefined}
              style={draw ? { animationDelay: `${120 + w * 110}ms` } : undefined}
              pathLength={1}
              d={WAVE_D(y)}
              fill="none"
              stroke="black"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          ))}
        </mask>
        {/* The middle band also stops at the second wave */}
        <clipPath id="piece-1b">
          <path d={`${WAVE_D(24.5)} L40 -10 L-8 -10 Z`} />
        </clipPath>
      </defs>
      {PIECE_REGIONS.map((_, i) => (
        <g key={i} data-piece style={{ transformBox: "view-box", transformOrigin: PIECE_ORIGINS[i] }}>
          <g clipPath={`url(#piece-${i})`}>
            <g clipPath={i === 1 ? "url(#piece-1b)" : undefined}>
              <g clipPath="url(#piece-circle)">
                <rect width="32" height="32" rx="16" fill="#F2620F" mask="url(#piece-cut)" />
              </g>
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}

// A wavy edge: one period every 160 px, long enough to slide sideways. Below its sheet by
// default; flipped, it sits on top.
function TideEdge({ color = "#F3EEE8", flip = false }: { color?: string; flip?: boolean }) {
  const period = 160;
  const count = 40;
  let d = "M0 0 L0 30";
  for (let i = 0; i < count; i++) d += ` q${period / 4} 24 ${period / 2} 0 t${period / 2} 0`;
  d += ` L${period * count} 0 Z`;
  return (
    // The flip sits on a wrapper: the sliding animation owns the svg's own transform.
    <div className={`absolute left-0 h-[54px] ${flip ? "bottom-full -scale-y-100" : "top-full"}`}>
      <svg
        className="intro-tide h-full"
        width={period * count}
        viewBox={`0 0 ${period * count} 54`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={d} fill={color} />
      </svg>
    </div>
  );
}

function visible<T extends HTMLElement>(selector: string) {
  return [...document.querySelectorAll<T>(selector)].filter((el) => el.offsetParent);
}

// The hero words slide in from their sides and the scene rises, as the intro hands over.
function heroIn(at: number, zoom = false) {
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
      stage.animate([{ opacity: 0, transform: zoom ? "scale(1.06)" : "translateY(24px) scale(0.96)" }, { opacity: 1, transform: "none" }], {
        duration: 800,
        delay: at,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );
  return anims;
}

// The Dive hand-over: as the cream cover leaves, the page builds itself instead of being there
// already. The scene settles from the dive's zoom, the letters of each word rise from under
// their line, the nav comes down, then the copy and buttons rise, one after another.
function heroEntrance(at: number) {
  const anims: Animation[] = [];
  const rise = (el: HTMLElement, delay: number, from: string, duration = 700) =>
    anims.push(
      el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], {
        duration,
        delay,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );

  const stage = visible<HTMLElement>("[data-hero-stage]")[0];
  if (stage)
    anims.push(
      stage.animate([{ opacity: 0, transform: "scale(1.08)" }, { opacity: 1, transform: "none" }], {
        duration: 1000,
        delay: at,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );

  // Letters 35 ms apart, the second word 140 ms after the first. Each line clips its letters
  // while they rise; the clip reaches below the baseline so descenders never get cut.
  const LETTER = 750;
  visible<HTMLElement>("[data-hero-line]").forEach((line, w) => {
    const letters = [...line.querySelectorAll<HTMLElement>("[data-hero-letter]")];
    const start = at + 60 + w * 140;
    letters.forEach((l, i) =>
      anims.push(
        l.animate([{ transform: "translateY(140%)" }, { transform: "none" }], {
          duration: LETTER,
          delay: start + i * 35,
          easing: EASE_OUT,
          fill: "backwards",
        }),
      ),
    );
    const clip = "inset(-0.3em -0.2em -0.3em -0.2em)";
    anims.push(
      line.animate([{ clipPath: clip }, { clipPath: clip }], {
        duration: 60 + w * 140 + letters.length * 35 + LETTER,
        delay: at,
        fill: "backwards",
      }),
    );
  });

  visible<HTMLElement>("[data-nav-item]").forEach((el, i) => rise(el, at + 320 + i * 70, "translateY(-14px)", 600));
  visible<HTMLElement>("[data-hero-rise]").forEach((el, i) => rise(el, at + 420 + i * 70, "translateY(20px)"));
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
const SOFT_IRIS_MASK = "radial-gradient(circle at 50% 50%, #0000 var(--iris), #000 calc(var(--iris) + 180px))";

// The point where the first wave starts its second crest, on the stroke itself: (10.5, 18.5)
// in the mark's 32 × 32 box. Diving in around it fills the screen with the wave's cream.
const WAVE_POINT = `${(10.5 / 32) * 100}% ${(18.5 / 32) * 100}%`;

export function IntroLab() {
  const [variant, setVariant] = useState("C1");
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
    // The C intros build the mark from its pieces instead.
    if (!variant.startsWith("C")) marks.forEach((m) => add(settle(m)));
    const mark = marks[0];

    const cover = (Math.hypot(innerWidth, innerHeight) / MARK) * 1.15;
    // Further still: the waves sit below the mark's centre, so at this size they pass below the
    // screen and it is plain orange.
    const pastWaves = Math.max(cover, (innerHeight / 2 / ((2.5 / 32) * MARK)) * 1.25);
    // The flood: the mark grows past the corners of the screen, its waves become broad bands.
    const flood = (duration: number, scale = cover) =>
      mark.animate([{ transform: "scale(1)" }, { transform: `scale(${scale})` }], {
        duration,
        delay: HAND_OVER,
        easing: EASE_IN_OUT,
        fill: "forwards",
      });
    const iris = (at: number, duration: number, to = "120vmax") =>
      r.animate([{ "--iris": "0px" }, { "--iris": to }], { duration, delay: at, easing: EASE_IN_OUT, fill: "forwards" });
    // Instant switches, so one layer can take over from another mid intro.
    const swap = (el: HTMLElement | null, at: number, from: number, to: number) =>
      el?.animate([{ opacity: from }, { opacity: to }], { duration: 1, delay: at, fill: "both" });

    if (variant === "F1") {
      add(flood(650), iris(HAND_OVER + 560, 650));
      add(heroIn(HAND_OVER + 620));
      done = 1550;
    }

    if (variant === "F2") {
      // The flood grows past the waves until the screen is plain orange; then an identical orange
      // sheet with a wavy top takes over, invisibly, and drains down.
      const sheet = q("[data-sheet]");
      const full = HAND_OVER + 620;
      add(flood(620, pastWaves), swap(q("[data-bg]"), full, 1, 0), swap(sheet, full, 0, 1), swap(mark, full + 1, 1, 0));
      if (sheet)
        add(
          sheet.animate([{ transform: "translateY(0)" }, { transform: "translateY(calc(100% + 60px))" }], {
            duration: 800,
            delay: full + 40,
            easing: EASE_IN_OUT,
            fill: "forwards",
          }),
        );
      add(heroIn(full + 200));
      done = 1650;
    }

    if (variant === "F3") {
      // Dive into the first wave: the cream stroke grows around a point on itself until it
      // covers the screen. The cream is the page's own canvas colour, so the cover just leaves.
      mark.style.transformOrigin = WAVE_POINT;
      add(
        mark.animate([{ transform: "scale(1)" }, { transform: "scale(420)" }], {
          duration: 900,
          delay: HAND_OVER,
          easing: "cubic-bezier(0.7, 0, 0.84, 0)",
          fill: "forwards",
        }),
      );
      add(swap(q("[data-bg]"), HAND_OVER + 900, 1, 0), swap(mark, HAND_OVER + 901, 1, 0));
      add(heroEntrance(HAND_OVER + 900));
      done = 1700;
    }

    if (variant === "C1" || variant === "C2") {
      // The mark builds from its three pieces, holds, then the same animation plays backwards:
      // the last piece in is the first out. Units are the mark's 32 × 32 box, 3.5 px on screen.
      const pieces = [...r.querySelectorAll<SVGGElement>("[data-piece]")];
      const slide = variant === "C1";
      const from = slide
        ? ["translate(-22px, -4px) rotate(-10deg)", "translate(24px, 0) rotate(8deg)", "translate(-18px, 5px) rotate(-6deg)"]
        : ["translateY(-26px) rotate(-8deg)", "translateY(-30px) rotate(6deg)", "translateY(-34px) rotate(-4deg)"];
      // Slide brings them in top to bottom; Stack drops the bottom piece first and builds upward.
      const order = slide ? [0, 1, 2] : [2, 1, 0];
      // Stack lands with a small overshoot; played backwards it becomes a small lift before leaving.
      const easing = slide ? EASE_OUT : "cubic-bezier(0.34, 1.36, 0.64, 1)";
      const BUILD = 620;
      const GAP = 90;
      const IN = 80;
      const HOLD = IN + 2 * GAP + BUILD + 260;
      pieces.forEach((p, i) => {
        const keyframes = [
          { transform: from[i], opacity: 0 },
          { opacity: 1, offset: 0.4 },
          { transform: "none", opacity: 1 },
        ];
        const step = order.indexOf(i);
        add(p.animate(keyframes, { duration: BUILD, delay: IN + step * GAP, easing, fill: "backwards" }));
        add(
          p.animate(keyframes, {
            duration: BUILD,
            delay: HOLD + (2 - step) * GAP,
            easing,
            direction: "reverse",
            fill: "forwards",
          }),
        );
      });
      // The page starts building as the last piece fades, so the rewind plays on clean cream.
      const at = HOLD + 2 * GAP + 480;
      add(swap(q("[data-bg]"), at, 1, 0));
      add(heroEntrance(at));
      done = at + 900;
    }

    if (variant === "F4") {
      // The flood carries the message: Paid early. rises in cream on the orange, then the page opens.
      const words = q("[data-message]");
      // Grow past the waves, so the message stands on plain orange.
      add(flood(620, pastWaves));
      if (words)
        add(
          words.animate([{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], {
            duration: 450,
            delay: HAND_OVER + 480,
            easing: EASE_OUT,
            fill: "both",
          }),
        );
      add(iris(HAND_OVER + 1050, 650));
      add(heroIn(HAND_OVER + 1100));
      done = 2000;
    }

    if (variant === "F5") {
      // As F1, but the opening has a wide feathered edge and the hero eases back into place.
      add(flood(650), iris(HAND_OVER + 520, 800, "140vmax"));
      add(heroIn(HAND_OVER + 560, true));
      done = 1650;
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
      {variant.startsWith("C") ? <PiecesMark size={MARK} draw={false} /> : <WaveMark size={MARK} />}
    </div>
  );

  return (
    <>
      <div
        key={`${variant}-${run}`}
        ref={root}
        aria-hidden
        className={`fixed inset-0 z-[60] overflow-hidden ${playing ? "" : "pointer-events-none"}`}
        style={
          variant === "F1" || variant === "F4"
            ? { maskImage: IRIS_MASK, WebkitMaskImage: IRIS_MASK }
            : variant === "F5"
              ? { maskImage: SOFT_IRIS_MASK, WebkitMaskImage: SOFT_IRIS_MASK }
              : undefined
        }
      >
        <div data-bg className="absolute inset-0 bg-canvas" />
        {variant === "F2" && (
          <div data-sheet className="absolute inset-0 bg-brand opacity-0">
            <TideEdge color="#F2620F" flip />
          </div>
        )}
        <div className="absolute inset-0 grid place-items-center">
          {markEl}
          {variant === "F4" && (
            <p
              data-message
              className="absolute text-[min(16vw,230px)] leading-[0.9] font-semibold tracking-[-0.048em] whitespace-nowrap text-cream opacity-0"
            >
              Paid early.
            </p>
          )}
        </div>
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
