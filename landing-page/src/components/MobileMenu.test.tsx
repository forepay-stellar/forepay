import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { MobileMenu } from "./MobileMenu";

afterEach(cleanup);

describe("MobileMenu", () => {
  it("renders nothing when closed", () => {
    render(<MobileMenu open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the four links and the app button when open", () => {
    render(<MobileMenu open onClose={() => {}} />);
    for (const name of ["How it works", "Your data", "The math", "FAQ"]) {
      expect(screen.getByRole("link", { name: new RegExp(name) })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Open the app" })).toBeTruthy();
  });

  it("moves focus into the menu when it opens", () => {
    render(<MobileMenu open onClose={() => {}} />);
    expect(document.activeElement?.textContent).toContain("How it works");
  });

  it("closes on the close button, on Escape and when a link is picked", () => {
    const onClose = vi.fn();
    render(<MobileMenu open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("link", { name: /FAQ/ }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("plays its closing motion before it leaves", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { container, rerender } = render(<MobileMenu open onClose={() => {}} />);
    rerender(<MobileMenu open={false} onClose={() => {}} />);
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.dataset.closing).toBe("true");
    expect(dialog?.hasAttribute("inert")).toBe(true);
    act(() => vi.advanceTimersByTime(400));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("locks page scroll while open and restores it after", () => {
    const { unmount } = render(<MobileMenu open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
