import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClayIn } from "./ClayIn";
import { RiseText } from "./RiseText";

let trigger: (visible: boolean) => void = () => {};
let animations = 0;

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  animations = 0;
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
  Element.prototype.animate = function () {
    animations++;
    return { cancel() {} } as unknown as Animation;
  };
  stubMotion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).animate;
});

describe("RiseText", () => {
  it("gives screen readers the whole text and splits the rest into letters", () => {
    const { container } = render(<RiseText text="A simple rule" />);
    expect(screen.getByText("A simple rule").className).toContain("sr-only");
    expect(container.querySelectorAll("[data-rise-word]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-rise-letter]")).toHaveLength(11);
  });

  it("waits under its line, then raises every letter once in view", () => {
    const { container } = render(<RiseText text="Paid early." />);
    const letters = container.querySelector("[aria-hidden]") as HTMLElement;
    expect(letters.dataset.rise).toBe("wait");
    act(() => trigger(true));
    expect(letters.dataset.rise).toBeUndefined();
    expect(animations).toBe(10);
  });

  it("is simply there with reduced motion", () => {
    stubMotion(true);
    const { container } = render(<RiseText text="Paid early." />);
    expect((container.querySelector("[aria-hidden]") as HTMLElement).dataset.rise).toBeUndefined();
  });
});

describe("ClayIn", () => {
  it("is hidden until it scrolls into view, then rises in", () => {
    const { container } = render(<ClayIn>clay</ClayIn>);
    const box = container.firstElementChild as HTMLElement;
    expect(box.dataset.clay).toBe("wait");
    act(() => trigger(true));
    expect(box.dataset.clay).toBeUndefined();
    expect(animations).toBe(1);
  });

  it("is never hidden with reduced motion", () => {
    stubMotion(true);
    const { container } = render(<ClayIn>clay</ClayIn>);
    expect((container.firstElementChild as HTMLElement).dataset.clay).toBeUndefined();
  });
});
