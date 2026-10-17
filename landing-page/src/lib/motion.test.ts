import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canRender3D, usePrefersReducedMotion } from "./motion";

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? matches : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("canRender3D", () => {
  it("renders the 3D hero only with WebGL and without reduced motion", () => {
    expect(canRender3D({ reducedMotion: false, webgl: true })).toBe(true);
    expect(canRender3D({ reducedMotion: true, webgl: true })).toBe(false);
    expect(canRender3D({ reducedMotion: false, webgl: false })).toBe(false);
  });
});

describe("usePrefersReducedMotion", () => {
  it("follows the operating system setting", () => {
    mockReducedMotion(true);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
    mockReducedMotion(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });
});
