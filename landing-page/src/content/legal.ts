// The privacy policy and terms of service (#85), needed to publish the Google consent screen (#86).
// Every claim matches what be/ does today: the scope (be/src/adsense/request.ts), the token handling
// and the one hour a proof job is kept (be/src/api/app.ts). Change the code and this together.
// Same copy rules as the landing page, checked by legal.test.ts.

// A paragraph is plain text, or a run of text with links and code in it.
export type Inline = string | { text: string; href: string } | { code: string };
export type Paragraph = string | readonly Inline[];
export type Section = {
  heading: string;
  paragraphs?: readonly Paragraph[];
  items?: readonly Paragraph[];
  after?: readonly Paragraph[];
  // Shown in a highlighted box: what a creator most needs to know.
  prominent?: boolean;
};
export type LegalDocument = {
  title: string;
  effective: string;
  intro: readonly Paragraph[];
  sections: readonly Section[];
};

export const CONTACT_EMAIL = "m.ulinasidiki@gmail.com";
export const ADSENSE_SCOPE = "https://www.googleapis.com/auth/adsense.readonly";
const EFFECTIVE = "Effective 23 October 2026.";
const contact = { text: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` };

// Google's required statement, word for word.
export const LIMITED_USE: readonly Inline[] = [
  "Forepay's use and transfer of information received from Google APIs will adhere to the ",
  { text: "Google API Services User Data Policy", href: "https://developers.google.com/terms/api-services-user-data-policy" },
  ", including the Limited Use requirements.",
];

export const privacy: LegalDocument = {
  title: "Privacy policy",
  effective: EFFECTIVE,
  intro: [
    "Forepay is a demo on Stellar testnet. It shows how a creator could prove their AdSense revenue and get a USDC advance on it. No real money moves.",
    "This policy says what Forepay reads from your Google account, what happens to it, and what becomes public.",
  ],
  sections: [
    {
      heading: "What we ask Google for",
      items: [
        ["One permission only, ", { code: ADSENSE_SCOPE }, ", which is read only access to your AdSense reports."],
        "It cannot change anything in AdSense. It cannot read your Gmail, Drive, contacts or anything else in your Google account.",
        "You grant it in Google's own sign in window. Forepay never sees your Google password.",
      ],
    },
    {
      heading: "What we read with it",
      items: [
        "The list of AdSense accounts your Google account can open, and the state of the one you use, which says whether it is approved.",
        "One report for that account, your estimated earnings in USD for the last three complete calendar months.",
      ],
    },
    {
      heading: "What happens to the access token",
      paragraphs: ["When you sign in, Google gives your browser an access token."],
      items: [
        ["Your browser sends it once, over HTTPS, to our proof server at ", { code: "api-forepay.jameshub.fun" }, "."],
        "The server holds it in memory only while it makes your proof, which takes about a minute.",
        "It is never written to disk, a database or logs, and it is removed from any error message.",
        "It is never shared with anyone, and it is thrown away when the proof ends.",
        "Google expires it after about an hour.",
      ],
      after: [
        [
          "You can remove Forepay's access at any time at ",
          { text: "myaccount.google.com/permissions", href: "https://myaccount.google.com/permissions" },
          ".",
        ],
      ],
    },
    {
      heading: "What becomes public",
      prominent: true,
      paragraphs: [
        "To get an advance, you submit a proof to Stellar, a public blockchain. Forepay uses its testnet. The proof contains",
      ],
      items: [
        "your AdSense publisher ID",
        "the three month date window",
        "the revenue figure, to the cent",
        "your Stellar address",
      ],
      after: [
        "Anything on the ledger is public and permanent. Nobody can delete it, not us and not anyone else.",
        "Nothing else from the AdSense report is revealed. Not your account name, your sites or your daily figures.",
      ],
    },
    {
      heading: "What we keep",
      items: [
        "Nothing about you in a database.",
        "The proof server keeps a finished proof in memory for up to one hour, so the page can collect it. Then it forgets it.",
        "When the server restarts, it forgets everything.",
      ],
    },
    {
      heading: "What we never do",
      items: [
        "We don't sell Google user data.",
        "We don't use it for advertising.",
        "We don't transfer it to anyone, except the revenue figure you choose to publish on chain, as described above.",
      ],
    },
    {
      heading: "Limited Use",
      paragraphs: [LIMITED_USE],
    },
    {
      heading: "Contact",
      paragraphs: [["Questions about this policy go to ", contact, "."]],
    },
  ],
};

export const terms: LegalDocument = {
  title: "Terms of service",
  effective: EFFECTIVE,
  intro: ["These terms cover your use of Forepay, at forepay.xyz and app.forepay.xyz. By using it, you agree to them."],
  sections: [
    {
      heading: "A testnet demo",
      paragraphs: [
        "Forepay runs on Stellar testnet only. The USDC in it has no real value, and no real funds move.",
        "Forepay is not a lending offer, and nothing in it is financial advice.",
      ],
    },
    {
      heading: "Provided as is",
      paragraphs: [
        "Forepay is provided as is, without any warranty. It may change or stop working at any time.",
      ],
    },
    {
      heading: "Your AdSense account",
      paragraphs: ["Only sign in with an AdSense account that you own, or that you are authorised to use."],
    },
    {
      heading: "What you publish",
      paragraphs: [
        [
          "A proof you submit is written to a public blockchain, where it stays for good and cannot be removed. The ",
          { text: "privacy policy", href: "/privacy" },
          " lists exactly what it contains.",
        ],
      ],
    },
    {
      heading: "Contact",
      paragraphs: [["Questions about these terms go to ", contact, "."]],
    },
  ],
};
