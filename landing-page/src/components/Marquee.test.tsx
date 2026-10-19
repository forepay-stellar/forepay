import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Marquee } from "./Marquee";

let setVisible: (visible: boolean) => void = () => {};

beforeEach(() => {
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Marquee", () => {
  it("is hidden from screen readers and repeats the run twice for a seamless loop", () => {
    const { container } = render(<Marquee words={["password", "emails"]} direction="left" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.getAttribute("aria-hidden")).toBe("true");
    const halves = row.querySelectorAll("[data-half]");
    expect(halves).toHaveLength(2);
    expect(halves[0].textContent).toBe(halves[1].textContent);
    expect(halves[0].textContent).toContain("password  emails");
  });

  it("can start the run from another word", () => {
    const { container } = render(<Marquee words={["password", "emails", "payments"]} startAt={1} direction="right" />);
    expect(container.querySelector("[data-half]")?.textContent?.startsWith("emails")).toBe(true);
    expect(container.innerHTML).toContain("marquee-right");
  });

  it("runs only while on screen", () => {
    const { container } = render(<Marquee words={["a"]} direction="left" />);
    const track = container.querySelector(".marquee-left") as HTMLElement;
    expect(track.dataset.running).toBeUndefined();
    act(() => setVisible(true));
    expect(track.dataset.running).toBe("true");
    act(() => setVisible(false));
    expect(track.dataset.running).toBeUndefined();
  });
});
