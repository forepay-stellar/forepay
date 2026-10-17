import { describe, expect, it } from "vitest";
import { allStrings, landing } from "./landing";

// Acronyms are the only all-caps words allowed (brief §3: no all-caps labels).
const ACRONYMS = new Set(["USDC", "XLM", "FAQ", "AGPL", "API", "ID"]);
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

describe("landing copy", () => {
  const strings = allStrings(landing);

  it("has copy to check", () => {
    expect(strings.length).toBeGreaterThan(40);
  });

  it.each(strings)("follows the copy rules: %s", (text) => {
    expect(text, "em dash").not.toMatch(/—/);
    expect(text, "middle dot").not.toMatch(/·/);
    expect(text, "semicolon").not.toMatch(/;/);
    expect(text, "colon").not.toMatch(/:/);
    expect(text, "clock time").not.toMatch(/\b\d{1,2}[.:]\d{2}\b/);
    expect(text, "fixed revenue window").not.toMatch(new RegExp(`\b(${MONTHS})\b.*\bto\b`));
    expect(text, "buzzword").not.toMatch(
      /\b(seamless|unlock|empower|revolutionary|next-gen|trustless|supercharge|effortless|game-changing|leverage)\b/i,
    );
    for (const word of text.match(/\b[A-Z]{2,}\b/g) ?? []) {
      expect(ACRONYMS.has(word), `all caps word "${word}"`).toBe(true);
    }
  });

  it("states the contract's numbers and nothing the contract does not do", () => {
    const all = strings.join(" ");
    expect(all).toContain("100 USDC");
    expect(landing.theMath.rate.value).toBe(25);
    expect(landing.theMath.cap.value).toBe(100);
    expect(all).not.toMatch(/due date is|interest rate|late fee|penalt|reminder/i);
  });

  it("uses the agreed legal and testnet lines", () => {
    expect(landing.footer.legal).toBe("© 2026 Forepay. Open source under AGPL-3.0.");
    expect(landing.footer.testnet).toBe("Live on Stellar testnet");
  });
});

describe("allStrings", () => {
  it("collects nested copy and skips links and image paths", () => {
    expect(
      allStrings({ a: "Hello", b: [{ href: "#faq", label: "FAQ" }], img: "/clay/x.png", url: "https://x.y", k: "APP" }),
    ).toEqual(["Hello", "FAQ"]);
  });
});
