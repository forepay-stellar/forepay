import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";

let trigger: (visible: boolean) => void = () => {};

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        trigger = (visible) => cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as never);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Reveal", () => {
  it("starts hidden and shows once it scrolls into view", () => {
    render(<Reveal>Card</Reveal>);
    const box = screen.getByText("Card");
    expect(box.className).toContain("opacity-0");
    act(() => trigger(true));
    expect(box.className).not.toContain("opacity-0");
  });

  it("is never hidden with reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    render(<Reveal>Card</Reveal>);
    expect(screen.getByText("Card").className).not.toContain("opacity-0");
  });
});
