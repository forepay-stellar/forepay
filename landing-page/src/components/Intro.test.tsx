import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Intro } from "./Intro";

// jsdom has no Web Animations; a stub records each call and whether it was finished.
const calls: { el: Element; finished: boolean }[] = [];

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  Element.prototype.animate = function (this: Element) {
    const call = { el: this, finished: false };
    calls.push(call);
    return { finish: () => (call.finished = true), cancel() {} } as unknown as Animation;
  };
  stubMotion(false);
  document.documentElement.dataset.intro = "";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).animate;
  delete document.documentElement.dataset.intro;
});

const playing = () => "intro" in document.documentElement.dataset;

describe("Intro", () => {
  it("plays when <head> asked for it and ends on its own", () => {
    render(<Intro />);
    expect(calls.length).toBeGreaterThan(0);
    expect(playing()).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(playing()).toBe(false);
  });

  it("does nothing when <head> decided it should not play", () => {
    delete document.documentElement.dataset.intro;
    render(<Intro />);
    expect(calls).toHaveLength(0);
  });

  it("plays through: a key, a click or the wheel does not skip it", () => {
    render(<Intro />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(window);
    fireEvent.wheel(window);
    expect(playing()).toBe(true);
    expect(calls.some((c) => c.finished)).toBe(false);
  });

  it("holds the page still while it plays and marks the hero as settling until done", () => {
    render(<Intro />);
    expect(document.body.style.overflow).toBe("hidden");
    expect("settling" in document.documentElement.dataset).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(document.body.style.overflow).toBe("");
    expect("settling" in document.documentElement.dataset).toBe(false);
  });

  it("only fades the mark with reduced motion", () => {
    stubMotion(true);
    const { container } = render(<Intro />);
    expect(calls).toHaveLength(1);
    expect(calls[0].el).toBe(container.querySelector("[data-intro-overlay]"));
    vi.advanceTimersByTime(1000);
    expect(playing()).toBe(false);
  });
});
