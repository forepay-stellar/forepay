"use client";

import { useSyncExternalStore } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// True when the visitor asked for less motion. On the server it is false; the page renders
// the same HTML either way and only the motion differs.
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

// The 3D hero runs only with WebGL and without reduced motion. Otherwise the still image
// exported from forepay.pen stays in its place. Phones get a simpler scene, not no scene.
export function canRender3D(env: { reducedMotion: boolean; webgl: boolean }): boolean {
  return env.webgl && !env.reducedMotion;
}

let webglCache: boolean | undefined;

function hasWebGL(): boolean {
  if (webglCache === undefined) {
    try {
      const canvas = document.createElement("canvas");
      webglCache = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}

export function useCanRender3D(): boolean {
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useSyncExternalStore(
    () => () => {},
    hasWebGL,
    () => false,
  );
  return canRender3D({ reducedMotion, webgl });
}
