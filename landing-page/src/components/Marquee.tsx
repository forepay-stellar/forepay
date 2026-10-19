"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// One row of the faint running words behind the lock in Your data. The run is printed twice
// and the track slides by half its width, so the loop has no seam. It runs only while on
// screen; the reduced motion rule in globals.css stops it entirely.
export function Marquee({
  words,
  direction,
  startAt = 0,
  offset = 0,
  repeat = 3,
  className,
}: {
  words: readonly string[];
  direction: "left" | "right";
  startAt?: number;
  // Seconds into the loop to start from, so two rows never line up.
  offset?: number;
  repeat?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ordered = [...words.slice(startAt), ...words.slice(0, startAt)];
  const run = Array.from({ length: repeat }, () => ordered.join("  ")).join("  ") + "  ";

  return (
    <div ref={ref} aria-hidden="true" className={cn("pointer-events-none overflow-hidden whitespace-pre select-none", className)}>
      <div
        data-running={running ? "true" : undefined}
        style={offset ? { animationDelay: `-${offset}s` } : undefined}
        className={direction === "left" ? "marquee-left" : "marquee-right"}
      >
        <span data-half>{run}</span>
        <span data-half>{run}</span>
      </div>
    </div>
  );
}
