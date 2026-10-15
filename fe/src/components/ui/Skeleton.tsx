"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** One placeholder block. Flat, in the line colour, pulsing unless reduced motion is on. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse bg-line motion-reduce:animate-none", className)} />;
}

/**
 * True once loading has lasted about 200 ms, so a fast answer never flashes a skeleton. Pair it with
 * a 150 to 200 ms opacity fade (ARCHITECTURE.md §7).
 */
export function useDelayedReveal(delayMs = 200): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return shown;
}
