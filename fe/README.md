# Forepay · creator front end

The app a creator uses to prove their AdSense revenue, accept a USDC advance on Stellar testnet,
and repay it. Issues #19, #20, #21 and #22.

Before writing code, read:

1. `ARCHITECTURE.md`: folder structure, libraries, state, wallet, loading rules
2. `../docs/design/brief.md` and `../docs/design/forepay.pen` (open in pen.dev): every screen and state
3. `AGENTS.md`: this is Next.js 16, check `node_modules/next/dist/docs/` before using an API from memory

## Run it

`fe` is a member of the pnpm workspace at the repo root, so install from the root once.

```bash
# from the repo root
pnpm install --frozen-lockfile

# then
cd fe
cp .env.example .env.local   # fill in, see below
pnpm dev                     # http://localhost:3000
```

Checks, the same ones CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Environment

All variables are listed in `.env.example`. They are all `NEXT_PUBLIC_*`, so they end up in the
browser. Never put a secret in one.

- **Addresses** (advance contract, USDC) come from `docs/deployments.md`. Copy them, do not retype
  them.
- **`NEXT_PUBLIC_API_URL`** points at the #16 API. Its `/config` route reports the addresses it
  uses. If they differ from yours, one of you is on an old deployment.
- **`NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`** is only needed for mobile wallets. Without it,
  desktop browser wallets still work.

## A wallet to test with

1. Install the Freighter browser extension and create an account.
2. Switch Freighter to **Testnet**.
3. Fund the account with test XLM using Friendbot (Freighter offers it on testnet).
4. Open the app and connect. If the account cannot hold USDC yet, onboarding step 1c asks you
   to allow it. Approve once in Freighter.

Never use a mainnet account or a wallet that holds real funds.

## Where things go

| You are building | Put it in |
| --- | --- |
| A route | `src/app/.../page.tsx`, one line that renders a module |
| A screen and its logic | `src/modules/<onboarding, advance, repayment, history>/` |
| A component from the design system | `src/components/ui` (section 04) or `src/components/elements` (section 05) |
| A spot illustration | `src/components/illustrations` |
| A contract or wallet call | `src/lib/stellar/` |
| An error message | `src/lib/errors.ts`, using the copy in the brief |

Full detail in `ARCHITECTURE.md`.

## Rules that are easy to break

- Figures come from the API or the contract, never from what the browser remembers.
- Every failure has its own message. "Something went wrong" is not allowed.
- UI copy: no em dash, colon, semicolon, middle dot or all caps labels. Plain words, no buzzwords.
  Dates without clock times.
- No lending rules the contract does not have: no "repay first", no due dates, no fees.
