# Forepay

**The first zkTLS revenue-backed lending pipeline on Stellar.**

Forepay lets a content creator prove their ad revenue privately and turn that proof into a stablecoin advance on Stellar, without sharing account credentials and without posting collateral.

> Status: early development. This repository currently holds the project scaffold. The scope below is a 30-day technical demonstration on **Stellar testnet**, funded through Stellar Instawards (Ambassador Chapter Indonesia). It is not a lending product and uses no real funds.

---

## The problem

Content creators earn real, recurring platform revenue (for example Google AdSense payouts), but they cannot borrow against that income on-chain without either:

- handing over their account credentials so a lender can check their earnings, or
- posting collateral they usually do not have.

Existing lending on Stellar points elsewhere: cash-flow and receivables lenders underwrite business invoices, not individual creators, and the largest money market is over-collateralized.

## The idea

Reclaim's zkTLS verifier is already live on Stellar. Forepay wires a **privately proven revenue figure** into a **lending flow**:

1. **Prove**: the creator proves their trailing AdSense revenue with Reclaim zkTLS. Credentials are redacted; an attestor signs the extracted figure.
2. **Verify**: a Soroban contract checks the proof on-chain through Reclaim's deployed `verify_proof` integration.
3. **Size**: the contract computes an advance with a deterministic rule, a capped multiple of the proven revenue.
4. **Disburse**: the contract sends USDC (as a Stellar Asset Contract token) to the creator's address.
5. **Track**: a repayment ledger records what was advanced and what has been repaid.

### Safety checks

| Check | Prevents |
| --- | --- |
| Proof verification (attestor signature) | Forged or tampered proofs |
| Nullifier registry | Reusing one proof for multiple advances (replay) |
| Proof-to-address binding | Someone else using a creator's proof |
| Freshness check | Stale proofs with outdated revenue |

## Repository layout

```
forepay/
├── sc/             # Soroban smart contracts (Rust): advance contract
├── be/             # Reclaim AdSense provider and proof relay
├── fe/             # Creator app (Next.js): connect wallet, prove revenue, accept advance, view repayment
└── landing-page/   # Project landing page (Next.js)
```

## 30-day scope

| Week | Focus | Expected output |
| --- | --- | --- |
| 1 | Reclaim `verify_proof` on testnet, first AdSense provider, repo and CI | One real AdSense revenue proof verified on testnet; reviewed design |
| 2 | Advance contract: verification, nullifier, sizing, USDC disbursement, repayment ledger | A valid proof sizes and disburses a USDC advance on testnet; passing tests |
| 3 | Proof relay, proof-to-address binding, creator front end | A creator completes the full flow through the front end on testnet |
| 4 | End-to-end demo and negative cases, hardening, docs | Full pipeline plus invalid, replayed and stale proofs rejected on testnet; demo video |

### Deliverables

- [ ] **Advance contract** on Soroban, with unit and integration tests, deployed to testnet
- [ ] **Reclaim AdSense provider, relay and creator front end** (Stellar Wallets Kit)
- [ ] **End-to-end demo** with testnet transaction hashes, including rejection of invalid, replayed and stale proofs

### Out of scope for this phase

Real credit underwriting and default recovery, licensing and KYC, mainnet funds, Blend integration, revenue sources beyond AdSense (YouTube, Twitch, Spotify), and third-party audits. These are planned for later phases.

## Tech stack

- **Stellar** testnet, **Soroban** smart contracts (Rust)
- **Reclaim Protocol** zkTLS: Soroban verifier and zkFetch
- **USDC** via Stellar Asset Contract
- **Next.js**, TypeScript, Tailwind CSS, Stellar Wallets Kit

## Getting started

Each package lives in its own folder. Setup instructions will be added per package as development progresses.

```bash
# creator app
cd fe
pnpm install
pnpm dev
```

## Links

- Reclaim zkFetch on Stellar: https://docs.reclaimprotocol.org/zkfetch/stellar
- Stellar developer docs: https://developers.stellar.org
