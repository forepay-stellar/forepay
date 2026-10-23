// Every word on the landing page. Sections read from here and never hard-code copy.
// Source: the 04 Landing column of docs/design/forepay.pen. Rules: docs/design/brief.md §3,
// enforced by landing.test.ts. Numbers follow docs/interface.md.

export const landing = {
  nav: {
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Your data", href: "#your-data" },
      { label: "The math", href: "#the-math" },
      { label: "FAQ", href: "#faq" },
    ],
    // The desktop bar is shorter than the mobile menu: The math is reached by scrolling.
    desktopHrefs: ["#how-it-works", "#your-data", "#faq"],
    cta: "Open the app",
    menu: "Open menu",
    close: "Close menu",
  },
  hero: {
    eyebrow: "For AdSense creators",
    wordLeft: "Paid",
    wordRight: "Early",
    body: "Prove three months of AdSense revenue without sharing your Google password. Get up to 100 USDC, repay whenever you like.",
    primary: "Open the app",
    secondary: "How it works",
    note: "Live on Stellar testnet",
  },
  howItWorks: {
    eyebrow: "How it works",
    title: "Prove it, see it, get it",
    steps: [
      {
        number: "01",
        title: "Prove your revenue",
        body: "Log in to AdSense. We only read three months of revenue.",
        image: "/clay/step-proof.webp",
      },
      {
        number: "02",
        title: "See your offer",
        body: "A quarter of it, up to 100 USDC, with the math shown.",
        image: "/clay/step-offer.webp",
      },
      {
        number: "03",
        title: "Get USDC",
        body: "Approve in your wallet. Repay any amount, any time.",
        image: "/clay/step-wallet.webp",
      },
    ],
  },
  yourData: {
    eyebrow: "Your data",
    titleTop: "We read one line",
    titleBottom: "Not your password",
    body: "Three months of your AdSense revenue, and your publisher ID. Your password, your emails and your payment details never leave Google, not even to us.",
    marquee: ["password", "emails", "payments"],
  },
  theMath: {
    eyebrow: "The math",
    title: "A simple rule",
    big: {
      number: "01",
      tag: "The rule",
      title: "A quarter of your revenue, early",
      body: "Prove three months of AdSense revenue. Your advance is one quarter of it.",
    },
    rate: { label: "Advance rate", value: 25, unit: "%", sub: "Of three months of revenue" },
    cap: { label: "Limit per advance", value: 100, unit: "USDC", sub: "Higher revenue still caps here" },
  },
  faq: {
    title: "Questions answered",
    items: [
      {
        q: "Is this real money?",
        a: "No. Forepay is a demo on Stellar testnet. The USDC here has no real value, so you can try everything safely.",
      },
      {
        q: "What do you read from my AdSense account?",
        a: "Three months of revenue and your publisher ID. Never your password, your emails or anything else in your Google account.",
      },
      {
        q: "How is my advance decided?",
        a: "A quarter of the revenue you prove, up to 100 USDC. The same proof always gives the same number.",
      },
      {
        q: "When do I have to repay?",
        a: "Whenever you like. There is no due date and no interest. Pay any amount, as often as you want.",
      },
      {
        q: "Which wallets work?",
        a: "Stellar wallets such as Freighter in your browser, and mobile wallets through WalletConnect.",
      },
      {
        q: "Can I get a second advance?",
        a: "Each three month revenue period can fund one advance. A new one opens with the next period.",
      },
      {
        q: "What if I cannot repay?",
        a: "This is a testnet demo, so nothing is ever collected. A real version would need clear rules for this, and they are not built yet.",
      },
    ],
  },
  closing: {
    headline: "Paid early.",
    cta: "Open the app",
    body: "Prove your revenue and see your offer in about three minutes. A demo on Stellar testnet.",
  },
  footer: {
    line: "Get paid early on the AdSense revenue you already earn.",
    columns: [
      {
        heading: "Product",
        links: [
          { label: "How it works", href: "#how-it-works" },
          { label: "Your data", href: "#your-data" },
          { label: "FAQ", href: "#faq" },
          { label: "Open the app", href: "APP" },
        ],
      },
      {
        heading: "Project",
        links: [
          { label: "GitHub", href: "https://github.com/forepay-stellar/forepay" },
          { label: "Contract on Stellar", href: "CONTRACT" },
          { label: "Built on Stellar", href: "https://stellar.org" },
        ],
      },
    ],
    legal: "© 2026 Forepay. Open source under AGPL-3.0.",
    legalLinks: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
    testnet: "Live on Stellar testnet",
  },
} as const;

// "APP" and "CONTRACT" are resolved to environment URLs at render time (src/lib/env.ts).
const NOT_COPY = /^(\/|#|https?:\/\/|APP$|CONTRACT$)/;

export function allStrings(value: unknown): string[] {
  if (typeof value === "string") return NOT_COPY.test(value) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}
