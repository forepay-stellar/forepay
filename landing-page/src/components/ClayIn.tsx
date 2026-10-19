"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";

// The clay objects outside the hero are still images, so they get their life from transforms:
// the first time one scrolls into view it rises and settles with a little bounce, then it keeps
// floating a few pixels up and down, as the hero's coins do. `float` offsets that loop, so
// objects next to each other do not move in step. With reduced motion they stay still.
export function ClayIn({
  children,
  className,
  delay = 0,
  float = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  float?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    el.dataset.clay = "wait";
    let anim: Animation | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        anim = el.animate(
          [
            { opacity: 0, transform: "translateY(32px) scale(0.92)" },
            { opacity: 1, transform: "none" },
          ],
          // A small overshoot, so the object lands rather than stops.
          { duration: 900, delay, easing: "cubic-bezier(0.34, 1.36, 0.64, 1)", fill: "backwards" },
        );
        delete el.dataset.clay;
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      anim?.cancel();
      delete el.dataset.clay;
    };
  }, [delay]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="clay-float absolute inset-0" style={{ animationDelay: `${-float}s` }}>
        {children}
      </div>
    </div>
  );
}
