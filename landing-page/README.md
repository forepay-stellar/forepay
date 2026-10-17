# Forepay landing page

The public page for AdSense creators (#54, out of SOW). It explains Forepay in plain words and
sends people into the app.

- Design: the 04 Landing column of `docs/design/forepay.pen` (desktop, mobile, hero storyboard,
  mobile menu states).
- Spec: `docs/superpowers/specs/2026-10-16-landing-page-design.md`.
- Plan: `docs/superpowers/plans/2026-10-17-landing-page.md`.

## Run

```bash
# from the repo root, once
pnpm install --frozen-lockfile

cd landing-page
pnpm dev          # http://localhost:3000
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Tests use jsdom 30, which needs Node 22.19 or newer (CI runs Node 24).

## Environment

All optional, all public. Set them where the page is deployed.

| Name | What it is | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Where "Open the app" goes: the deployed `fe` from #22 | the `fe` folder on GitHub |
| `NEXT_PUBLIC_CONTRACT_URL` | "Contract on Stellar" in the footer: the advance contract on stellar.expert, from `docs/deployments.md` | `docs/deployments.md` on GitHub |
| `NEXT_PUBLIC_SITE_URL` | This page's own URL, so share images get a full URL | `http://localhost:3000` |

## Where things are

| Path | What |
| --- | --- |
| `src/content/landing.ts` | Every word on the page. `landing.test.ts` checks each one against the copy rules in `docs/design/brief.md` §3 and pins the contract's 25% and 100 USDC. |
| `src/sections/` | One file per section, in page order: `Hero`, `HowItWorks`, `YourData`, `TheMath`, `FaqSection`, `ClosingAndFooter`. |
| `src/sections/scene/` | The 3D clay hero (React Three Fiber), built in code from the hero's 3D stage in the design. |
| `src/components/` | Nav, mobile menu, buttons, FAQ, marquee, count up, reveal and scroll lift. |
| `src/components/brand/Logo.tsx` | Wordmark and mark, the same file as in `fe/`. Change both together. |
| `public/clay/` | The clay objects, exported from the design as WebP. `hero-still.webp` is also the hero for reduced motion and for browsers without WebGL. |

## Motion and fallbacks

- The headline and the still hero render first as plain HTML. The 3D canvas loads once the still is
  on screen and the browser is idle (the WebGL check waits too: its first context is a slow GPU
  start-up), only for the layout on screen, and renders only while the hero is visible.
- With `prefers-reduced-motion`, or without WebGL, the still image stays and nothing moves:
  no 3D, no marquee, no count up, no scroll motion, no smooth scroll.
- Smooth scroll (Lenis) is for wheel and trackpad only; phones keep their own scrolling.
- A reload starts at the top; a link to a section (`/#faq`) still lands on it.
