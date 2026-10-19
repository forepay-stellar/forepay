import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTRO_SEEN } from "@/lib/intro";
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
  sessionStorage.clear();
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
  it("plays when <head> asked for it, remembers it for the session and ends on its own", () => {
    render(<Intro />);
    expect(sessionStorage.getItem(INTRO_SEEN)).toBe("1");
    expect(calls.length).toBeGreaterThan(0);
    expect(playing()).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(playing()).toBe(false);
  });

  it("does nothing when <head> decided it should not play", () => {
    delete document.documentElement.dataset.intro;
    render(<Intro />);
    expect(calls).toHaveLength(0);
    expect(sessionStorage.getItem(INTRO_SEEN)).toBeNull();
  });

  it("skips to the end on a key press", () => {
    render(<Intro />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(playing()).toBe(false);
    expect(calls.every((c) => c.finished)).toBe(true);
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
