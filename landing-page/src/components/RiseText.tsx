"use client";

import { Fragment, useLayoutEffect, useRef } from "react";

// Shoots out, then settles softly.
const EASE_RISE = "cubic-bezier(0.35, 0, 0, 1)";

// A heading's letters rise one by one from under their line the first time it scrolls into
// view, the way the hero's words arrive after the intro. Each word clips its own letters at a
// line just under the text (globals.css), so lines still wrap between words. Screen readers get
// the text whole. With reduced motion, or before the script runs, the text is simply there.
export function RiseText({ text, delay = 0, stagger = 28 }: { text: string; delay?: number; stagger?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Hidden under their line until the heading comes into view (globals.css).
    el.dataset.rise = "wait";
    const anims: Animation[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        el.querySelectorAll("[data-rise-letter]").forEach((letter, i) =>
          anims.push(
            letter.animate([{ transform: "translateY(120%)" }, { transform: "none" }], {
              duration: 900,
              delay: delay + i * stagger,
              easing: EASE_RISE,
              fill: "backwards",
            }),
          ),
        );
        delete el.dataset.rise;
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      anims.forEach((a) => a.cancel());
      delete el.dataset.rise;
    };
  }, [delay, stagger]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden>
        {text.split(" ").map((word, w) => (
          <Fragment key={w}>
            {w > 0 && " "}
            <span data-rise-word className="inline-block">
              {[...word].map((ch, i) => (
                <span key={i} data-rise-letter className="inline-block">
                  {ch}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </>
  );
}
