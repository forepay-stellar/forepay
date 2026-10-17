import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Faq } from "./Faq";

afterEach(cleanup);

const items = [
  { q: "Is this real money?", a: "No." },
  { q: "Which wallets work?", a: "Freighter." },
];

const question = (name: string) => screen.getByRole("button", { name });

describe("Faq", () => {
  it("opens the default item and keeps the others closed", () => {
    render(<Faq items={items} defaultOpen={1} />);
    expect(question("Which wallets work?").getAttribute("aria-expanded")).toBe("true");
    expect(question("Is this real money?").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Freighter.")).toBeTruthy();
    expect(screen.queryByText("No.")).toBeNull();
  });

  it("links each open question to its answer", () => {
    render(<Faq items={items} defaultOpen={1} />);
    const id = question("Which wallets work?").getAttribute("aria-controls");
    expect(id && document.getElementById(id)?.textContent).toBe("Freighter.");
  });

  it("opens one item at a time and closes an open one on a second press", () => {
    render(<Faq items={items} defaultOpen={1} />);
    fireEvent.click(question("Is this real money?"));
    expect(screen.getByText("No.")).toBeTruthy();
    expect(screen.queryByText("Freighter.")).toBeNull();
    fireEvent.click(question("Is this real money?"));
    expect(screen.queryByText("No.")).toBeNull();
  });
});
