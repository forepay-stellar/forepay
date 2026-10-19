import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins classes and lets the later Tailwind class win", () => {
    expect(cn("px-4 text-fg", false && "hidden", "px-8")).toBe("text-fg px-8");
  });
});
