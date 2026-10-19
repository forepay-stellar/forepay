import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps a type role next to a text colour", () => {
    expect(cn("text-card-title text-fg")).toBe("text-card-title text-fg");
  });

  it("lets a later type role or pixel size win, as with any font size", () => {
    expect(cn("text-body", "text-small")).toBe("text-small");
    expect(cn("text-page-title", "text-[20px]")).toBe("text-[20px]");
  });
});
