# Forepay landing page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public Forepay landing page in `landing-page/` exactly as designed in the 04 Landing column of `docs/design/forepay.pen`, with a real 3D clay hero, and send creators into the app.

**Architecture:** One Next.js 16 route (`/`) assembled from one component per section under `landing-page/src/sections/`. All copy lives in one typed module so a single test can enforce the copy rules. The hero's 3D scene is a lazily loaded React Three Fiber canvas behind a static image fallback; section clay objects are images exported from the pen file. Motion is GSAP ScrollTrigger plus CSS, all of it off under `prefers-reduced-motion`.

**Tech Stack:** Next.js 16.3.8, React 19.2.8, Tailwind CSS 4, `three` + `@react-three/fiber` + `@react-three/drei`, `gsap` + `@gsap/react`, `lucide-react`, `clsx` + `tailwind-merge`; tests with Vitest 5, jsdom and Testing Library (same setup as `fe/`).

## Global Constraints

- Worktree `D:/Coding/orca-workspace/forepay-landing`, branch `feat/54-landing-page`. Package `landing-page/` in the root pnpm workspace; install from the repo root, one lockfile (`pnpm-lock.yaml`).
- This is Next.js 16. Read `landing-page/node_modules/next/dist/docs/` before using an API from memory (`landing-page/AGENTS.md`). `middleware` is now `proxy`.
- Every new install script must be decided in `pnpm-workspace.yaml` `allowBuilds`, with a comment saying why.
- CI runs `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from the root; all four must pass for `landing-page`.
- Copy rules (`docs/design/brief.md` §3), enforced by a test: no em dash `—`, no colon `:` and no semicolon `;` in UI text, no middle dot `·`, no all-caps labels with wide tracking (acronyms like USDC, XLM, FAQ, AGPL are fine), plain words, no buzzwords, dates without clock times, the revenue window is never written as a fixed month range.
- Numbers (`docs/interface.md`): 25% of three months of proven revenue, capped at 100 USDC, minimum 1 USDC. No due dates, fees, interest or penalties anywhere.
- Footer legal line is `© 2026 Forepay. Open source under AGPL-3.0.` (the project is AGPL-3.0-only, `docs/licensing.md`). Testnet line is `Live on Stellar testnet`.
- Colors only from tokens. Brand `#F2620F`, canvas `#F3EEE8`, near black `#1C1612`, deep footer orange `#C24A08`, cream wordmark `#FFE2CC`.
- `out-of-sow`: this must not take time from the M3 front end or the M4 demo.
- Issues, commits and PRs in English. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File structure

```
landing-page/
  public/
    clay/                     PNG exports from forepay.pen (Task 3)
      hero-still.png          hero scene, the reduced motion and no WebGL fallback
      step-proof.png  step-offer.png  step-wallet.png
      lock.png  quarter-coin.png  sunrise-wallet.png
    brand/
      wordmark.svg  mark.svg  wordmark-cream.png
  src/
    app/
      layout.tsx              fonts, metadata, body
      page.tsx                assembles the sections in order
      globals.css             tailwind import, tokens import, keyframes
      tokens.css              copy of fe tokens + the landing additions
      opengraph-image.png     share image (Task 12)
    content/
      landing.ts              every string on the page
      landing.test.ts         copy rules test
    lib/
      cn.ts                   clsx + tailwind-merge
      env.ts                  APP_URL with a safe fallback
      motion.ts               usePrefersReducedMotion, useCanRender3D
      motion.test.ts
      countUp.ts              pure easing helper for the math numbers
      countUp.test.ts
    components/
      Button.tsx              primary pill and outline pill, as links
      Wordmark.tsx  Mark.tsx
      Nav.tsx                 desktop nav and mobile bar
      MobileMenu.tsx          full screen menu with its states
      MobileMenu.test.tsx
      Marquee.tsx             the running word rows
      Marquee.test.tsx
      Faq.tsx                 accordion
      Faq.test.tsx
      Reveal.tsx              fade and rise on scroll, off with reduced motion
    sections/
      Hero.tsx  HeroScene.tsx  HowItWorks.tsx  YourData.tsx
      TheMath.tsx  FaqSection.tsx  ClosingAndFooter.tsx
  vitest.config.mts
```

---

### Task 1: Tooling, tokens and an empty page that builds

**Files:**
- Modify: `landing-page/package.json`
- Create: `landing-page/vitest.config.mts`
- Move: `landing-page/app/` → `landing-page/src/app/`
- Modify: `landing-page/tsconfig.json` (`@/*` → `./src/*`)
- Create: `landing-page/src/app/tokens.css` (copy of `fe/app/tokens.css` plus the additions below)
- Modify: `landing-page/src/app/globals.css`, `landing-page/src/app/layout.tsx`, `landing-page/src/app/page.tsx`
- Create: `landing-page/src/lib/cn.ts`, `landing-page/src/lib/cn.test.ts`
- Modify: `pnpm-workspace.yaml` only if the install reports an undecided install script

**Interfaces:**
- Produces: `cn(...classes: ClassValue[]): string` from `@/lib/cn`; Tailwind utilities `bg-canvas`, `bg-surface`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-brand`, `text-brand`, `bg-action`, `bg-footer`, `text-cream`, `rounded-card`, `rounded-hero`, `rounded-pill`, `font-sans`, `font-mono`.

- [ ] **Step 1: Add dependencies from the repo root**

```bash
cd D:/Coding/orca-workspace/forepay-landing
pnpm --filter landing-page add three @react-three/fiber @react-three/drei gsap @gsap/react lucide-react clsx tailwind-merge
pnpm --filter landing-page add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @types/three
```

If pnpm stops on an undecided install script, add it to `allowBuilds` in `pnpm-workspace.yaml` with `false` and a one line reason, then rerun. Only allow one (`true`) if the build fails without it.

- [ ] **Step 2: Add the test script and Vitest config**

In `landing-page/package.json` add to `scripts`:

```json
"test": "vitest run"
```

Create `landing-page/vitest.config.mts`:

```ts
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Move the app into `src/` and point the alias at it**

```bash
cd landing-page
git mv app src/app
```

In `landing-page/tsconfig.json` change `"@/*": ["./*"]` to `"@/*": ["./src/*"]`.

- [ ] **Step 4: Write the failing test for `cn`**

Create `landing-page/src/lib/cn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins classes and lets the later Tailwind class win", () => {
    expect(cn("px-4 text-fg", false && "hidden", "px-8")).toBe("text-fg px-8");
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `pnpm --filter landing-page test`
Expected: FAIL, `Failed to resolve import "./cn"`.

- [ ] **Step 6: Implement `cn`**

Create `landing-page/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
```

- [ ] **Step 7: Run it to see it pass**

Run: `pnpm --filter landing-page test`
Expected: PASS, 1 test.

- [ ] **Step 8: Tokens and global styles**

Copy `fe/app/tokens.css` to `landing-page/src/app/tokens.css` unchanged, then append:

```css
/* Landing additions (#54). Footer and sunrise colours from the 04 Landing column. */
:root {
  --fp-orange-deep: #c24a08;
  --fp-cream: #ffe2cc;
  --fp-peach-glow: #f8a97a;
}

@theme inline {
  --color-footer: var(--fp-orange-deep);
  --color-cream: var(--fp-cream);
  --color-glow: var(--fp-peach-glow);
  --color-action-hover: #3a2f28;
  --color-action-pressed: #000000;
}

@theme {
  --radius-pill: 999px;
}
```

Replace `landing-page/src/app/globals.css` with:

```css
@import "tailwindcss";
@import "./tokens.css";

html {
  scroll-behavior: smooth;
}

body {
  background: var(--color-canvas);
  color: var(--color-fg);
  font-family: var(--font-sans);
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 9: Layout and an empty page**

Replace `landing-page/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Forepay, get paid early on your AdSense revenue",
  description: "Prove three months of AdSense revenue without sharing your Google password and get up to 100 USDC. Live on Stellar testnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh bg-canvas text-fg">{children}</body>
    </html>
  );
}
```

Replace `landing-page/src/app/page.tsx`:

```tsx
export default function Home() {
  return <main />;
}
```

Delete the scaffold's `public/*.svg` files (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`).

- [ ] **Step 10: Run all four checks**

Run from the repo root:

```bash
pnpm --filter landing-page lint
pnpm --filter landing-page typecheck
pnpm --filter landing-page test
pnpm --filter landing-page build
```

Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add -A landing-page pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore(#54): landing tooling, tokens and src layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: All copy in one module, guarded by the copy rules

**Files:**
- Create: `landing-page/src/content/landing.ts`
- Test: `landing-page/src/content/landing.test.ts`

**Interfaces:**
- Produces: `export const landing` with the shape below, and `export function allStrings(value: unknown): string[]`. Every section reads its words from `landing`; no section hard-codes copy.

- [ ] **Step 1: Write the failing test**

Create `landing-page/src/content/landing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allStrings, landing } from "./landing";

const ACRONYMS = new Set(["USDC", "XLM", "FAQ", "AGPL", "API"]);

describe("landing copy", () => {
  const strings = allStrings(landing);

  it("has copy to check", () => {
    expect(strings.length).toBeGreaterThan(40);
  });

  it.each(strings)("follows the copy rules: %s", (text) => {
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/·/);
    expect(text).not.toMatch(/;/);
    expect(text).not.toMatch(/:\s/);
    expect(text).not.toMatch(/\b(July|August|September|October|November|December|January|February|March|April|May|June) to /);
    expect(text).not.toMatch(/\b(seamless|unlock|empower|revolutionary|next-gen|trustless|supercharge|effortless|game-changing)\b/i);
    for (const word of text.match(/\b[A-Z]{3,}\b/g) ?? []) {
      expect(ACRONYMS.has(word), `all caps word "${word}"`).toBe(true);
    }
  });

  it("states the advance rule with the contract's numbers", () => {
    expect(strings.join(" ")).toContain("100 USDC");
    expect(strings.join(" ")).not.toMatch(/due date is|interest rate|late fee/i);
  });

  it("uses the agreed legal and testnet lines", () => {
    expect(landing.footer.legal).toBe("© 2026 Forepay. Open source under AGPL-3.0.");
    expect(landing.footer.testnet).toBe("Live on Stellar testnet");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter landing-page test src/content`
Expected: FAIL, cannot resolve `./landing`.

- [ ] **Step 3: Write the copy module**

Create `landing-page/src/content/landing.ts`:

```ts
// Every word on the landing page. Sections read from here, never hard-code copy.
// Source: the 04 Landing column of docs/design/forepay.pen. Rules: docs/design/brief.md §3.

export const landing = {
  nav: {
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Your data", href: "#your-data" },
      { label: "The math", href: "#the-math" },
      { label: "FAQ", href: "#faq" },
    ],
    cta: "Open the app",
    testnet: "Testnet",
    menu: "Open menu",
    close: "Close menu",
  },
  hero: {
    eyebrow: "For AdSense creators",
    wordLeft: "Paid",
    wordRight: "Early",
    body: "Prove three months of AdSense revenue without sharing your Google password. Get up to 100 USDC, and repay whenever you like.",
    primary: "Open the app",
    secondary: "How it works",
    note: "Live on Stellar testnet",
  },
  howItWorks: {
    eyebrow: "How it works",
    title: "Prove it, see it, get it",
    steps: [
      { number: "01", title: "Prove your revenue", body: "Log in to AdSense. We only read three months of revenue.", image: "/clay/step-proof.png" },
      { number: "02", title: "See your offer", body: "A quarter of it, up to 100 USDC, with the math shown.", image: "/clay/step-offer.png" },
      { number: "03", title: "Get USDC", body: "Approve in your wallet. Repay any amount, any time.", image: "/clay/step-wallet.png" },
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
      { q: "Is this real money?", a: "No. Forepay is a demo on Stellar testnet. The USDC here has no real value, so you can try everything safely." },
      { q: "What do you read from my AdSense account?", a: "Three months of revenue and your publisher ID. Never your password, your emails or anything else in your Google account." },
      { q: "How is my advance decided?", a: "A quarter of the revenue you prove, up to 100 USDC. The same proof always gives the same number." },
      { q: "When do I have to repay?", a: "Whenever you like. There is no due date and no interest. Pay any amount, as often as you want." },
      { q: "Which wallets work?", a: "Freighter, xBull and Rabet in your browser, and mobile wallets through WalletConnect." },
      { q: "Can I get a second advance?", a: "Each three month revenue period can fund one advance. A new one opens with the next period." },
      { q: "What if I cannot repay?", a: "This is a testnet demo, so nothing is ever collected. A real version would need clear rules for this, and they are not built yet." },
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
    testnet: "Live on Stellar testnet",
  },
} as const;

export function allStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value.startsWith("/") || value.startsWith("#") || value.startsWith("http") || value === "APP" || value === "CONTRACT" ? [] : [value];
  }
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter landing-page test src/content`
Expected: PASS. If a string fails a rule, fix the string, not the test.

- [ ] **Step 5: Commit**

```bash
git add landing-page/src/content
git commit -m "feat(#54): landing copy in one module, guarded by the copy rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Brand and clay assets exported from the pen file

**Files:**
- Create: `landing-page/public/brand/wordmark.svg`, `landing-page/public/brand/mark.svg`, `landing-page/public/brand/wordmark-cream.png`
- Create: `landing-page/public/clay/hero-still.png`, `step-proof.png`, `step-offer.png`, `step-wallet.png`, `lock.png`, `quarter-coin.png`, `sunrise-wallet.png`
- Create: `landing-page/src/components/Wordmark.tsx`, `landing-page/src/components/Mark.tsx`
- Modify: `landing-page/src/app/` favicon (replace `favicon.ico` with `icon.svg`)

**Interfaces:**
- Produces: `<Wordmark className?: string />` (179×28 viewBox, orange with canvas counters), `<Mark className?: string />` (32×32). Image paths under `/clay/*.png` and `/brand/*` as listed, consumed by Tasks 5 to 11.

The source nodes in `docs/design/forepay.pen` (open it in pen.dev from this worktree):

| Asset | pen node | Export |
| --- | --- | --- |
| `hero-still.png` | `Landing / Desktop` → Hero → `3D stage` | PNG, scale 2 |
| `step-proof.png`, `step-offer.png`, `step-wallet.png` | `Landing / Desktop` → How it works → each card's `Clay` frame | PNG, scale 2, transparent |
| `lock.png` | `Landing / Desktop` → Your data → `Clay lock` | PNG, scale 2 |
| `quarter-coin.png` | `Landing / Desktop` → The math → Big card → `Coin stage` | PNG, scale 2 |
| `sunrise-wallet.png` | `Landing / Desktop` → CTA and footer → CTA → `Clay` | PNG, scale 2 |
| `wordmark-cream.png` | CTA and footer → Footer → `Wordmark band` | PNG, scale 3 |
| `wordmark.svg`, `mark.svg` | `Logo/Wordmark 28`, `Logo/Mark 32` (reusable components) | `html-css` export, then copy the `<svg>` out |

- [ ] **Step 1: Export the PNGs**

In pen.dev, run one `execute` against `docs/design/forepay.pen` that finds each node above by name and calls `Export([...ids], "png", "<worktree>/landing-page/public/clay", { scale: 2 })`. Export the wordmark band with `{ scale: 3 }` into `public/brand`. Rename each `<nodeId>.png` to the file name in the table.

- [ ] **Step 2: Export the logo SVGs**

`Export([wordmarkId], "html-css", "<worktree>/tmp/wordmark.html")` and the same for the mark. Copy the `<svg>` element out of each HTML file into `public/brand/wordmark.svg` and `public/brand/mark.svg`, add `xmlns="http://www.w3.org/2000/svg"`, delete the HTML files.

- [ ] **Step 3: Components**

Create `landing-page/src/components/Wordmark.tsx`:

```tsx
import Image from "next/image";

export function Wordmark({ className }: { className?: string }) {
  return <Image src="/brand/wordmark.svg" alt="Forepay" width={179} height={28} priority className={className} />;
}
```

Create `landing-page/src/components/Mark.tsx`:

```tsx
import Image from "next/image";

export function Mark({ className }: { className?: string }) {
  return <Image src="/brand/mark.svg" alt="Forepay" width={32} height={32} priority className={className} />;
}
```

Delete `landing-page/src/app/favicon.ico` and copy `public/brand/mark.svg` to `landing-page/src/app/icon.svg` (Next.js serves it as the favicon).

- [ ] **Step 4: Check the files**

Run: `ls landing-page/public/clay landing-page/public/brand` and open each PNG.
Expected: seven PNGs in `clay/` with transparent backgrounds, three files in `brand/`. Each PNG is under 600 KB; if one is larger, re-export at scale 1.5.

- [ ] **Step 5: Run the checks and commit**

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page build
git add landing-page/public landing-page/src/components landing-page/src/app
git commit -m "feat(#54): brand and clay assets exported from forepay.pen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Motion helpers

**Files:**
- Create: `landing-page/src/lib/motion.ts`, `landing-page/src/lib/countUp.ts`
- Test: `landing-page/src/lib/motion.test.ts`, `landing-page/src/lib/countUp.test.ts`

**Interfaces:**
- Produces: `usePrefersReducedMotion(): boolean`, `canRender3D(env: { reducedMotion: boolean; webgl: boolean; width: number }): boolean`, `useCanRender3D(): boolean`, `countUpValue(target: number, progress: number): number`.

- [ ] **Step 1: Write the failing tests**

Create `landing-page/src/lib/countUp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countUpValue } from "./countUp";

describe("countUpValue", () => {
  it("starts at zero and lands exactly on the target", () => {
    expect(countUpValue(100, 0)).toBe(0);
    expect(countUpValue(100, 1)).toBe(100);
  });

  it("eases out, so it is past halfway at half time", () => {
    expect(countUpValue(100, 0.5)).toBeGreaterThan(50);
  });

  it("clamps progress outside 0 to 1 and never returns a fraction", () => {
    expect(countUpValue(25, 1.4)).toBe(25);
    expect(countUpValue(25, -1)).toBe(0);
    expect(Number.isInteger(countUpValue(25, 0.37))).toBe(true);
  });
});
```

Create `landing-page/src/lib/motion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canRender3D } from "./motion";

describe("canRender3D", () => {
  it("renders the 3D hero only with WebGL and without reduced motion", () => {
    expect(canRender3D({ reducedMotion: false, webgl: true, width: 1440 })).toBe(true);
    expect(canRender3D({ reducedMotion: true, webgl: true, width: 1440 })).toBe(false);
    expect(canRender3D({ reducedMotion: false, webgl: false, width: 1440 })).toBe(false);
  });

  it("still renders on a phone, the scene simplifies itself", () => {
    expect(canRender3D({ reducedMotion: false, webgl: true, width: 390 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter landing-page test src/lib`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `landing-page/src/lib/countUp.ts`:

```ts
export function countUpValue(target: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - t, 3);
  return Math.round(target * eased);
}
```

Create `landing-page/src/lib/motion.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function canRender3D(env: { reducedMotion: boolean; webgl: boolean; width: number }): boolean {
  return env.webgl && !env.reducedMotion && env.width > 0;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function useCanRender3D(): boolean {
  const reducedMotion = usePrefersReducedMotion();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(canRender3D({ reducedMotion, webgl: hasWebGL(), width: window.innerWidth }));
  }, [reducedMotion]);
  return ok;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter landing-page test src/lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add landing-page/src/lib
git commit -m "feat(#54): motion helpers, reduced motion and the 3D gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Buttons, nav and the mobile menu

**Files:**
- Create: `landing-page/src/lib/env.ts`, `landing-page/src/components/Button.tsx`, `landing-page/src/components/Nav.tsx`, `landing-page/src/components/MobileMenu.tsx`
- Test: `landing-page/src/components/MobileMenu.test.tsx`

**Interfaces:**
- Consumes: `landing` (Task 2), `Wordmark`, `Mark` (Task 3), `cn` (Task 1).
- Produces: `APP_URL: string`, `CONTRACT_URL: string`; `<ButtonLink href variant?: "primary" | "outline" | "light" size?: "md" | "lg">`; `<Nav />`; `<MobileMenu open onClose />`.

- [ ] **Step 1: Write the failing test**

Create `landing-page/src/components/MobileMenu.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileMenu } from "./MobileMenu";

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

  it("closes on the close button, on Escape and when a link is picked", () => {
    const onClose = vi.fn();
    render(<MobileMenu open onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("link", { name: /FAQ/ }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("locks page scroll while open and restores it after", () => {
    const { unmount } = render(<MobileMenu open onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter landing-page test src/components/MobileMenu`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement env, buttons, menu and nav**

Create `landing-page/src/lib/env.ts`:

```ts
// The app URL comes from the deploy in #22. Until then the button points at the repo's fe README.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://github.com/forepay-stellar/forepay/tree/main/fe";
export const CONTRACT_URL = process.env.NEXT_PUBLIC_CONTRACT_URL || "https://github.com/forepay-stellar/forepay/blob/main/docs/deployments.md";
```

Create `landing-page/src/components/Button.tsx`:

```tsx
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-action text-fg-on-brand hover:bg-action-hover active:bg-action-pressed",
  outline: "bg-surface text-fg border border-line-strong hover:bg-subtle",
  light: "bg-surface text-fg hover:bg-brand-subtle",
};
const sizes = { md: "px-5 py-3 text-sm", lg: "px-8 py-5 text-[17px]" };

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "lg",
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-pill font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </a>
  );
}
```

Create `landing-page/src/components/MobileMenu.tsx`:

```tsx
"use client";

import { ArrowUpRight, FlaskConical, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { landing } from "@/content/landing";
import { APP_URL } from "@/lib/env";
import { ButtonLink } from "./Button";
import { Mark } from "./Mark";

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const firstLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLink.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Menu" className="menu-enter fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas lg:hidden">
      <div className="flex h-15 items-center justify-between px-4 pt-11">
        <Mark />
        <button type="button" onClick={onClose} aria-label={landing.nav.close} className="grid size-10 place-items-center rounded-pill bg-action text-fg-on-brand">
          <X size={18} />
        </button>
      </div>
      <nav className="flex flex-col px-5 pt-7">
        {landing.nav.links.map((link, i) => (
          <a
            key={link.href}
            ref={i === 0 ? firstLink : undefined}
            href={link.href}
            onClick={onClose}
            style={{ animationDelay: `${120 + i * 40}ms` }}
            className="menu-link flex items-center justify-between border-b border-line-strong py-[18px]"
          >
            <span className="flex items-end gap-3.5">
              <span className="font-mono text-[13px] leading-[2.2] text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[40px] font-medium leading-none tracking-[-1.4px]">{link.label}</span>
            </span>
            <ArrowUpRight size={24} className="text-fg-subtle" />
          </a>
        ))}
      </nav>
      <div className="flex-1" />
      <div className="menu-bottom relative flex flex-col items-center gap-3.5 px-5 pb-9">
        <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 h-[400px] w-[790px] -translate-x-1/2 rounded-full bg-glow/60 blur-[30px]" />
        <ButtonLink href={APP_URL} className="relative w-full">{landing.nav.cta}</ButtonLink>
        <span className="relative flex items-center gap-2 text-[13px] text-fg-subtle">
          <FlaskConical size={14} /> {landing.footer.testnet}
        </span>
      </div>
    </div>
  );
}
```

Add to `landing-page/src/app/globals.css`:

```css
@keyframes menu-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes menu-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
.menu-enter { animation: menu-fade 200ms ease-out both; }
.menu-link { animation: menu-rise 260ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.menu-bottom { animation: menu-fade 260ms ease-out 320ms both; }
```

Create `landing-page/src/components/Nav.tsx`:

```tsx
"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { landing } from "@/content/landing";
import { cn } from "@/lib/cn";
import { APP_URL } from "@/lib/env";
import { ButtonLink } from "./Button";
import { Mark } from "./Mark";
import { MobileMenu } from "./MobileMenu";
import { Wordmark } from "./Wordmark";

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header className={cn("sticky top-0 z-40 transition-colors", scrolled && "bg-canvas/85 backdrop-blur-md")}>
        <div className="mx-auto hidden h-24 max-w-[1440px] items-center justify-between px-20 lg:flex">
          <div className="w-[300px]"><Wordmark /></div>
          <nav className="flex gap-9">
            {landing.nav.links.filter((l) => l.href !== "#the-math").map((l) => (
              <a key={l.href} href={l.href} className="text-[15px] font-medium text-fg-muted hover:text-fg">{l.label}</a>
            ))}
          </nav>
          <div className="flex w-[300px] items-center justify-end gap-3">
            <span className="rounded-pill border border-line bg-surface px-3.5 py-2 text-[13px] font-medium">{landing.nav.testnet}</span>
            <ButtonLink href={APP_URL} size="md">{landing.nav.cta}</ButtonLink>
          </div>
        </div>
        <div className="flex h-15 items-center justify-between px-4 lg:hidden">
          <Mark />
          <button type="button" onClick={() => setOpen(true)} aria-label={landing.nav.menu} aria-expanded={open} className="grid size-10 place-items-center rounded-pill bg-surface">
            <Menu size={18} />
          </button>
        </div>
      </header>
      <MobileMenu open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter landing-page test src/components/MobileMenu`
Expected: PASS, 4 tests.

- [ ] **Step 5: Render the nav on the page and check it by eye**

In `landing-page/src/app/page.tsx` render `<Nav />` above `<main />`. Run `pnpm --filter landing-page dev` and compare at 1440 and 390 wide with `Landing / Desktop` → Nav and `Landing / Mobile menu / Open`.

- [ ] **Step 6: Commit**

```bash
git add landing-page/src
git commit -m "feat(#54): nav, buttons and the mobile menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hero layout with the still image

**Files:**
- Create: `landing-page/src/sections/Hero.tsx`
- Modify: `landing-page/src/app/page.tsx`

**Interfaces:**
- Consumes: `landing.hero`, `ButtonLink`, `APP_URL`, `/clay/hero-still.png`.
- Produces: `<Hero />` with a stage slot `<div data-hero-stage>` that Task 7 fills; the still image stays as the fallback.

- [ ] **Step 1: Implement the hero**

Create `landing-page/src/sections/Hero.tsx`:

```tsx
import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { landing } from "@/content/landing";
import { APP_URL } from "@/lib/env";
import { HeroScene } from "./HeroScene";

export function Hero() {
  const h = landing.hero;
  return (
    <section className="relative mx-auto max-w-[1440px] overflow-hidden">
      {/* Desktop, from Landing / Desktop → Hero */}
      <div className="relative hidden h-[860px] lg:block">
        <h1 className="sr-only">{`${h.wordLeft} ${h.wordRight}`}</h1>
        <span aria-hidden className="absolute left-20 top-[60px] text-[180px] font-semibold leading-[0.9] tracking-[-8.5px]">{h.wordLeft}</span>
        <span aria-hidden className="absolute right-20 top-[470px] text-[180px] font-semibold leading-[0.9] tracking-[-8.5px]">{h.wordRight}</span>
        <div data-hero-stage className="absolute left-1/2 top-[60px] h-[640px] w-[616px] -translate-x-1/2">
          <Image src="/clay/hero-still.png" alt="" fill priority sizes="616px" className="object-contain" />
          <HeroScene />
        </div>
        <div className="absolute bottom-[110px] left-20 flex w-[440px] flex-col gap-3.5">
          <span className="text-[15px] font-medium text-brand-strong">{h.eyebrow}</span>
          <p className="text-lg leading-normal text-fg-muted">{h.body}</p>
        </div>
        <div className="absolute bottom-[90px] right-20 flex flex-col items-end gap-3.5">
          <div className="flex gap-3">
            <ButtonLink href={APP_URL}>{h.primary}</ButtonLink>
            <ButtonLink href="#how-it-works" variant="outline">{h.secondary}</ButtonLink>
          </div>
          <span className="text-sm text-fg-subtle">{h.note}</span>
        </div>
      </div>

      {/* Phone, from Landing / Mobile → Hero (option C) */}
      <div className="flex flex-col gap-5 px-5 pb-10 lg:hidden">
        <div data-hero-stage className="relative mx-auto h-[300px] w-[300px]">
          <Image src="/clay/hero-still.png" alt="" fill priority sizes="300px" className="object-contain" />
          <HeroScene />
        </div>
        <h1 className="text-[76px] font-semibold leading-[0.95] tracking-[-3.6px]">{`${h.wordLeft} ${h.wordRight}`}</h1>
        <span className="text-sm font-medium text-brand-strong">{h.eyebrow}</span>
        <p className="text-[17px] leading-normal text-fg-muted">{h.body}</p>
        <div className="flex flex-col gap-2.5">
          <ButtonLink href={APP_URL} className="w-full">{h.primary}</ButtonLink>
          <ButtonLink href="#how-it-works" variant="outline" className="w-full">{h.secondary}</ButtonLink>
        </div>
        <span className="text-center text-[13px] text-fg-subtle">{h.note}</span>
      </div>
    </section>
  );
}
```

Until Task 7, create a placeholder `landing-page/src/sections/HeroScene.tsx` so the build passes:

```tsx
export function HeroScene() {
  return null;
}
```

Render `<Hero />` inside `<main>` in `page.tsx`.

- [ ] **Step 2: Check it**

Run `pnpm --filter landing-page dev`. At 1440: "Paid" top left, "Early" right, the still centred, copy bottom left, buttons bottom right, nothing overlapping a letter. At 390: scene, "Paid Early", copy, two full width buttons.

- [ ] **Step 3: Checks and commit**

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page test && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): hero layout with the still scene

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The 3D clay scene

**Files:**
- Modify: `landing-page/src/sections/HeroScene.tsx`
- Create: `landing-page/src/sections/scene/Clay.tsx` (wallet, coin and materials)

**Interfaces:**
- Consumes: `useCanRender3D` (Task 4).
- Produces: `<HeroScene />` that renders nothing unless `useCanRender3D()` is true, and otherwise mounts a transparent canvas over the still image and hides the still with `[data-hero-stage] img { opacity: 0 }` once the first frame is drawn.

Behaviour from `Landing / Hero storyboard`:
- **Arrive:** wallet rises 24 px and scales 0.92 → 1, spring about 700 ms; coins pop in 90 ms apart.
- **Idle:** each coin bobs 6 to 10 px on a sine, 3.2 to 4.4 s, out of phase, and turns a few degrees.
- **Follow the cursor:** desktop only, the group tilts toward the pointer, at most 6°, eased 0.08 per frame, back to rest when the pointer leaves.
- **Drop on scroll:** over the first 35% of the hero's scroll, the hero coin falls into the slot and hides behind its lip, the wallet dips 6 px and settles, side coins drift up and fade.
- Rendering pauses when the hero is off screen (`frameloop="demand"` plus an IntersectionObserver that calls `invalidate`).

- [ ] **Step 1: Clay primitives**

Create `landing-page/src/sections/scene/Clay.tsx`:

```tsx
"use client";

import { RoundedBox } from "@react-three/drei";
import { forwardRef } from "react";
import * as THREE from "three";

export const clay = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });

const TANGERINE = clay("#EF5A0C");
const PEACH = clay("#FDE2CE");
const PEACH_DEEP = clay("#F6B98C");
const RUST = clay("#8A3207");

export const Wallet = forwardRef<THREE.Group>(function Wallet(_, ref) {
  return (
    <group ref={ref}>
      <RoundedBox args={[2.6, 1.7, 0.9]} radius={0.42} smoothness={6} material={TANGERINE} />
      <RoundedBox args={[2.3, 0.9, 0.7]} radius={0.3} smoothness={6} position={[-0.05, 0.75, -0.25]} rotation={[0, 0, -0.12]} material={PEACH_DEEP} />
      <RoundedBox args={[1.5, 0.12, 0.3]} radius={0.05} position={[0, 0.86, 0.15]} material={RUST} />
      <RoundedBox args={[0.75, 0.7, 0.5]} radius={0.22} smoothness={5} position={[1.25, -0.05, 0.35]} material={RUST} />
    </group>
  );
});

function WaveLine({ y }: { y: number }) {
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 9 }, (_, i) => new THREE.Vector3(-0.42 + i * 0.105, y + Math.sin(i * 1.35) * 0.04, 0.09)),
  );
  return (
    <mesh material={RUST}>
      <tubeGeometry args={[curve, 48, 0.026, 8, false]} />
    </mesh>
  );
}

export const Coin = forwardRef<THREE.Group, { scale?: number }>(function Coin({ scale = 1 }, ref) {
  return (
    <group ref={ref} scale={scale}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={TANGERINE}>
        <cylinderGeometry args={[0.6, 0.6, 0.16, 48]} />
      </mesh>
      <mesh position={[0, 0, 0.081]} material={PEACH}>
        <circleGeometry args={[0.43, 48]} />
      </mesh>
      <WaveLine y={0.07} />
      <WaveLine y={-0.09} />
    </group>
  );
});
```

- [ ] **Step 2: The scene**

Replace `landing-page/src/sections/HeroScene.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useCanRender3D } from "@/lib/motion";

const Canvas3D = dynamic(() => import("./scene/Canvas3D").then((m) => m.Canvas3D), { ssr: false });

export function HeroScene() {
  const ok = useCanRender3D();
  return ok ? <Canvas3D /> : null;
}
```

Create `landing-page/src/sections/scene/Canvas3D.tsx`:

```tsx
"use client";

import { ContactShadows } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { Coin, Wallet } from "./Clay";

gsap.registerPlugin(ScrollTrigger);

const COINS = [
  { pos: [0.15, 2.3, 0.6] as const, scale: 1.2, amp: 0.1, speed: 1.6, phase: 0 },
  { pos: [-2.1, 1.3, 0.2] as const, scale: 0.6, amp: 0.07, speed: 1.9, phase: 1.3 },
  { pos: [2.0, 1.8, -0.4] as const, scale: 0.72, amp: 0.08, speed: 1.45, phase: 2.4 },
];

function Scene({ tilt }: { tilt: boolean }) {
  const root = useRef<THREE.Group>(null);
  const wallet = useRef<THREE.Group>(null);
  const coins = useRef<(THREE.Group | null)[]>([]);
  const drop = useRef({ progress: 0 });
  const { invalidate, gl } = useThree();

  useEffect(() => {
    const stage = gl.domElement.closest("[data-hero-stage]") as HTMLElement | null;
    const img = stage?.querySelector("img");
    if (img) img.style.opacity = "0";
    const trigger = ScrollTrigger.create({
      trigger: stage?.closest("section") ?? undefined,
      start: "top top",
      end: "35% top",
      scrub: true,
      onUpdate: (self) => {
        drop.current.progress = self.progress;
        invalidate();
      },
    });
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && invalidate());
    if (stage) io.observe(stage);
    if (wallet.current) {
      gsap.from(wallet.current.position, { y: -0.4, duration: 0.7, ease: "back.out(1.6)" });
      gsap.from(wallet.current.scale, { x: 0.92, y: 0.92, z: 0.92, duration: 0.7, ease: "back.out(1.6)" });
    }
    coins.current.forEach((c, i) => c && gsap.from(c.scale, { x: 0, y: 0, z: 0, duration: 0.5, delay: 0.2 + i * 0.09, ease: "back.out(2)" }));
    return () => {
      trigger.kill();
      io.disconnect();
      if (img) img.style.opacity = "";
    };
  }, [gl, invalidate]);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    const p = drop.current.progress;
    COINS.forEach((c, i) => {
      const coin = coins.current[i];
      if (!coin) return;
      const bob = Math.sin(t * c.speed + c.phase) * c.amp;
      // The outer group sits at c.pos; only the inner offset moves here.
      if (i === 0) {
        coin.position.set(0, bob - p * 2.1, 0);
      } else {
        coin.position.set(0, bob + p * 0.6, 0);
        coin.scale.setScalar(c.scale * (1 - p));
      }
      coin.rotation.y = Math.sin(t * 0.6 + c.phase) * 0.25;
    });
    if (wallet.current) wallet.current.position.y = -Math.sin(Math.min(p, 1) * Math.PI) * 0.12;
    if (root.current && tilt) {
      root.current.rotation.y += (pointer.x * 0.1 - root.current.rotation.y) * 0.08;
      root.current.rotation.x += (-pointer.y * 0.06 - root.current.rotation.x) * 0.08;
    }
    invalidate();
  });

  return (
    <group ref={root}>
      <Wallet ref={wallet} />
      {COINS.map((c, i) => (
        <group key={i} position={c.pos}>
          <Coin ref={(el) => { coins.current[i] = el; }} scale={c.scale} />
        </group>
      ))}
      <ContactShadows position={[0, -1.1, 0]} opacity={0.28} scale={7} blur={2.6} far={3} />
    </group>
  );
}

export function Canvas3D() {
  const [tilt, setTilt] = useState(false);
  useEffect(() => setTilt(window.matchMedia("(pointer: fine)").matches), []);
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.6, 8], fov: 32 }}
      gl={{ alpha: true, antialias: true }}
      className="!absolute inset-0"
    >
      <ambientLight intensity={0.85} color="#FFF3EA" />
      <directionalLight position={[-4, 6, 5]} intensity={1.6} color="#FFE2CC" />
      <directionalLight position={[4, 1, 3]} intensity={0.35} color="#F8A97A" />
      <Scene tilt={tilt} />
    </Canvas>
  );
}
```

- [ ] **Step 3: Check it by eye**

Run `pnpm --filter landing-page dev`. Compare with `Landing / Hero storyboard` frames 1 to 4: arrival, bobbing, tilt toward the cursor on desktop, the hero coin dropping into the slot while scrolling the first third of the hero. Then turn on reduced motion in the OS: the still image shows and nothing moves. Then block WebGL (Chrome `--disable-webgl`): the still image shows.

- [ ] **Step 4: Checks and commit**

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page test && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): 3D clay hero with arrive, idle, tilt and drop on scroll

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Reveal on scroll, How it works

**Files:**
- Create: `landing-page/src/components/Reveal.tsx`, `landing-page/src/sections/HowItWorks.tsx`
- Modify: `landing-page/src/app/page.tsx`

**Interfaces:**
- Consumes: `landing.howItWorks`, `usePrefersReducedMotion`, the three `step-*.png`.
- Produces: `<Reveal delay?: number className?: string>` that fades and rises its children 24 px when they enter the viewport, or renders them as is with reduced motion.

- [ ] **Step 1: Reveal**

Create `landing-page/src/components/Reveal.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/motion";

export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShown(true);
        io.disconnect();
      }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("transition-[opacity,transform] duration-700 ease-out", !reduced && !shown && "translate-y-6 opacity-0", className)}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: How it works**

Create `landing-page/src/sections/HowItWorks.tsx`:

```tsx
import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { landing } from "@/content/landing";

const GLASS = [
  "bg-[radial-gradient(140%_140%_at_85%_15%,#F8A97AB3,#F8A97A00),#FFF3EA]",
  "bg-[radial-gradient(140%_140%_at_20%_10%,#F7B48AB3,#F7B48A00),#FFE9D8]",
  "bg-[radial-gradient(140%_140%_at_85%_20%,#F59A66B3,#F59A6600),#F6EFE9]",
];

export function HowItWorks() {
  const s = landing.howItWorks;
  return (
    <section id="how-it-works" className="mx-auto max-w-[1440px] px-5 pb-10 pt-20 lg:px-20 lg:pb-20 lg:pt-40">
      <p className="text-[15px] font-medium text-fg-muted">{s.eyebrow}</p>
      <h2 className="mt-3.5 text-[44px] font-medium leading-none tracking-[-1.6px] lg:text-[88px] lg:tracking-[-3.4px]">{s.title}</h2>
      <div className="mt-10 flex flex-col gap-5 lg:mt-16 lg:h-[640px] lg:flex-row lg:items-end lg:gap-6">
        {s.steps.map((step, i) => (
          <Reveal key={step.number} delay={i * 90} className={i === 1 ? "lg:h-[560px] lg:flex-1" : "lg:h-full lg:flex-1"}>
            <article className={`relative flex h-[540px] flex-col justify-between overflow-hidden rounded-[36px] p-7 lg:h-full lg:rounded-[44px] lg:p-10 ${GLASS[i]}`}>
              <div aria-hidden className="absolute -top-40 size-[520px] rounded-full border-[1.6px] border-white/70 bg-white/15" style={{ left: i === 1 ? -120 : 200 }} />
              <span className="relative font-mono text-[15px] text-fg-muted">{step.number}</span>
              <div className="relative h-[300px]">
                <Image src={step.image} alt="" fill sizes="(min-width: 1024px) 400px, 100vw" className="object-contain" />
              </div>
              <div className="relative flex flex-col gap-2.5">
                <h3 className="text-[32px] font-medium leading-[1.02] tracking-[-1px] lg:text-[40px] lg:tracking-[-1.3px]">{step.title}</h3>
                <p className="text-[17px] leading-[1.45] text-fg-muted">{step.body}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

Render `<HowItWorks />` after `<Hero />` in `page.tsx`.

- [ ] **Step 3: Check, checks, commit**

Compare with `Landing / Desktop` → How it works and `Landing / Mobile` → How it works. Then:

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page test && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): how it works, with reveal on scroll

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Your data with the running words

**Files:**
- Create: `landing-page/src/components/Marquee.tsx`, `landing-page/src/sections/YourData.tsx`
- Test: `landing-page/src/components/Marquee.test.tsx`
- Modify: `landing-page/src/app/globals.css`, `landing-page/src/app/page.tsx`

**Interfaces:**
- Consumes: `landing.yourData`, `/clay/lock.png`.
- Produces: `<Marquee words: readonly string[] direction: "left" | "right" className?: string>` that repeats the words to fill twice the row width, is `aria-hidden`, and animates with CSS that stops under reduced motion.

- [ ] **Step 1: Write the failing test**

Create `landing-page/src/components/Marquee.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Marquee } from "./Marquee";

describe("Marquee", () => {
  it("is hidden from screen readers and repeats the words twice for a seamless loop", () => {
    const { container } = render(<Marquee words={["password", "emails"]} direction="left" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.getAttribute("aria-hidden")).toBe("true");
    const text = row.textContent ?? "";
    expect(text.split("password").length - 1).toBeGreaterThanOrEqual(4);
  });

  it("runs the opposite way for the second row", () => {
    const { container } = render(<Marquee words={["a"]} direction="right" />);
    expect(container.innerHTML).toContain("marquee-right");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter landing-page test src/components/Marquee`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `landing-page/src/components/Marquee.tsx`:

```tsx
import { cn } from "@/lib/cn";

export function Marquee({ words, direction, className }: { words: readonly string[]; direction: "left" | "right"; className?: string }) {
  const run = Array.from({ length: 2 }, () => words.join("  ")).join("  ");
  return (
    <div aria-hidden="true" className={cn("pointer-events-none overflow-hidden whitespace-nowrap", className)}>
      <div className={direction === "left" ? "marquee-left" : "marquee-right"}>
        <span className="pr-[0.5em]">{run}</span>
        <span className="pr-[0.5em]">{run}</span>
      </div>
    </div>
  );
}
```

Add to `landing-page/src/app/globals.css`:

```css
@keyframes marquee-x { from { transform: translateX(0) } to { transform: translateX(-50%) } }
.marquee-left, .marquee-right { display: inline-flex; animation: marquee-x 40s linear infinite; }
.marquee-right { animation-direction: reverse; }
@media (prefers-reduced-motion: reduce) { .marquee-left, .marquee-right { animation: none; } }
```

Create `landing-page/src/sections/YourData.tsx`:

```tsx
import Image from "next/image";
import { Marquee } from "@/components/Marquee";
import { landing } from "@/content/landing";

export function YourData() {
  const s = landing.yourData;
  const wordRow = "text-[84px] font-semibold tracking-[-3.5px] text-fg/5 lg:text-[150px] lg:tracking-[-6px]";
  return (
    <section id="your-data" className="relative mx-auto max-w-[1440px] overflow-hidden">
      <div className="absolute inset-x-0 top-[270px] flex flex-col gap-2 lg:top-[300px]">
        <Marquee words={s.marquee} direction="left" className={wordRow} />
        <Marquee words={s.marquee} direction="right" className={wordRow} />
      </div>
      <div className="relative h-[760px] px-5 lg:h-[900px] lg:px-20">
        <p className="pt-10 text-sm font-medium text-fg-muted lg:pt-24 lg:text-[15px]">{s.eyebrow}</p>
        <h2 className="mt-2 text-[44px] font-medium leading-none tracking-[-1.6px] lg:text-[96px] lg:tracking-[-3.8px]">{s.titleTop}</h2>
        <div aria-hidden className="absolute left-1/2 top-[200px] size-[380px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#F3EEE8_35%,#F3EEE800)] lg:top-[200px] lg:size-[600px]" />
        <div className="absolute left-1/2 top-[200px] h-[212px] w-[161px] -translate-x-1/2 lg:top-[260px] lg:h-[343px] lg:w-[260px]">
          <Image src="/clay/lock.png" alt="" fill sizes="260px" className="object-contain" />
        </div>
        <p className="absolute bottom-[160px] right-5 text-right text-[44px] font-medium leading-none tracking-[-1.6px] lg:bottom-[124px] lg:right-20 lg:text-[96px] lg:tracking-[-3.8px]">{s.titleBottom}</p>
        <p className="absolute bottom-8 left-5 w-[350px] text-base leading-normal text-fg-muted lg:bottom-[110px] lg:left-20 lg:w-[470px] lg:text-lg">{s.body}</p>
      </div>
    </section>
  );
}
```

Render `<YourData />` after `<HowItWorks />`.

- [ ] **Step 4: Run the tests to see them pass, check by eye**

Run: `pnpm --filter landing-page test`
Expected: PASS. Then compare with `Landing / Desktop` → Your data and the mobile frame; the words run in opposite directions and stop with reduced motion.

- [ ] **Step 5: Checks and commit**

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): your data, with the words running behind the lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The math bento with counting numbers

**Files:**
- Create: `landing-page/src/components/CountUp.tsx`, `landing-page/src/sections/TheMath.tsx`
- Modify: `landing-page/src/app/page.tsx`

**Interfaces:**
- Consumes: `landing.theMath`, `countUpValue` (Task 4), `usePrefersReducedMotion`, `/clay/quarter-coin.png`.
- Produces: `<CountUp to: number durationMs?: number>` that counts from 0 to `to` once it enters the viewport, or shows `to` at once with reduced motion. Its accessible text is always the final number.

- [ ] **Step 1: CountUp**

Create `landing-page/src/components/CountUp.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { countUpValue } from "@/lib/countUp";
import { usePrefersReducedMotion } from "@/lib/motion";

export function CountUp({ to, durationMs = 900 }: { to: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (reduced || !ref.current) return;
    setValue(0);
    let frame = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = (now - start) / durationMs;
        setValue(countUpValue(to, p));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, durationMs, reduced]);

  return (
    <span ref={ref} aria-label={String(to)}>
      <span aria-hidden>{value}</span>
    </span>
  );
}
```

- [ ] **Step 2: The bento**

Create `landing-page/src/sections/TheMath.tsx`:

```tsx
import Image from "next/image";
import { CountUp } from "@/components/CountUp";
import { landing } from "@/content/landing";

function QuarterRing() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="24" fill="none" stroke="#EDE7E1" strokeWidth="8" />
      <path d="M28 4 A24 24 0 0 1 52 28" fill="none" stroke="#F2620F" strokeWidth="8" />
    </svg>
  );
}

function CapBars() {
  return (
    <div aria-hidden className="flex h-14 items-end gap-[5px]">
      {[20, 32, 44, 56, 56].map((h, i) => (
        <span key={i} className={i > 2 ? "w-[9px] rounded-pill bg-brand" : "w-[9px] rounded-pill bg-subtle"} style={{ height: h }} />
      ))}
    </div>
  );
}

export function TheMath() {
  const s = landing.theMath;
  const facts = [
    { ...s.rate, visual: <QuarterRing /> },
    { ...s.cap, visual: <CapBars /> },
  ];
  return (
    <section id="the-math" className="mx-auto max-w-[1440px] px-5 pb-10 pt-20 lg:px-20 lg:py-[120px]">
      <p className="text-[15px] font-medium text-fg-muted">{s.eyebrow}</p>
      <h2 className="mt-3.5 text-[44px] font-medium tracking-[-1.6px] lg:text-[76px] lg:tracking-[-3px]">{s.title}</h2>
      <div className="mt-6 flex flex-col gap-3 lg:mt-12 lg:h-[560px] lg:flex-row lg:gap-5">
        <article className="flex h-[470px] flex-col justify-between rounded-[36px] bg-[radial-gradient(120%_120%_at_50%_35%,#F8A97A99,#F8A97A00),#FFF3EA] p-7 lg:h-full lg:flex-1 lg:rounded-[40px] lg:p-10">
          <div className="flex justify-between text-sm text-fg-muted">
            <span className="font-mono">{s.big.number}</span>
            <span>{s.big.tag}</span>
          </div>
          <div className="relative mx-auto h-[230px] w-[270px] lg:h-[300px] lg:w-[290px]">
            <Image src="/clay/quarter-coin.png" alt="" fill sizes="300px" className="object-contain" />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-[26px] font-medium tracking-[-0.8px] lg:text-4xl lg:tracking-[-1.2px]">{s.big.title}</h3>
            <p className="text-[15px] leading-[1.45] text-fg-muted lg:text-[17px]">{s.big.body}</p>
          </div>
        </article>
        <div className="flex gap-3 lg:w-[380px] lg:flex-col lg:gap-5">
          {facts.map((f) => (
            <article key={f.label} className="flex h-[220px] flex-1 flex-col justify-between rounded-[28px] bg-surface p-5 lg:h-auto lg:rounded-[36px] lg:p-8">
              <div className="flex items-start justify-between">
                <span className="text-[13px] font-medium lg:text-[15px]">{f.label}</span>
                <span className="hidden lg:block">{f.visual}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="flex items-end gap-1.5">
                  <span className="text-[52px] font-medium leading-[0.9] tracking-[-2px] lg:text-[88px] lg:tracking-[-3.6px]"><CountUp to={f.value} /></span>
                  <span className="text-lg font-medium text-fg-subtle lg:text-[28px]">{f.unit}</span>
                </span>
                <span className="text-[13px] text-fg-muted lg:text-[15px]">{f.sub}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
```

Render `<TheMath />` after `<YourData />`.

- [ ] **Step 3: Check, checks, commit**

Compare with `Landing / Desktop` → The math and the mobile frame; 25 and 100 count up once, and appear at once with reduced motion. Then:

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page test && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): the math bento with counting numbers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: FAQ accordion

**Files:**
- Create: `landing-page/src/components/Faq.tsx`, `landing-page/src/sections/FaqSection.tsx`
- Test: `landing-page/src/components/Faq.test.tsx`
- Modify: `landing-page/src/app/page.tsx`

**Interfaces:**
- Consumes: `landing.faq`.
- Produces: `<Faq items: readonly { q: string; a: string }[] defaultOpen?: number>`, one item open at a time, each question a `button` with `aria-expanded` controlling its answer region.

- [ ] **Step 1: Write the failing test**

Create `landing-page/src/components/Faq.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Faq } from "./Faq";

const items = [
  { q: "Is this real money?", a: "No." },
  { q: "Which wallets work?", a: "Freighter." },
];

describe("Faq", () => {
  it("opens the default item and keeps the others closed", () => {
    render(<Faq items={items} defaultOpen={1} />);
    expect(screen.getByRole("button", { name: "Which wallets work?" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Is this real money?" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Freighter.")).toBeTruthy();
    expect(screen.queryByText("No.")).toBeNull();
  });

  it("opens one item at a time and closes an open one on a second press", () => {
    render(<Faq items={items} defaultOpen={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Is this real money?" }));
    expect(screen.getByText("No.")).toBeTruthy();
    expect(screen.queryByText("Freighter.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Is this real money?" }));
    expect(screen.queryByText("No.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter landing-page test src/components/Faq`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `landing-page/src/components/Faq.tsx`:

```tsx
"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export function Faq({ items, defaultOpen = 1 }: { items: readonly { q: string; a: string }[]; defaultOpen?: number }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const base = useId();
  return (
    <div className="flex w-full flex-col gap-2.5">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="rounded-[20px] bg-surface px-[18px] py-[18px] lg:rounded-3xl lg:px-[26px] lg:py-[22px]">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${base}-${i}`}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 text-left text-base font-medium lg:text-[19px]"
            >
              {item.q}
              <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-pill", isOpen ? "bg-brand text-fg-on-brand" : "bg-subtle text-fg")}>
                {isOpen ? <Minus size={16} /> : <Plus size={16} />}
              </span>
            </button>
            {isOpen && (
              <p id={`${base}-${i}`} className="mt-3 text-[15px] leading-[1.55] text-fg-muted lg:text-base">{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Create `landing-page/src/sections/FaqSection.tsx`:

```tsx
import { Faq } from "@/components/Faq";
import { landing } from "@/content/landing";

export function FaqSection() {
  return (
    <section id="faq" className="mx-auto flex max-w-[1440px] flex-col items-center gap-8 px-5 pb-10 pt-20 lg:gap-14 lg:px-20 lg:py-[120px]">
      <h2 className="w-[350px] text-center text-[40px] font-medium leading-[1.05] tracking-[-1.6px] lg:w-auto lg:text-[80px] lg:tracking-[-3px]">{landing.faq.title}</h2>
      <div className="w-full lg:w-[820px]">
        <Faq items={landing.faq.items} defaultOpen={1} />
      </div>
    </section>
  );
}
```

Render `<FaqSection />` after `<TheMath />`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter landing-page test`
Expected: PASS.

- [ ] **Step 5: Checks and commit**

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): FAQ accordion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Closing sunrise, footer, metadata and the share image

**Files:**
- Create: `landing-page/src/sections/ClosingAndFooter.tsx`
- Create: `landing-page/src/app/opengraph-image.png` (export of the `Landing / Desktop` hero area at 1200×630 from pen.dev)
- Modify: `landing-page/src/app/layout.tsx` (Open Graph and Twitter metadata), `landing-page/src/app/page.tsx`

**Interfaces:**
- Consumes: `landing.closing`, `landing.footer`, `APP_URL`, `CONTRACT_URL`, `/clay/sunrise-wallet.png`, `/brand/wordmark-cream.png`.

- [ ] **Step 1: Closing and footer**

Create `landing-page/src/sections/ClosingAndFooter.tsx`:

```tsx
import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { landing } from "@/content/landing";
import { APP_URL, CONTRACT_URL } from "@/lib/env";

function resolve(href: string) {
  if (href === "APP") return APP_URL;
  if (href === "CONTRACT") return CONTRACT_URL;
  return href;
}

export function ClosingAndFooter() {
  const c = landing.closing;
  const f = landing.footer;
  return (
    <div className="overflow-hidden">
      <section className="relative mx-auto h-[680px] max-w-[1440px] lg:h-[860px]">
        <div aria-hidden className="absolute left-1/2 top-[410px] h-[520px] w-[910px] -translate-x-1/2 rounded-full bg-glow blur-[50px] lg:top-[500px] lg:h-[1000px] lg:w-[2280px] lg:blur-[90px]" />
        <div aria-hidden className="absolute left-1/2 top-[470px] h-[500px] w-[810px] -translate-x-1/2 rounded-full bg-[radial-gradient(110%_90%_at_50%_5%,#F2620F,#C24A08_55%)] blur-[24px] lg:top-[575px] lg:h-[960px] lg:w-[2040px] lg:blur-[40px]" />
        <h2 className="relative pt-[30px] text-center text-[112px] font-semibold leading-[0.88] tracking-[-5.5px] text-brand lg:pt-10 lg:text-[230px] lg:tracking-[-11px]">
          <span className="lg:hidden">Paid<br />early.</span>
          <span className="hidden lg:inline">{c.headline}</span>
        </h2>
        <div className="absolute left-1/2 top-[205px] h-[262px] w-[252px] -translate-x-1/2 lg:top-[105px] lg:h-[525px] lg:w-[505px]">
          <Image src="/clay/sunrise-wallet.png" alt="" fill sizes="505px" className="object-contain" />
        </div>
        <div className="absolute inset-x-5 top-[500px] flex flex-col items-center gap-3.5 lg:inset-x-0 lg:top-[640px] lg:gap-[18px]">
          <ButtonLink href={APP_URL} variant="light" className="w-full lg:w-auto">{c.cta}</ButtonLink>
          <p className="w-full max-w-[560px] text-center text-[15px] leading-normal text-white/85 lg:text-[17px]">{c.body}</p>
        </div>
      </section>
      <footer className="bg-footer text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-9 px-5 pt-7 lg:gap-[72px] lg:px-20 lg:pt-16">
          <div className="flex flex-col gap-9 lg:flex-row lg:gap-24">
            <p className="max-w-[320px] text-[15px] leading-normal text-white/80 lg:flex-1 lg:text-base">{f.line}</p>
            <div className="flex gap-6 lg:gap-24">
              {f.columns.map((col) => (
                <div key={col.heading} className="flex flex-1 flex-col gap-2.5 lg:w-[200px] lg:gap-3">
                  <span className="text-sm font-semibold lg:text-[15px]">{col.heading}</span>
                  {col.links.map((l) => (
                    <a key={l.label} href={resolve(l.href)} className="text-sm text-white/80 hover:text-white lg:text-[15px]">{l.label}</a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-white/20 pt-[18px] text-[13px] text-white/70 lg:flex-row lg:justify-between lg:pt-5 lg:text-sm">
            <span>{f.legal}</span>
            <span>{f.testnet}</span>
          </div>
          <div className="relative h-[60px] overflow-hidden lg:h-[240px]">
            <Image src="/brand/wordmark-cream.png" alt="Forepay" width={1280} height={200} className="h-auto w-full" />
          </div>
        </div>
      </footer>
    </div>
  );
}
```

Render `<ClosingAndFooter />` last in `page.tsx`.

- [ ] **Step 2: Metadata**

In `landing-page/src/app/layout.tsx` extend `metadata`:

```ts
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Forepay, get paid early on your AdSense revenue",
  description: "Prove three months of AdSense revenue without sharing your Google password and get up to 100 USDC. Live on Stellar testnet.",
  openGraph: { title: "Forepay", description: "Get paid early on the AdSense revenue you already earn.", type: "website" },
  twitter: { card: "summary_large_image", title: "Forepay", description: "Get paid early on the AdSense revenue you already earn." },
};
```

Export the share image in pen.dev: a 1200×630 crop of `Landing / Desktop` → Hero, saved as `landing-page/src/app/opengraph-image.png` (Next.js picks it up by file name).

- [ ] **Step 3: Check the whole page**

Run `pnpm --filter landing-page dev`. At 1440 and 390, compare top to bottom with `Landing / Desktop` and `Landing / Mobile`. Check: no horizontal scroll at 390, 768, 1024, 1280 and 1440; every in-page link scrolls to its section; the sunrise flows into the footer with no visible edge; reduced motion shows the still hero, no marquee motion, no count-up.

- [ ] **Step 4: Checks and commit**

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page test && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): closing sunrise, footer, metadata and share image

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12b: Scroll lifts for the section objects

**Files:**
- Create: `landing-page/src/components/ScrollLift.tsx`
- Modify: `landing-page/src/sections/HowItWorks.tsx`, `TheMath.tsx`, `ClosingAndFooter.tsx`

**Interfaces:**
- Consumes: `usePrefersReducedMotion` (Task 4).
- Produces: `<ScrollLift from: number to: number className?: string>` that moves its children on y from `from` px to `to` px while its section scrolls through the viewport (GSAP scrub). With reduced motion it renders the children at rest.

Covers the spec's section motion: the lifted coin and the dropping coin in How it works, the quarter lifting out in The math, the sunrise rising into the footer.

- [ ] **Step 1: Implement**

Create `landing-page/src/components/ScrollLift.tsx`:

```tsx
"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function ScrollLift({ from, to, children, className }: { from: number; to: number; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  useGSAP(() => {
    if (reduced || !ref.current) return;
    gsap.fromTo(ref.current, { y: from }, {
      y: to,
      ease: "none",
      scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: true },
    });
  }, { dependencies: [reduced, from, to], scope: ref });
  return <div ref={ref} className={className}>{children}</div>;
}
```

- [ ] **Step 2: Use it**

- `HowItWorks.tsx`: wrap the image box of step 2 in `<ScrollLift from={20} to={-20} className="relative h-[300px]">` and of step 3 in `<ScrollLift from={-30} to={10} className="relative h-[300px]">` (move the `relative h-[300px]` class from the inner div onto the wrapper).
- `TheMath.tsx`: wrap the quarter coin box in `<ScrollLift from={24} to={-24} ...>` with the same size classes.
- `ClosingAndFooter.tsx`: wrap the two sunrise ellipses in `<ScrollLift from={120} to={0} className="absolute inset-0">`.

- [ ] **Step 3: Check, checks, commit**

Scroll each section: objects move a little, never more than the values above. With reduced motion nothing moves.

```bash
pnpm --filter landing-page lint && pnpm --filter landing-page typecheck && pnpm --filter landing-page test && pnpm --filter landing-page build
git add landing-page/src
git commit -m "feat(#54): scroll lifts for the section objects and the sunrise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Final assembly check and the PR

**Files:**
- Modify: `landing-page/README.md` (replace the scaffold text)
- Modify: `landing-page/src/app/page.tsx` (final order)

- [ ] **Step 1: Final page order**

`landing-page/src/app/page.tsx`:

```tsx
import { Nav } from "@/components/Nav";
import { ClosingAndFooter } from "@/sections/ClosingAndFooter";
import { FaqSection } from "@/sections/FaqSection";
import { Hero } from "@/sections/Hero";
import { HowItWorks } from "@/sections/HowItWorks";
import { TheMath } from "@/sections/TheMath";
import { YourData } from "@/sections/YourData";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <YourData />
        <TheMath />
        <FaqSection />
      </main>
      <ClosingAndFooter />
    </>
  );
}
```

- [ ] **Step 2: README**

Replace `landing-page/README.md` with:

```md
# Forepay · landing page

The public page for AdSense creators (#54, out of SOW). Design: the 04 Landing column of
`docs/design/forepay.pen`. Spec: `docs/superpowers/specs/2026-10-16-landing-page-design.md`.

## Run

From the repo root, `pnpm install --frozen-lockfile`, then `cd landing-page && pnpm dev`.

## Environment

- `NEXT_PUBLIC_APP_URL`, where "Open the app" goes (the deployed `fe`, from #22).
- `NEXT_PUBLIC_CONTRACT_URL`, the advance contract on stellar.expert, from `docs/deployments.md`.
- `NEXT_PUBLIC_SITE_URL`, this page's own URL, for share images.

## Where things are

Every word is in `src/content/landing.ts`, checked by `landing.test.ts` against the copy rules.
Sections are in `src/sections/`, one file each. The 3D hero is `src/sections/scene/`, with
`public/clay/hero-still.png` as the fallback for reduced motion and no WebGL.
```

- [ ] **Step 3: Full check from the repo root**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all pass for every package.

- [ ] **Step 4: Commit and push**

```bash
git add landing-page
git commit -m "docs(#54): landing README and final page order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push --force-with-lease -u origin feat/54-landing-page
```

`--force-with-lease` replaces the old design-only branch, whose content is already on main through #59.

- [ ] **Step 5: Open the PR**

```bash
gh pr create --base main --head feat/54-landing-page --title "#54 Landing page, built" --body "Builds the 04 Landing design from docs/design/forepay.pen in landing-page/. Out of SOW. Deploy follows.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Deploying it and recording the URL in `docs/deployments.md` follows the host chosen for #22.
