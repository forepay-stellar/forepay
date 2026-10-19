import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Faq } from "./Faq";

afterEach(cleanup);

const items = [
  { q: "Is this real money?", a: "No." },
  { q: "Which wallets work?", a: "Freighter." },
];

const question = (name: string) => screen.getByRole("button", { name });
// Answers stay mounted for their animation; a closed one is inert.
const panel = (answer: string) => screen.getByText(answer).closest("[data-open]");
const isOpen = (answer: string) => panel(answer)?.getAttribute("data-open") === "true";
const isInert = (answer: string) => panel(answer)?.hasAttribute("inert");

describe("Faq", () => {
  it("opens the default item and keeps the others closed", () => {
    render(<Faq items={items} defaultOpen={1} />);
    expect(question("Which wallets work?").getAttribute("aria-expanded")).toBe("true");
    expect(question("Is this real money?").getAttribute("aria-expanded")).toBe("false");
    expect(isOpen("Freighter.")).toBe(true);
    expect(isOpen("No.")).toBe(false);
    expect(isInert("No.")).toBe(true);
    expect(isInert("Freighter.")).toBe(false);
  });

  it("links each open question to its answer", () => {
    render(<Faq items={items} defaultOpen={1} />);
    const id = question("Which wallets work?").getAttribute("aria-controls");
    expect(id && document.getElementById(id)?.textContent).toBe("Freighter.");
  });

  it("opens one item at a time and closes an open one on a second press", () => {
    render(<Faq items={items} defaultOpen={1} />);
    fireEvent.click(question("Is this real money?"));
    expect(isOpen("No.")).toBe(true);
    expect(isOpen("Freighter.")).toBe(false);
    fireEvent.click(question("Is this real money?"));
    expect(isOpen("No.")).toBe(false);
  });
});
