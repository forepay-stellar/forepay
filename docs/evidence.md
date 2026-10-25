# Evidence pack — Forepay Instawards

**For the Ambassador Chapter Lead.** This page answers SOW §6.2 row by row. Every claim below is a
link you can click. You should not have to read any code to tick a box.

> **Network: Stellar testnet only.** No real funds are involved anywhere in this project. That is
> the scope the SOW set (§4.1), not a shortcut.

**Repository:** <https://github.com/forepay-stellar/forepay> · **Licence:**
[AGPL-3.0-only](../LICENSE), and [why it had to be](licensing.md)

---

## How to check this pack in five minutes

1. Open the contract on StellarExpert: [`CCQFL2Q6…I2HS`](https://stellar.expert/explorer/testnet/contract/CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS).
   Look for the green **verified** badge and the link back to this repository's source.
2. Open any transaction link in the tables below. Each one shows a real testnet ledger entry.
3. Read the **“What this does not show”** box at the bottom of each row. If a row claims less than
   you expected, that box says why, in plain terms.

If any link on this page is dead, that is our mistake and worth telling us about —
`python3 tools/check_links.py` is supposed to catch exactly that before submission.

---

## Deliverable 1 — the advance contract

> SOW §6.1: *“A verified proof sizing and disbursing a USDC advance on testnet, with the nullifier
> recorded, all with linked transactions.”*

### The contract

| What | Where |
| --- | --- |
| **Advance contract, testnet** | [`CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS`](https://stellar.expert/explorer/testnet/contract/CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS) |
| **Source-verified** | Yes — StellarExpert matches the deployed wasm to a commit in this repository. The badge is on the page above. |
| **Rehearsal contract** | [`CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4`](https://stellar.expert/explorer/testnet/contract/CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4) — same code, a test witness, so the full flow can be exercised end to end ([why](#why-there-are-two-contracts)) |
| **Reclaim's verifier** (not ours) | [`CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5`](https://stellar.expert/explorer/testnet/contract/CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5) |
| **USDC** | [`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) — Circle's own testnet USDC, not an asset we issued |

### A proof sized and disbursed an advance, on the ledger

From the rehearsal of **2026-10-17** ([full record](../tools/runs/2026-10-17T183309Z/EVIDENCE.md)):

| Step | What happened | Transaction |
| --- | --- | --- |
| Advance | A proof was verified, the nullifier written, and **1 USDC paid to the borrower** | [`1e066220909d…`](https://stellar.expert/explorer/testnet/tx/1e066220909da8dfdfc92d1926a377a4dc2a08b12adaca2c88cef8f394a60f25) |
| Repayment, part | 0.25 USDC repaid; 0.75 outstanding | [`7db87bbfba3f…`](https://stellar.expert/explorer/testnet/tx/7db87bbfba3fd8f8956a25041a4ae13077504f5c86a29c298c527ecb4cebf8fa) |
| Repayment, rest | 0.75 USDC repaid; **nothing outstanding** | [`886194f0c74f…`](https://stellar.expert/explorer/testnet/tx/886194f0c74f16719dd096f2b3cda8f6c78af265392a473b5d55aea0d951ed66) |

The advance transaction carries an `AdvanceDisbursed` event and the USDC balance change. The amount
is not a figure we typed in: it is 25% of the proven revenue, computed by the contract, capped at
100 USDC and floored at 1 USDC. The contract will tell you those numbers itself — call `sizing()`.

### The nullifier is recorded, and it is what stops a second advance

A nullifier is the fingerprint of *one publisher account over one reporting period*. Writing it is
what makes the same revenue unborrowable twice.

- The advance above is readable from the contract by its nullifier, with the window it covers:
  `advance(d0cd01df…c839)` returns the borrower, the window `2026-07-01 → 2026-09-30`, the principal
  and what has been repaid.
- `is_spent(d0cd01df…c839)` answers `true`.
- Submitting the same publisher and window again is refused — see Deliverable 3, case N.2.

### It is upgradeable, behind a delay, and the delay is real

| | |
| --- | --- |
| Upgrade path | propose → **24-hour timelock** → execute, with cancel in between and a one-way renounce |
| Exercised | [`443a902a9db5…`](https://stellar.expert/explorer/testnet/tx/443a902a9db5b10c67a001e385690fe62c2efbe7c60e5b48e6d05ab309b7ef69) — a real upgrade, 24 hours after it was proposed |
| Auditable by anyone | `pending_upgrade()` returns the proposal and its deadline. That is the whole point of the delay. |
| State survived it | The pinned template, the spent nullifier, the advance record, the balance and the admin all read back identical afterwards. [Recorded](deployments.md). |

### Funded

105 USDC, so the contract can pay one advance at the full 100 USDC cap. Call `liquidity()` on the
contract, or read the [five funding transactions](deployments.md).

> #### What Deliverable 1 does not show
>
> **No advance has yet been made against a real Google AdSense proof.** Every advance above was
> made against a proof signed by a **test witness** whose key is published in this repository — on
> purpose, so the flow can be exercised without a live AdSense account.
>
> What *is* proven with Reclaim's real production attestor is the cryptography: a genuine attestor
> signature was accepted, and the same digest with one byte changed was rejected, by
> **Reclaim's own deployed contract**, not ours ([record](deployments.md)).
>
> The missing piece is one AdSense account with revenue in the window being proven. The only
> account available to us is approved and in good standing — and has **never earned a cent**. Read
> over its whole history, 2023-12 to 2026-10, Google answers `200` with headers and **no rows at
> all**: no page views, no clicks, no earnings. An approved account that never served an ad has
> nothing to prove.
>
> That is [#77](https://github.com/forepay-stellar/forepay/issues/77), and it is the one item on
> this project that cannot be solved by writing code. A *new* account cannot solve it either: the
> window proven is the last three complete calendar months, which is always in the past, so an
> account created today earned nothing in it no matter how fast Google approves it.

---

## Deliverable 2 — the creator front end

> SOW §6.1: *“The creator front end completing the flow against testnet: connect, prove revenue,
> view and accept the advance, view repayment.”*

| What | Status |
| --- | --- |
| Connect a wallet, check the USDC trustline | **Merged** — [#56](https://github.com/forepay-stellar/forepay/pull/56) |
| Prove revenue, see the offer with its derivation, accept | **Merged** — [#57](https://github.com/forepay-stellar/forepay/pull/57) |
| Repayment and history, read from the ledger | **Merged** — [#58](https://github.com/forepay-stellar/forepay/pull/58) |
| Backend the screens read from | **Merged and live** — <https://api-forepay.jameshub.fun/health> ([API reference](api.md)) |
| **Live demo link** | ⏳ [#22](https://github.com/forepay-stellar/forepay/issues/22) |
| **Screenshots** | ⏳ [#22](https://github.com/forepay-stellar/forepay/issues/22) |

The offer screen does not hard-code the 25% rate or the 100 USDC cap. It reads them from the
contract, so the derivation shown next to the figure is the arithmetic that produced it.

> #### What Deliverable 2 does not show yet
>
> **This row is not ready to tick.** The screens are written, reviewed and merged, and the API they
> read is live — but there is no deployed URL to click and no screenshots yet. Until
> [#22](https://github.com/forepay-stellar/forepay/issues/22) lands, this row is honestly **Partial**.
>
> It also cannot complete end to end in a browser until Deliverable 1's missing piece arrives: the
> flow stops at “prove revenue” without a real AdSense account.

---

## Deliverable 3 — the pipeline and the three negative cases

> SOW §6.1: *“The full pipeline on video plus the three negative cases (invalid, replayed, stale
> proof) each correctly rejected.”*

### The three negative cases, each correctly rejected

Run of **2026-10-17**, [full record](../tools/runs/2026-10-17T183309Z/EVIDENCE.md). Seven of seven green.

| Case | What was submitted | Result |
| --- | --- | --- |
| **Invalid proof** | A structurally valid signature from a key that is **not** a registered witness | Refused, `#14 VerifierRejected` |
| **Replayed proof** | The publisher and window from an advance that had already been funded | Refused, `#20 NullifierSpent` |
| **Stale proof** | A proof two hours old, against a one-hour freshness window | Refused, `#12 ProofStale` |
| *(extra)* **Someone else's proof** | Another borrower's proof, submitted as our own | Refused, `#14 VerifierRejected` |

`#14` means **Reclaim's own deployed contract** refused the signature, not that ours did. That is
worth knowing for the last row: the contract does not "notice" the wrong borrower and object. It
rebuilds the exact bytes an attestor would have signed *for the borrower named in the call*, gets
different bytes, and the real signature does not match them — so Reclaim's verifier rejects it. The
binding is enforced by cryptography, with our contract as the thing that cannot look away from it.

A fifth case is enforced before any of this, and needs no proof at all: since
[#81](https://github.com/forepay-stellar/forepay/issues/81), taking an advance requires the
**borrower's own signature**, so a stranger cannot submit a proof on someone's behalf even if the
proof is genuine.

> ### ⚠️ Why these four rows have **no transaction links**, and why that is the right answer
>
> The SOW asks for transaction hashes here. **There are none, and there cannot be.**
>
> Every one of these four was refused **before it reached a ledger**. Soroban simulates a call
> before submitting it, the contract refuses it there, and nothing is ever written. So a correctly
> rejected proof leaves no transaction behind — the absence of a hash *is* the evidence.
>
> This matters beyond bookkeeping. If a replayed proof produced a transaction, it would mean the
> contract had started to act on it and then undone it. The balance is the proof: after each
> refusal the borrower's USDC and the contract's liquidity are unchanged, which is recorded in the
> run above alongside each case.
>
> Please read this row as **Present**. If it is clearer to see one, the *successful* advance in
> Deliverable 1 is the same code path, and it does have a hash.

### How to re-run all of it yourself

```bash
python3 tools/rehearsal.py
```

One command. It prints each step as it happens, writes a dated folder under `tools/runs/` with a
transaction hash for everything that touched the ledger, and ends with a seven-row verdict. It is
designed to record **what happened**, not what was hoped — a step that fails is written down as
failed.

Six runs are committed, the earliest from 2026-10-15, so the result is reproducible rather than a
single lucky afternoon.

### Repayment

Covered in Deliverable 1: a partial repayment, then the remainder, with nothing outstanding at the
end. The contract's own record is the source for both figures, never a total added up from history.

| What | Status |
| --- | --- |
| Testnet transaction hashes | ✅ above |
| Three negative cases rejected | ✅ above |
| **Demo video, 3 minutes or less** | ⏳ [#28](https://github.com/forepay-stellar/forepay/issues/28) |

> #### What Deliverable 3 does not show yet
>
> **The video is not made.** Everything it needs to show exists and is reproducible by one command,
> but until [#28](https://github.com/forepay-stellar/forepay/issues/28) lands this row is
> **Partial**, not Present.

---

## Why there are two contracts

The production contract points at **Reclaim's own verifier**, which only accepts signatures from
Reclaim's production attestor. We do not have that attestor's private key — nobody outside Reclaim
does — so the success path cannot be demonstrated against it without a real AdSense proof.

So there is a second deployment of the **same code** pointing at a verifier whose witness key is
published in this repository. That is where the rehearsal runs. It means the full flow —
verification, sizing, disbursement, the nullifier, repayment, and all three refusals — is exercised
on a real ledger with real USDC movement.

> **The rehearsal verifier accepts forged proofs, on purpose.** Its key is in
> `tools/secp256k1_probe.py`. Anyone who reads this repository can sign something it will accept.
> That is what makes it a test harness and what would make it dangerous if mistaken for a real
> dependency. The production contract has never pointed at it, and
> [`docs/deployments.md`](deployments.md) carries the same warning next to the address.

Being explicit about this is the point. A demo that quietly used a test key and let a reviewer
assume otherwise would be worth less than one that says which single link in the chain is
simulated.

---

## Honest status, in one table

| | |
| --- | --- |
| **Deliverable 1** | **Present**, with one stated gap: no advance against a real AdSense proof yet (#77) |
| **Deliverable 2** | **Partial** — screens merged and the API live, no deployed URL or screenshots yet (#22) |
| **Deliverable 3** | **Partial** — transaction evidence and all three negative cases done; video outstanding (#28) |

We would rather hand you this table than have you discover it. The two Partials are both work that
exists and is not yet published; the gap in Deliverable 1 is an external dependency on a Google
account, and [#77](https://github.com/forepay-stellar/forepay/issues/77) explains what would close
it and what the alternative is if it does not arrive.

## Everything else, if you want to go deeper

| Document | What it holds |
| --- | --- |
| [`deployments.md`](deployments.md) | Every address and transaction hash, with how each was checked — including the mistakes found on the way |
| [`interface.md`](interface.md) | The frozen interface: the digest chain, the nullifier, the sizing numbers, the error codes |
| [`api.md`](api.md) | The backend and the proof relay |
| [`adsense-provider.md`](adsense-provider.md) | How a revenue claim is produced, and what stays private |
| [`licensing.md`](licensing.md) | Why this repository is AGPL-3.0 and why that was not a free choice |
