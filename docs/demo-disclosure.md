# The demo's one simulated link

**For:** the demo video ([#28](https://github.com/forepay-stellar/forepay/issues/28)) and anyone
reviewing it. **Why it exists:** [#77](https://github.com/forepay-stellar/forepay/issues/77), option 3.
No AdSense account available to us earned anything in the window being proven, so the demo runs the
success path on the rehearsal contract, where claims are signed by a test witness. This page says
that once, plainly, and lists the evidence for every other link.

> **Rule for the video: say it in the first thirty seconds, on screen and out loud.** A reviewer who
> finds the test witness on their own has to wonder what else they were not told. A reviewer who is
> told at the start spends the rest of the demo looking at what works.

## What to say

### Opening card, on screen for about ten seconds

> **One link in this demo is simulated.**
> The revenue claims are signed by a **test witness** whose key is published in our repository,
> not by Reclaim's production attestor. We have no AdSense account with revenue to prove.
>
> **Everything else is live on Stellar testnet:** the contract, the sizing, the USDC payout, the
> nullifier, the repayments and all three rejections.

### Voice-over, about 25 seconds

> "Before we start, one thing in this demo is simulated, and we want you to know which one.
> Forepay proves AdSense revenue with a Reclaim attestor's signature. The only AdSense account we
> have access to has never earned anything, so it has nothing to prove. The claims you will see are
> signed by a test key we published ourselves, on a second copy of the same contract.
> Everything after that signature is real: the contract checks it, sizes the advance, pays USDC on
> testnet, records the nullifier, and refuses an invalid, a replayed and a stale proof.
> And the attestor half is proven too: a real signature from Reclaim's production attestor was
> accepted by Reclaim's own verifier on testnet, and the same message with one byte changed was
> refused."

### Closing line, over the last shot

> "A real AdSense proof replaces exactly one step: the signature. The relay that makes one is live
> today."

## What is simulated, and what is not

| Link in the chain | In the demo | Evidence |
| --- | --- | --- |
| **The attestor signs a real AdSense response** | **Simulated.** Signed by the test witness in [`tools/secp256k1_probe.py`](../tools/secp256k1_probe.py) | [#77](https://github.com/forepay-stellar/forepay/issues/77): the only account is `READY` with no rows at all, 2023-12 → 2026-10 |
| Reclaim's production attestor signs a zkFetch claim | Real, shown separately | `prove:smoke` on the relay host: a claim in **54 s**, signer `0x244897572368eadf65bfbc5aec98d8e5443a9072` ([record](deployments.md), section "#16 / #17, the API and the proof relay") |
| Reclaim's verifier accepts that signature, and refuses it with one byte changed | Real | [`13bdff8b…`](https://stellar.expert/explorer/testnet/tx/13bdff8b4378fd5bdcd6d571c715f1c680a569a5284da2730d3764df9b8b958d) on Reclaim's own verifier `CA3EMXR6…H54DU5`; one byte flipped → `#5 SignatureMismatch` ([record](deployments.md#live-run-a-fresh-proof-of-a-public-endpoint-not-gate-evidence)) |
| The contract rebuilds the signed bytes and verifies them | Real | Same wasm on both contracts. The rehearsal contract [`CD25Q4TD…HQN4`](https://stellar.expert/explorer/testnet/contract/CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4) only points at a verifier that knows the test witness ([why](evidence.md#why-there-are-two-contracts)) |
| Sizing: 25% of proven revenue, 1–100 USDC | Real | `sizing()` on the contract |
| USDC paid to the borrower | Real | [`3f824388…`](https://stellar.expert/explorer/testnet/tx/3f8243883c9909de1d35e85d666774faaaf4eb781dda4d88d321792088e8669d), run [`2026-10-25T114611Z`](../tools/runs/2026-10-25T114611Z/EVIDENCE.md) |
| Nullifier written, repayment recorded | Real | Same run: [`23b698c4…`](https://stellar.expert/explorer/testnet/tx/23b698c49470d27a120cac34ace60b53394775ae0597cf502be25cf5ba5aa711), [`b8ab84b1…`](https://stellar.expert/explorer/testnet/tx/b8ab84b12a23cfe0af19ac6106db564eeacc1f0e68616d0715382ce22ea1c151) |
| Invalid, replayed and stale proofs refused | Real | Same run: `#14`, `#20`, `#12`. No transaction, because a refusal never reaches the ledger ([why](evidence.md#the-three-negative-cases-each-correctly-rejected)) |
| The borrower is bound into the claim | Real | Same run, B.1: another borrower's proof is refused with `#14` |
| The relay takes a Google sign-in and proves AdSense | Real code, live, **with no revenue to prove** | <https://api-forepay.jameshub.fun/health>. A sign-in reaches `POST /proofs`, and the relay stops at its live check because Google sends no `totals` |

## Rules for whoever cuts the video

1. **Show the contract address whenever money moves.** Every payout and repayment on screen is on
   the rehearsal contract `CD25Q4TD…HQN4`. The production contract
   [`CCQFL2Q6…I2HS`](https://stellar.expert/explorer/testnet/contract/CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS)
   has never paid an advance, and nothing in the video may suggest that it has.
2. **Never call the test witness "Reclaim"** or show its claims next to Reclaim's name without the
   word *test*.
3. **Use the real hashes.** Every transaction on screen comes from a committed run under
   [`tools/runs/`](../tools/runs/), recorded live. Nothing is staged (#28's rule).
4. **The browser flow ends at "prove revenue".** `app.forepay.xyz` points at the production contract,
   whose verifier only accepts the production attestor. Show the sign-in and the relay, then cut to
   the run for the ledger steps. Do not show a mocked payout in the browser.

## If a real account turns up

Only the first row changes. The owner signs in on `app.forepay.xyz`, the relay proves it, and
`request_advance` on the production contract replaces the rehearsal payout. The opening card and the
voice-over are dropped, and this page becomes the record of why they existed. #77 stays open until
submission for exactly this.
