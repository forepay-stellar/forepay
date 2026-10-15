# Forepay landing page · design spec

Issue #54 · owner @AncungAulia · branch `feat/54-landing-page` · label `out-of-sow`

## 1. Goal

A public page that makes an AdSense creator want to try Forepay, and sends them into the app.

- **Audience:** content creators who earn AdSense revenue. Not reviewers, not developers. Warm,
  simple, benefit first.
- **Job:** answer, in order, "what is this", "is it safe", "how much can I get", "how do I pay it
  back", then "Open the app".
- **Feel:** premium, with one signature moment, a 3D hero in matte clay. Everything below the
  hero moves in 2D with the existing flat illustrations.
- **Not in scope:** anything for reviewers or a technical deep dive, a calculator, multi language,
  dark mode, a blog.

This page is not an Instawards deliverable. It must not take time from the M3 front end or the M4
demo (see §8 for what to cut first).

## 2. Content and copy rules

Same as the app, from `docs/design/brief.md` §3: English, no em dash, colon, semicolon, middle
dot or all caps labels, plain words, no buzzwords, dates without clock times. Nothing the
contract does not do: no due dates, fees, interest, penalties or reminders. Every number matches
`docs/interface.md`: 25% of three months of proven revenue, capped at 100 USDC, minimum 1 USDC.
It is a Stellar testnet demonstration with no real money, and the page says so plainly.

## 3. Page structure

| # | Section | Content | Motion |
| --- | --- | --- | --- |
| 1 | Nav | Wordmark, "How it works", "FAQ", Testnet chip, "Open the app" | Shrinks and gains a surface background after the first scroll |
| 2 | Hero | Headline "Get paid early on the AdSense revenue you already earn", one supporting sentence, "Open the app" and "How it works". Right side, the 3D stage: a clay wallet and a few wave coins floating. | Coins bob gently, the scene tilts toward the cursor, one coin drops into the wallet as scrolling starts |
| 3 | How it works | Three steps, Prove your revenue, See your offer, Get USDC, each with an existing spot illustration | Each step enters in turn as it scrolls in, its illustration assembling from its shapes |
| 4 | Your password stays yours | "What we read" against "What we never see", the same lists as the app, with the seal illustration | List items appear one by one, the seal closes |
| 5 | The math | One large example, $360 becomes 90 USDC, with 25% and the 100 USDC limit spelled out | The numbers count up on entry |
| 6 | Repay on your terms | "Any amount, any time", built from the app's balance card | The progress bar fills |
| 7 | FAQ | Is this real money (no, testnet demo). Which wallets. What do you read from AdSense. What if I cannot repay (honest, it is a demo with no collection). | Accordion |
| 8 | Final CTA and footer | "Open the app" again, the testnet note, GitHub link | Soft fade |

## 4. Visual direction

- **Same language as the app:** Stone canvas, white surfaces, tangerine accents, near black pill
  primary buttons, Geist, large numbers with faded decimals, the spot illustrations.
- **More generous than the app:** display headline around 88 to 96 px on desktop, 160 px or more
  between sections, wide empty space. Premium comes from scale and room, not decoration.
- **3D in matte clay:** rounded tangerine wallet, coins with a raised wave motif, peach proof
  paper. Matte surfaces, soft contact shadows, warm key light from the upper left. Colors are the
  palette tokens only.

## 5. Design deliverables in `docs/design/forepay.pen`

A new column, **04 Landing**, following the same pattern as the other flows:

- `Label 04 Landing`
- `Landing / Desktop` (1440) and `Landing / Mobile` (390), full page
- `Landing / Hero storyboard`: three or four frames of the 3D scene (at rest, tilted toward the
  cursor, coin dropping on scroll), each with motion notes (trigger, duration, easing)
- `Landing / States and interactions`: nav on scroll, button hover, FAQ open and closed, the
  reduced motion version, the mobile fallback

pen.dev cannot render 3D, so the storyboard draws the scene as layered pseudo 3D (shapes with
soft gradients and shadows) to fix shape, color and composition. The real look comes from the
build.

## 6. Build in `landing-page/`

| Need | Choice |
| --- | --- |
| Framework | The existing Next.js 16 scaffold, Tailwind 4, the same `tokens.css` as `fe/` |
| 3D | `@react-three/fiber` and `@react-three/drei`. The wallet is a `RoundedBox`, the coins are cylinders with a raised wave, all built in code, no model files |
| Material | `meshStandardMaterial` with high roughness, token colors, `ContactShadows` on the floor |
| Scroll animation | `gsap` with ScrollTrigger |
| Smooth scroll | `lenis`, optional |
| Small glyphs | `lucide-react` |

**Performance and fallback:**

- The 3D canvas is loaded late (dynamic import, no SSR). Headline and buttons render first as
  plain HTML.
- Pixel ratio is capped and rendering stops when the hero is off screen.
- On phones the scene is simplified and the cursor tilt is off.
- Without WebGL, or with `prefers-reduced-motion`, a static render of the same scene replaces the
  canvas and scroll animations are reduced to plain fades.
- The canvas is `aria-hidden`. Every piece of information is in the HTML.

**Also:** page metadata, an Open Graph image, and "Open the app" pointing at the deployed app URL
from #22 through an environment variable.

## 7. Done when

- 04 Landing is designed in `forepay.pen`, desktop, mobile, storyboard and states.
- `landing-page/` builds and passes lint and typecheck in CI.
- The page is deployed, links to the live app, and its copy passes the brief's copy rules.
- On a mid range phone the headline is the largest contentful paint, not the canvas, and the page scrolls without visible jank. Slow devices get the static fallback.

## 8. If time runs short

Cut in this order and keep the rest: Lenis, then the coin drop on scroll, then the cursor tilt.
The 3D hero with its gentle bobbing stays. If even that is at risk, ship the static render first
and add the canvas later.
