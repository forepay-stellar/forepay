# Forepay front end · architecture

How `fe/` is organised and which libraries it uses, decided before the first screen is built so
#19, #20, #21 and #22 all land in the same shape.

Read with:

- `docs/design/brief.md` and `docs/design/forepay.pen` for what every screen and state looks like
- `docs/interface.md` for the contract the app calls (frozen)
- `docs/deployments.md` for contract addresses on testnet
- `fe/AGENTS.md`: this is Next.js 16. Read `node_modules/next/dist/docs/` before using an API you
  remember from an older version. `middleware` is now `proxy`, for example.

## 1. Principles

1. **Every figure comes from chain.** Balances, offers and transactions are read through the API
   (#16) or the contract, never kept in browser state and shown again later (#21). When the read
   fails, the screen says so instead of guessing.
2. **The contract does the arithmetic.** The offer on screen comes from the contract's `quote`,
   not from a copy of `25% capped at 100` in TypeScript (#20).
3. **Every failure has its own words.** Contract error codes map to the plain sentences in the
   brief, in one file (`src/lib/errors.ts`). "Something went wrong" is not allowed.
4. **Routes are thin.** A `page.tsx` renders one module and nothing else. Logic lives in
   `src/modules/<feature>`.
5. **Design system first.** Components match the pen.dev design system one to one, and use the
   semantic tokens in `tokens.css` (`bg-surface`, `text-fg-muted`, `rounded-card`), never raw hex.

## 2. Folder structure

Everything that is application code lives under `src/`. Config files, `public/` and `.env*` stay
at the `fe/` root, as Next.js expects.

```
fe/
  public/
    wallets/                freighter.png, xbull.png, rabet.png, walletconnect.png
  src/
    app/                    routes only
      layout.tsx            fonts, providers, Toaster
      globals.css
      tokens.css            design tokens (#38), unchanged
      page.tsx              redirect: no wallet → /start, wallet → /advance
      (onboarding)/
        start/page.tsx      → modules/onboarding      1a, 1b, 1c
      (app)/
        layout.tsx          AppShell: top nav, mobile header, tab bar, wallet guard
        advance/page.tsx    → modules/advance         2a to 2d
        repayment/page.tsx  → modules/repayment       3a
        history/page.tsx    → modules/history         3b
    components/
      ui/                   Button, Chip, Input, Alert, Dialog, Sheet, Skeleton, Spinner
      elements/             BalanceCard, TransactionRow, Stepper, OfferBreakdown,
                            RepayForm, ErrorPanel, EmptyState, LedgerNote, WalletChip
      layout/               TopNav, MobileHeader, TabBar, AppShell
      illustrations/        one component per Illo/* in the design file, inline SVG
    modules/
      onboarding/           Onboarding.tsx, components/, hooks/
      advance/              Advance.tsx, components/, hooks/
      repayment/            Repayment.tsx, components/, hooks/
      history/              History.tsx, components/
    lib/
      stellar/
        wallet.ts           connect, sign, disconnect (ported from Sorosense, see §5)
        trustline.ts        does this account hold a USDC trustline, add one
        contract.ts         quote, request_advance, repay, advance, liquidity
        network.ts          network passphrase, RPC URL, contract and USDC addresses
      api/
        client.ts           typed calls to the #16 API
        types.ts
      reclaim/              starting the Reclaim session, handing the proof to the #17 relay
      errors.ts             contract and wallet errors → title, sentence, next action
      format.ts             USDC amounts with faded decimals, dates without clock times
      cn.ts                 clsx + tailwind-merge
    providers/
      WalletProvider.tsx    the only React context in the app
      QueryProvider.tsx
  tests/
    e2e/                    Playwright, also captures the #22 evidence screenshots
```

How the design file maps onto it:

| Design file | Code |
| --- | --- |
| 04 Base components | `src/components/ui` |
| 05 Product components | `src/components/elements` and `src/components/layout` |
| Spot illustrations `Illo/*` | `src/components/illustrations` |
| 01 Onboarding, 02 Prove and accept, 03 Repayment | `src/modules/onboarding`, `advance`, `repayment` and `history` |
| States and interactions boards | the states each module must render, one by one |
| Copy rules and the term translation table (brief §3) | `src/lib/errors.ts` and the copy in modules |

`tsconfig.json` changes `"@/*": ["./*"]` to `"@/*": ["./src/*"]` when the code moves into `src/`.

## 3. Libraries

| Need | Library | Why |
| --- | --- | --- |
| Framework | `next` 16, `react` 19, Tailwind 4 | Already in the scaffold |
| Wallets | `@creit.tech/stellar-wallets-kit`, `@walletconnect/universal-provider`, `@reown/appkit` | Same set as Sorosense, where desktop and mobile both work |
| Stellar | `@stellar/stellar-sdk` | Contract calls, trustline check, transactions |
| Server state | `@tanstack/react-query` | Loading, error, retry and refetch after a repayment, without hand written state. This is what keeps principle 1 cheap. |
| Dialog, sheet, menu | `@base-ui/react` | Headless and accessible, styled only with our tokens |
| Toast | `sonner` | Small, themeable |
| Utilities | `clsx`, `tailwind-merge`, `class-variance-authority` | Button and chip variants, class merging |
| Small glyphs | `lucide-react` | Chevron, copy, close, arrow. Big moments use the spot illustrations, never library icons. |
| Tests | `vitest`, `@testing-library/react`, `@playwright/test` | Unit and component tests, and end to end runs that also take the #22 screenshots |

Deliberately left out:

- **Zustand or Redux.** Server state is React Query, wallet state is one context, the rest is
  local `useState`.
- **Full shadcn.** The component set is small and already designed.
- **Animation libraries.** CSS transitions cover what the design needs (§7).
- **vaul.** Mobile sheets start as a Base UI dialog styled as a sheet. Add vaul only if swipe to
  dismiss turns out to matter, after checking it is still maintained.
- **A Reclaim browser SDK.** The #17 relay makes the proof with zkFetch; the browser only signs in
  with Google Identity Services, loaded as Google's script, not a package (`lib/reclaim/relay.ts`).

## 4. State

| State | Where |
| --- | --- |
| Wallet address, wallet id, connected, network | `WalletProvider` (React context) |
| Anything read from the API or the contract | React Query |
| What the creator is typing, which step of 2a to 2d is on screen | `useState` in the module |

Query keys are arrays that start with the resource and include the address, so a wallet switch
can never show another wallet's numbers: `['repayment', address]`, `['advance', nullifier]`,
`['liquidity']`. After a repayment or an advance lands, invalidate the affected keys instead of
editing the cache by hand.

## 5. Wallet

Port `frontend/lib/wallet*.ts` from Sorosense instead of writing it again:

- one **Connect wallet** button. On desktop it opens the Stellar Wallets Kit picker
  (`StellarWalletsKit.authModal()`), library UI that we only theme. On mobile it opens
  WalletConnect through Reown AppKit. No wallet list rendered by us.
- `wallet-error.ts`: treat "user closed the picker" as a non event, not an error.
- `wallet-e2e.ts`: a test wallet behind `NEXT_PUBLIC_E2E=1`, so Playwright can run the flow
  without a browser extension.

Network is testnet only. A wallet on another network gets the "Switch your wallet to testnet"
state, never a silent failure.

**USDC trustline (#19).** Check it right after connecting, before the creator proves anything,
and offer "Allow USDC" when it is missing. The balance helper throws when there is no trustline:
match that one error narrowly as "no trustline", and let every other error throw, so a slow node is
never read as "this wallet holds nothing".

## 6. Calling the contract and the API

`src/lib/stellar/contract.ts` wraps the calls the app makes, with addresses from `network.ts`
(which must match `docs/deployments.md`):

| Call | Used by | Notes |
| --- | --- | --- |
| `quote(revenue_usd)` | 2b offer | The derivation on screen is the contract's own number |
| `request_advance(...)` | 2c sign | Signed by the borrower, arguments from the relay (#17) |
| `repay(from, nullifier, amount)` | 3a | `amount` above the outstanding balance is refused (51), so the form caps it first |
| `advance(nullifier)`, `liquidity()` | 3a, 2b | Prefer the API (#16) for reads, fall back to these only if the API lacks a field |

Amounts are `i128` stroops on chain, 7 decimals for USDC. Convert only in `format.ts`, never
inline.

`src/lib/errors.ts` maps every code from `docs/interface.md` §7 to the copy in the brief, for
example `20 NullifierSpent` → "This proof was already used", `12 ProofStale` → "This proof
expired", `41 NoTrustline` → "Your wallet needs to accept USDC first", `40 InsufficientLiquidity`
→ "Advances are paused right now". Wallet rejections and timeouts get entries too.

## 7. Loading and motion

- **First load:** a skeleton with the same shape as the content, shown only if loading passes
  about 200 ms, so fast responses do not flash. Skeleton to content is an opacity fade of 150 to
  200 ms.
- **Refetch** (after a repayment, back to a tab): keep the old numbers on screen
  (`placeholderData: keepPreviousData`) and replace them in place. No skeleton, no page fade.
  A changed figure may get a short highlight.
- **Between tabs:** no transition. Navigation should feel instant.
- **Spinners** only inside buttons and sheets ("Connecting", "Approve in Freighter").
- **`prefers-reduced-motion`:** all fades off.

## 8. Testing and evidence

- `vitest` for `format.ts`, `errors.ts`, query hooks, and components with tricky states.
- Playwright with the e2e wallet for each flow on desktop and mobile viewports. The same run
  saves the screenshots #22 needs in `docs/evidence/`.
- CI already runs `pnpm lint`, `typecheck`, `test` and `build` for every package in the workspace,
  so new scripts in `fe/package.json` are picked up without touching CI.

## 9. Follow the contract, not an extra rule

The front end adds no lending rules of its own. In particular there is **no "repay first"
rule**: the contract allows one advance per revenue period (the nullifier), not one open advance
per creator. A second attempt in the same period fails with `20 NullifierSpent` and shows "This
proof was already used". The claim template pins one period at a time, so in practice a creator
holds one advance, and the Repayment screen is built for one while tolerating a list.

## 10. Open questions

1. **Which nullifier to repay.** `repay` takes the advance's nullifier. The #16 API needs to return
   it with the creator's advances.
2. **Reclaim in the browser.** Popup, QR or redirect, and which SDK, depends on #17.
