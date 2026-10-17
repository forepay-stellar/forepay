import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "./CountUp";

let setVisible: (visible: boolean) => void = () => {};
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        setVisible = (v) => cb([{ isIntersecting: v } as IntersectionObserverEntry], this as never);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const shown = (container: HTMLElement) => container.querySelector("[aria-hidden]")?.textContent;

describe("CountUp", () => {
  it("always gives screen readers the final number", () => {
    render(<CountUp to={100} />);
    expect(screen.getByText("100", { selector: ".sr-only" })).toBeTruthy();
  });

  it("waits at 0 off screen, then counts up to exactly the target", () => {
    const { container } = render(<CountUp to={25} durationMs={100} />);
    act(() => setVisible(false));
    expect(shown(container)).toBe("0");
    act(() => setVisible(true));
    act(() => frames.shift()?.(performance.now() + 1000));
    expect(shown(container)).toBe("25");
  });

  it("shows the final number straight away with reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<CountUp to={100} />);
    act(() => setVisible(false));
    expect(shown(container)).toBe("100");
  });
});
