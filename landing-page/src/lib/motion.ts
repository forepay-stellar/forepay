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

// True while the media query matches. False on the server.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// The 3D hero runs only with WebGL and without reduced motion. Otherwise the still image
// exported from forepay.pen stays in its place. Phones get a simpler scene, not no scene.
export function canRender3D(env: { reducedMotion: boolean; webgl: boolean }): boolean {
  return env.webgl && !env.reducedMotion;
}

let webglCache: boolean | undefined;

// Whether this browser can draw WebGL. Creating the first context is a synchronous GPU start-up
// on the main thread (hundreds of ms on some machines), so call this only once the page has
// painted, never during render or hydration. The probe context is released straight away.
export function hasWebGL(): boolean {
  if (webglCache === undefined) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webglCache = Boolean(gl);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}
