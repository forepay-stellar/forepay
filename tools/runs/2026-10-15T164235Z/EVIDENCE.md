# Forepay rehearsal — evidence

Run `2026-10-15T164235Z` against **testnet**, contract [`CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4`](https://stellar.expert/explorer/testnet/contract/CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4).

## Result: 4 / 7 GREEN

| Step | What | Status | Summary |
| --- | --- | --- | --- |
| P.1 | Preflight: the contract is live, verified, funded, and in a known state | **GREEN** | the contract answers and its state is on the record |
| H.1 | A creator proves revenue and receives USDC | **RED** | a genuine proof was refused (#14) |
| H.2 | Partial repayment, then full | **BLOCKED** | H.1 produced no advance to repay |
| N.1 | An invalid proof is rejected (#24) | **GREEN** | refused with #14, and the refusal never reached the ledger |
| N.2 | A replayed proof is rejected (#25) | **BLOCKED** | H.1 did not produce an advance to replay |
| N.3 | A stale proof is rejected (#26) | **GREEN** | refused with #12, and the refusal never reached the ledger |
| B.1 | A proof bound to one borrower cannot be spent by another (#18) | **GREEN** | refused with #14, and the refusal never reached the ledger |

> **What these claims do not cover.** The proofs here are signed by the probe
> witness, not Reclaim's production attestor — only the attestor can sign a real
> AdSense response, and that is what #5 is blocked on. The digest construction was
> proven against a real attestor signature in #3 and accepted by Reclaim's own
> deployed contract, so what this run demonstrates is the contract's logic rather
> than the cryptography.

## Every action, in the order it happened

| Step | Action | Outcome | Transaction | Detail |
| --- | --- | --- | --- | --- |
| P.1 | read is_upgradeable | ok |  | true |
| P.1 | read claim_template | ok |  | ["7b226d6574686f64223a22474554222c2275726c223a2268747470733a2f2f616473656e73652e676f6f676c65617069732e636f6d2f76322f6163636f756e74732f","2f7265706f727 |
| P.1 | read liquidity | ok |  | "20000000" |
| P.1 | contract under test | info |  | CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4 (https://stellar.expert/explorer/testnet/contract/CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322 |
| P.1 | verified production contract | info |  | CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS — not this one; its verifier is Reclaim's and cannot be signed for here |
| H.1 | borrower USDC before | ok |  | 0 stroops |
| H.1 | request_advance | fail |  | #14 |
| N.1 | proof signed by a key that is not a witness | ok |  | refused with #14, expected #14 |
| N.3 | a proof two hours old against a one hour window | ok |  | refused with #12, expected #12 |
| B.1 | a proof bound to one borrower, submitted for another | ok |  | refused with #14, expected #14 |
