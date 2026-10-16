# Forepay, design brief for the creator front end

Read this before touching `docs/design/forepay.pen`. It is the handoff for any session or person
designing Forepay's screens; it says what Forepay is, which frames exist, and which rules the
designs must not break.

Owner: Ancung (@AncungAulia), Branch: `design/ui-ux`, Feeds issues #19, #20, #21, #22.

## 1. What Forepay is, in one paragraph

A content creator earns real AdSense revenue but cannot borrow against it without handing over
credentials or posting collateral. Forepay lets them **prove** their trailing AdSense revenue with
Reclaim (zkTLS: an attestor witnesses the creator's own session with Google and signs the revenue
figure, credentials stay hidden), then a Soroban contract on **Stellar testnet** verifies that
signature, **sizes** an advance with a fixed rule, **disburses USDC**, and keeps a **repayment
ledger**. It is a 30-day technical demonstration for a Stellar Instawards grant, not a lending
business: no collateral, no credit model, no due dates, no fees, no default handling, testnet only.

The reviewer is an Ambassador Chapter Lead with little technical background. Every screen has to
make one thing obvious: **the number is not ours, it is read from chain and can be checked.**

## 2. Sources of truth

| What | Where |
| --- | --- |
| Design tokens (colour, type, radius, spacing) | Figma `Forepay` → frame "Forepay, Design tokens, Orange", node `93:193`, mirrored in `fe/app/tokens.css`, snapshot `reference/design-tokens-orange.png` |
| Approved look (warm orange, flat) | Figma node `92:214` "Repayment / Desktop, Warm orange, No shadow, no stroke" (page `11:2`), snapshot `reference/repayment-desktop-warm-orange.png` |
| Logo | `assets/logo-wordmark.png` (wordmark), `assets/logo-mark.png` (mark: circle with waves, for favicon, avatar, small spaces) |
| Contract behaviour | `docs/interface.md` (frozen), issues #12, #13 |
| What each screen must do | issues #19, #20, #21, #22 |
| Scope | issue #30 and the SOW (Deliverable 2) |

https://www.figma.com/design/IFnDNonLcCKQIUUgBhrq2M/Forepay

## 3. Visual rules (from the approved orange design)

- **Flat.** Surfaces separate by contrast: white `surface` cards on the Stone `canvas`. No shadows,
  no strokes on cards, no gradients, no orange glows.
- **Tangerine `brand`** (`#F2620F`) for the hero card, icons and accents. **Primary buttons are
  near-black `action`** (`#1C1612`), pill-shaped, not orange.
- **Emerald means money arrived** (success, "Verified on-chain", "+500.00 USDC"). Never use it for
  a neutral action. Rose is for failures only.
- **Numbers are the star**: Geist SemiBold, tight tracking, decimals faded (`300` solid, `.00` muted).
- Big soft corners: chip 8, icon 14, input 18, tile 22, card 24, hero 28. Status chips stay at 8 so
  they do not read as pills.
- Font: Geist (Geist Mono for hashes and addresses). 4px spacing base, page margin 64 on desktop,
  cards 16 apart, card padding 24. Read the copy rules below before writing any text.
- Icons: one brand colour, flat filled shapes, 28px, on a `brand-subtle` tile. Small UI glyphs
  (chevron, copy, close, arrow) may use lucide.
- **Big moments use custom spot illustrations, not library icons.** Error panels, empty states,
  success and waiting screens get a flat vector illustration in the brand palette (tangerine,
  peach, rust, near black), chunky geometric shapes, no outlines, no gradients, no text, reusing the
  logo motif (circle with waves) where it fits. They live in the design system as `Illo/…`
  components. When the pen.dev generate quota is gone, draw new ones by hand from rectangles,
  ellipses and stroked paths in the same palette (#EF5A0C, #FDE2CE, #FBC9A0, #FFF3EA, #953202,
  #1F1814, emerald #059669 only for money arrived), centered in a 200 by 160 frame. Funds received,
  Proving revenue, Waiting for signature, Fully repaid, Advances paused, Wrong network and Proof not
  confirmed were made this way.
- **Stepper is bar segments, not numbered circles.** Desktop: one column per step with a 4px bar on
  top (done near black, current tangerine, next stone), then "Step 2", the step name, and a state
  word (Done, You are here, Next). Mobile: "Step 2 of 4" + step name, with short bar segments on
  the right.
- Light mode only. Dark mode is not designed (#38).

### Copy rules (hard, no exceptions in the UI)

1. **No em dash (—)** anywhere in UI text. Rewrite the sentence or split it.
2. **No full-uppercase text with wide tracking.** Status chips, overlines, eyebrows and buttons are
   sentence case with normal tracking: `Active`, `Repaid`, `Max`, `Testnet`, not `ACTIVE`, `MAX`.
   This overrides the `text-overline` token (uppercase, 0.08em) and the mockup's `ACTIVE` / `MAX`
   chips; do not use that style.
3. **No colon (:) and no semicolon (;) in any text.** Put label and value in separate text layers
   laid out side by side instead of `Wallet: 820.00`. Write two sentences instead of joining them
   with a semicolon. This includes error messages and helper text.
4. **Plain words, no jargon.** The creator is not a crypto engineer. Say what happens to them, not
   how the system works. Keep words like nullifier, attestor, zkTLS, SAC, contract call, stroops,
   RPC, epoch and digest out of the UI.

   **The exact words for every failure are the ones on the States and interactions boards** in
   `forepay.pen`, as built in `fe/src/lib/errors.ts`. Those boards are the single source. This table
   only shows the translation for the most common terms:

   | Internal term | Title the UI shows | Body |
   | --- | --- | --- |
   | `20` Nullifier spent | "This proof was already used" | "Each three month revenue period can fund one advance. A new period opens when the next quarter ends." |
   | `12` Proof stale | "This proof expired" | "A revenue proof is good for one hour. Prove your revenue again, it takes about a minute." |
   | `14` Verifier rejected | "We could not confirm this proof" | "The revenue could not be matched to Google's data. Try proving again. If it keeps happening, log out of AdSense and back in first." |
   | `41` No USDC trustline | "Your wallet needs to accept USDC first" | "Approve USDC in your wallet, then accept the offer again. Your proof is still valid." + "Allow USDC" |
   | `40` Insufficient liquidity | "Advances are paused right now" | "There is not enough USDC in Forepay to send this advance. Your proof was not used. Try again later." |
   | `31` Advance too small | "Not enough revenue yet" | "25% of {revenue} is under 1 USDC, the smallest advance we can send. Your proof was not used." |
   | Refused before the ledger | "The transaction did not go through" | "Nothing was charged and no USDC moved. Try again in a moment." |
   | Failed on the ledger | "The transaction did not go through" | "Stellar kept the tiny network fee, but no USDC moved. Try again in a moment." |
   | Tx hash, stellar.expert | "View receipt" (opens stellar.expert) | |

   **"Nothing was charged" only when it is known to be true.** A transaction refused before the
   ledger charged nothing. One that failed on the ledger kept the network fee. One that was sent but
   not confirmed may still land, so it says "not confirmed yet", never "nothing was charged".

   Words the creator already knows are fine: wallet, USDC, AdSense, revenue, advance, repay,
   Testnet.
5. **No buzzwords.** No "seamless", "unlock", "empower", "revolutionary", "next-gen",
   "trustless", "Web3-powered", "supercharge", "effortless", "game-changing". Say the concrete
   thing instead ("Get up to 100 USDC based on your AdSense revenue").

6. **Dates without clock times** (`12 Oct 2026`). A clock time needs a colon, so it is left out
   until decided otherwise.
7. **No decorative dots.** No middle dot `·` separators, and no status dots or live dots in chips.
   Separate with layout spacing, and let color and words carry status.
8. **Only the inputs the app needs.** The one form is the repay amount (amount input + 25% / 50% /
   Full amount chips). No select, checkbox, radio, toggle or text field until a screen needs one.
9. **The revenue window is data, never copy.** The three months come from the claim template on
   chain and move to the next period when it is reset. Screens show the window the proof will
   actually cover, read from chain (for example "Jul to Sep 2026" in the mockups is sample data).
   Never write a fixed range like "July to September" into a sentence.
   | Verified on-chain | "Verified" with a link to the receipt |

### Language

- **Everything in the `.pen` file is English**: UI copy, frame names, layer names, labels, board
  titles and descriptions. Frame names use a slash, never a dot or a dash: `Repayment / Desktop`.

## 4. Numbers the designs must use

The approved mockup was drawn before the interface was frozen; its "1,240 × 0.5, capped at 500" is
wrong. Use these, from `docs/interface.md` §5–§7:

| Rule | Value |
| --- | --- |
| Advance | `min(100 USDC, proven revenue × 25%)` |
| Revenue window | three months, e.g. "Jul–Sep 2026" |
| Minimum advance | 1 USDC; below that the request is refused (`AdvanceTooSmall`) |
| Proof freshness | proof older than 1 hour is refused (`ProofStale`) |
| One proof, one advance | the nullifier is spent on use (`NullifierSpent`) |
| Repayment | any amount, any time, up to the outstanding balance (`RepaymentExceedsOutstanding`) |
| Due date, fee, interest, late penalty | **none exist, do not draw them** |
| Network | Stellar testnet; USDC `USDC-GBBD47…LFLA5`, SAC `CBIELTK6…XQDAMA` |

Example figures for mockups: proven revenue $360.00 → 25% = 90.00 USDC (under the cap); proven
revenue $1,240.00 → 310.00, capped at **100.00 USDC**.

## 5. Canvas layout (copy of the Gatherly file's structure)

```
x→   0                    col 01                 col 02                     col 03
y=0  00 Start here     Label 01 Onboarding  Label 02                 Label 03
                                                 Sub 1a 1b 1c         Sub 3a  3b
y=420                     Desktop | Mobile       Desktop | Mobile (each)    Desktop | Mobile
     Forepay Design       States & interactions  States & interactions      States & interactions
     System
```

- **00 Start here**: map of the flow (01 → 02 → 03), legend (Desktop 1440 / Mobile 390 /
  States & interactions / Design system), one line on what Forepay is.
- **Forepay Design System**: 01 Color, 02 Typography, 03 Spacing, radius and elevation,
  04 Base components, 05 Product components, 06 Logo, 07 Usage rules. Every reusable component
  lives here.
- **Each flow**: a label frame ("01 Connect wallet" + what it covers + "Next, Prove and accept"),
  the Desktop (1440) and Mobile (390) frames side by side, then a "States & interactions" board whose
  numbered rows hold cells of preview + title + one line on when that state appears.

## 6. Frames to design

### 01 Onboarding, issue #19

First visit only. A landing page will do the marketing later, so this is short and functional, not a
mini landing page. Returning creators with a connected wallet skip it and land on Advance or
Repayment. Each step is Desktop + Mobile.

Layout is one centered column (520 wide on desktop), not image left and text right. Desktop top bar:
wordmark, the three step bar stepper ("Stepper/Onboarding") in the middle, Testnet chip on the
right. Column: small spot illustration, centered title and body, content, full width primary button,
one text link under it. Mobile: back chevron or mark top left, segments with "Step 2 of 3", content
centered, actions pinned to the bottom.

Navigation: 1a has no back. 1b has a back chevron to 1a, top left, never under the primary button.
1c has no back, because the wallet is already connected. It offers "Use a different wallet", which
disconnects and returns to 1b.

- **1a Before you start**: one line on what Forepay does, what you need (AdSense account with revenue
  in the last three months, a Stellar wallet on testnet, about three minutes), Get started.
- **1b Connect wallet**: one "Connect wallet" button, no wallet list on the page. The visual is the
  wallet spot illustration. No floating wallet logo collage (tried, rejected). Real wallet logos from
  `assets/wallets/` appear only inside the picker rows. The button opens the Stellar Wallets Kit picker on desktop (`authModal()`, library UI,
  we only theme it) and WalletConnect as a bottom sheet on mobile. Full-screen versions of both are
  drawn as "1b Wallet picker open".
- **1c Allow USDC**: only if the wallet cannot receive USDC yet, skipped otherwise.

The old "connected and ready" screen moved to 02 as **2a Prove revenue**.

States & interactions:
1. Wallet picker (Stellar Wallets Kit modal), connecting
2. **No USDC trustline**: plain-words explanation, one-click "Allow USDC" (UI words per §3 rule 4), then signing,
   then added. Shown at connect time, never after proving.
3. Wrong network (wallet on mainnet), wallet locked or not installed, user rejected the connection
   A new wallet with no test XLM yet: "Add test XLM to your wallet first" with "Get test XLM"
   (Friendbot), a waiting state while the account appears on the ledger, and "We could not add test
   XLM" if the faucet does not answer.
4. Wallet menu: copy address, view on stellar.expert, disconnect
5. Reload keeps the session

### 02 Prove and accept, issue #20

Sub-steps, each Desktop + Mobile:
- **2a Prove revenue**: what will be read (AdSense revenue for the last three months, nothing
  else), what will not (password, other data), start the Reclaim session.
- **2b Offer**: the offered advance **with its derivation**. Proven revenue, window, × 25%, cap
  100, result. "Verified" with a "View receipt" link. Accept.
- **2c Sign**: waiting for the wallet signature, then submitting.
- **2d Funds received**: USDC received, amount, tx hash linked to stellar.expert, "Go to repayment".

States & interactions:
1. Reclaim session: QR / popup open, waiting for the creator to log in to AdSense, proof generating
2. Offer variants: under the cap, capped at 100, below 1 USDC (refused: nothing to borrow, nullifier
   not burned)
3. **Every failure named, never "Something went wrong"**. Each says what to do next, in the plain words of §3 rule 4.
   cancelled the Reclaim session, proof rejected by the verifier, proof already used (nullifier
   spent), proof stale (older than 1 hour), no USDC trustline, contract call failed, contract
   has insufficient liquidity
4. Signing interactions: wallet rejected the signature, transaction pending, timed out
5. No "repay first" rule. The contract allows one advance per revenue period, not one open advance
   per creator. A second try in the same period is the "This proof was already used" state above.
   The template pins one period (Jul to Sep 2026), so in practice a creator holds one advance.

### 03 Repayment, issue #21

Based on the approved mockup (node `92:214`), with the numbers fixed per §4.

- **3a Repayment**: hero card (outstanding balance, repaid / advanced, progress), quick actions
  (Repay, Pay in full, Explorer, Proof), "Make a repayment" (amount, 25% / 50% / Full, outstanding
  after, network fee, Repay button), Transactions, Advance details, the "read from the Stellar
  ledger" note.
- **3b All transactions** ("See all" / History tab): full list of the advance's transactions.

States & interactions:
1. Partially repaid, fully repaid (status Repaid, form disabled), no advance yet (empty state that
   points to the Advance tab)
2. Repay form: empty, typing, amount above outstanding (blocked in the UI), amount above wallet
   balance, 25 / 50 / Full chips selected
3. Repay flow: signing, pending, success (row added), failed and not charged
4. Loading from the API, API unreachable (figures are never shown from browser memory)
5. Transaction row interactions: hover, open in stellar.expert, failed row

## 7. Components for the design system

Basic: Button (Primary black pill, Secondary, Outline, Ghost, Danger; default / hover / pressed /
disabled / loading), Input (amount), Chip (25% / 50% / Full), Status chip (Active, Pending,
Repaid, Failed), Network chip (Testnet), Alert (info, success, danger), Icon tile.

Product: Top Nav (logo, Advance / Repayment / History, Testnet, wallet), Wallet chip + menu,
Hero balance card, Quick action tile, Repayment form, Transaction row, Advance details list,
Derivation card (revenue × 25%, cap, result), Step indicator (prove → offer → sign → received),
Proof status (verifying, verified on-chain), Ledger note, Error panel (title, cause, next action).

## 8. Out of scope for these designs

Landing page (later, not a SOW deliverable), dark mode, real underwriting, due dates, fees,
penalties, reminders, KYC, revenue sources other than AdSense, mainnet.
