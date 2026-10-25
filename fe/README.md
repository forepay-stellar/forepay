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
pnpm test        # vitest, src/**/*.test.ts(x)
pnpm build
```

End to end, run locally (CI does not run it yet):

```bash
npx playwright install chromium   # once
pnpm test:e2e                     # Playwright, tests/e2e
```

It uses Playwright's own Chromium. Google Chrome works too (`PW_CHANNEL=chrome`), but on a Mac with
a Chrome update pending, Chrome's updater can keep a finished run from exiting. It starts its own
`next dev` on port 3219 (or `PW_PORT`), built into `.next-e2e` (`NEXT_DIST_DIR`), so it runs
alongside your own `next dev`. A second one, on the port after it and built into `.next-e2e-relay`,
has the relay and the Google client id set, for `tests/e2e/relay.spec.ts`: there Google's sign-in is
a stub and the spec answers the relay. Every run starts both, which takes longer and needs both
ports free; `PW_RELAY=0` leaves the relay build and its specs out. Both folders' types are in
`tsconfig.json`; any other `NEXT_DIST_DIR` makes Next add its own, so do not commit that.

It sets its own environment (`playwright.config.ts`): the test wallet (`NEXT_PUBLIC_E2E=1`), a fake
RPC URL and a fake #16 API URL whose answers each spec decides (`tests/e2e/rpc.ts`,
`tests/e2e/api.ts`), so a run never touches testnet or a real API and needs no browser extension.

## Environment

All variables are listed in `.env.example`. They are all `NEXT_PUBLIC_*`, so they end up in the
browser. Never put a secret in one.

- **Addresses** (advance contract, USDC) come from `docs/deployments.md`. Copy them, do not retype
  them.
- **`NEXT_PUBLIC_API_URL`** points at the #16 API. Its `/config` route reports the addresses it
  uses. If they differ from yours, one of you is on an old deployment.
- **`NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`** is only needed for mobile wallets. Without it,
  desktop browser wallets still work.

## Proving revenue: the relay, or a mock

With `NEXT_PUBLIC_RELAY_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set, the creator signs in with Google's
own popup (`adsense.readonly` only) and the #17 relay makes the proof, which takes about a minute, more
behind a queue (`src/lib/reclaim/relay.ts`, `docs/api.md`). No Reclaim SDK runs in the browser. The job
id is kept in `sessionStorage`, so leaving /advance or reloading while it proves comes back to the same
job without a second sign-in.

`src/lib/reclaim/` answers from a mock while `NEXT_PUBLIC_RELAY_URL` is empty. It walks through the session (window open, reading) and
returns fixed values. Everything after it, the offer from `quote`, the proof check, `request_advance`
and the receipt, is the real contract client. On testnet the contract refuses the mock's proof, so the
whole flow only completes in the e2e run, against the stubbed RPC.

The mock reads two localStorage keys. Set them in the browser and reload:

| Key | Value | What happens |
| --- | --- | --- |
| `forepay.mock.reclaim` | `cancel` | "You closed the AdSense window", anywhere |
| `forepay.mock.revenue` | `3.20` | "Not enough revenue yet", on testnet and in e2e: the contract's `quote` refuses it before the proof check |
| `forepay.mock.revenue` | `1240.00` | the offer capped at 100 USDC, **only in the e2e run**. Against testnet the proof check that follows `quote` refuses the mock's proof (today `10`, "Advances are not open yet", because the claim template is not set), and with the e2e RPC URL but no stub it shows "We could not reach Stellar" |

Every other state on the board (each contract code, signing, pending, timed out) needs the stubbed
RPC and is exercised in `tests/e2e/advance.spec.ts`.

While `NEXT_PUBLIC_API_URL` is empty, Repayment and History read fixtures instead of the #16 API.
One more key picks their state:

| Key | Value | What happens |
| --- | --- | --- |
| `forepay.mock.ledger` | `active` (or unset) | Advance 1: 30.00 of 90.00 USDC repaid, with the 3a and 3b frames' transactions |
| `forepay.mock.ledger` | `none` | "No advance yet" on both pages |
| `forepay.mock.ledger` | `repaid` | the advance fully repaid, with a last 60.00 repayment |
| `forepay.mock.ledger` | `error` | "We cannot read your balance right now" |

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
