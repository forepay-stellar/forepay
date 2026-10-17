"use client";

import { useEffect, useRef, useState } from "react";
import { countUpValue } from "@/lib/countUp";
import { usePrefersReducedMotion } from "@/lib/motion";

// Counts from 0 to `to` the first time it scrolls into view. The server and reduced motion
// render the final number; screen readers always get the final number.
export function CountUp({ to, durationMs = 900 }: { to: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (reduced || !el) return;
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Still off screen: park at 0 so the count is ready when it arrives.
        if (!entry.isIntersecting) {
          setProgress(0);
          return;
        }
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / durationMs);
          setProgress(p);
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, durationMs, reduced]);

  const shown = progress === null ? to : countUpValue(to, progress);

  return (
    <span ref={ref} className="tabular-nums">
      <span className="sr-only">{to}</span>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
