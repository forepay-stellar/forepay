import { describe, expect, it } from "vitest";
import { anyBrowserWallet } from "./wallet-detect";

const none = [
  { id: "freighter", isAvailable: false },
  // The kit always reports xBull available, because of its web fallback.
  { id: "xbull", isAvailable: true },
  { id: "rabet", isAvailable: false },
];

describe("anyBrowserWallet", () => {
  it("is false with no extension installed, even though the kit reports xBull", () => {
    expect(anyBrowserWallet(none, false)).toBe(false);
  });

  it("is true with Freighter or Rabet installed", () => {
    expect(anyBrowserWallet([{ ...none[0], isAvailable: true }, none[1], none[2]], false)).toBe(true);
    expect(anyBrowserWallet([none[0], none[1], { ...none[2], isAvailable: true }], false)).toBe(true);
  });

  it("is true when the xBull extension has injected itself", () => {
    expect(anyBrowserWallet(none, true)).toBe(true);
  });
});
