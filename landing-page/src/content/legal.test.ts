import { describe, expect, it } from "vitest";
import { ADMOB_SCOPE, ADSENSE_SCOPE, CONTACT_EMAIL, LIMITED_USE, privacy, terms, type Inline, type LegalDocument, type Paragraph } from "./legal";
import { landing } from "./landing";

// Acronyms are the only all-caps words allowed (brief §3).
const ACRONYMS = new Set(["USDC", "USD", "HTTPS", "ID"]);

function text(p: Paragraph): string {
  if (typeof p === "string") return p;
  return p.map((part: Inline) => (typeof part === "string" ? part : "text" in part ? part.text : "")).join("");
}

function paragraphs(doc: LegalDocument): Paragraph[] {
  return [
    doc.title,
    doc.effective,
    ...doc.intro,
    ...doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.items ?? []), ...(s.after ?? [])]),
  ];
}

function links(doc: LegalDocument): string[] {
  return paragraphs(doc).flatMap((p) =>
    typeof p === "string" ? [] : p.flatMap((part) => (typeof part !== "string" && "href" in part ? [part.href] : [])),
  );
}

const all = (doc: LegalDocument) => paragraphs(doc).map(text).join(" ");

describe.each([
  ["privacy", privacy],
  ["terms", terms],
])("%s copy", (_, doc) => {
  // The Limited Use statement is Google's wording and is checked on its own below.
  const strings = paragraphs(doc)
    .filter((p) => p !== LIMITED_USE)
    .map(text)
    .map((t) => t.replace(CONTACT_EMAIL, "").replace(/\S+\.(xyz|fun|com)\S*/g, ""));

  it.each(strings)("follows the copy rules: %s", (t) => {
    expect(t, "em dash").not.toMatch(/—/);
    expect(t, "middle dot").not.toMatch(/·/);
    expect(t, "semicolon").not.toMatch(/;/);
    expect(t, "colon").not.toMatch(/:/);
    for (const word of t.match(/\b[A-Z]{2,}\b/g) ?? []) {
      expect(ACRONYMS.has(word), `all caps word "${word}"`).toBe(true);
    }
  });

  it("says it is a testnet product and gives the contact", () => {
    expect(all(doc)).toMatch(/testnet/);
    expect(all(doc)).toContain(CONTACT_EMAIL);
    expect(links(doc)).toContain(`mailto:${CONTACT_EMAIL}`);
    expect(doc.effective).toMatch(/^Effective \d{1,2} [A-Z][a-z]+ \d{4}\.$/);
  });
});

describe("privacy policy (#85)", () => {
  const body = all(privacy);
  const scopes = paragraphs(privacy).flatMap((p) =>
    typeof p === "string" ? [] : p.flatMap((part) => (typeof part !== "string" && "code" in part ? [part.code] : [])),
  );

  it("names the two scopes, the same ones be/ asks for, and says only one is asked for", () => {
    expect(scopes.filter((c) => c.startsWith("https://www.googleapis.com/auth/"))).toEqual([ADSENSE_SCOPE, ADMOB_SCOPE]);
    expect(ADSENSE_SCOPE).toBe("https://www.googleapis.com/auth/adsense.readonly");
    expect(ADMOB_SCOPE).toBe("https://www.googleapis.com/auth/admob.readonly");
    expect(body).toMatch(/One permission only, for the service you choose/);
  });

  it("carries Google's Limited Use statement word for word", () => {
    expect(text(LIMITED_USE)).toBe(
      "Forepay's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    );
    expect(links(privacy)).toContain("https://developers.google.com/terms/api-services-user-data-policy");
  });

  it("puts what becomes public in the highlighted box, all four fields", () => {
    const pub = privacy.sections.find((s) => s.prominent);
    expect(pub?.heading).toBe("What becomes public");
    const items = (pub?.items ?? []).map(text).join(" ");
    for (const field of ["publisher ID", "date window", "revenue figure", "Stellar address"]) {
      expect(items).toContain(field);
    }
    expect(text(pub?.after?.[0] ?? "")).toMatch(/public and permanent/);
  });

  it("tells the creator how to revoke access", () => {
    expect(links(privacy)).toContain("https://myaccount.google.com/permissions");
  });

  it("makes no claim the relay does not back", () => {
    expect(body).toMatch(/up to one hour/);
    expect(body).not.toMatch(/encrypt|delete your data on request|GDPR|cookie/i);
  });
});

describe("terms (#85)", () => {
  it("cover testnet, no advice, as is, account ownership and the public proof", () => {
    const body = all(terms);
    expect(body).toMatch(/no real funds/);
    expect(body).toMatch(/not a lending offer/);
    expect(body).toMatch(/financial advice/);
    expect(body).toMatch(/as is/);
    expect(body).toMatch(/own, or that you are authorised to use/);
    expect(links(terms)).toContain("/privacy");
  });
});

describe("footer", () => {
  it("links both pages", () => {
    expect(landing.footer.legalLinks.map((l) => l.href)).toEqual(["/privacy", "/terms"]);
  });
});
