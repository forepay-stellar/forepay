# Forepay rehearsal — evidence

Run `2026-10-15T164353Z` against **testnet**, contract [`CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4`](https://stellar.expert/explorer/testnet/contract/CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4).

## Result: 7 / 7 GREEN

| Step | What | Status | Summary |
| --- | --- | --- | --- |
| P.1 | Preflight: the contract is live, verified, funded, and in a known state | **GREEN** | the contract answers and its state is on the record |
| H.1 | A creator proves revenue and receives USDC | **GREEN** | 10000000 stroops reached the borrower (0f14ff628b2d…) |
| H.2 | Partial repayment, then full | **GREEN** | advanced, partly repaid, then fully repaid; nothing outstanding |
| N.1 | An invalid proof is rejected (#24) | **GREEN** | refused with #14, and the refusal never reached the ledger |
| N.2 | A replayed proof is rejected (#25) | **GREEN** | refused with #20, and the refusal never reached the ledger |
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
| P.1 | read liquidity | ok |  | 20000000 |
| P.1 | contract under test | info |  | CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4 (https://stellar.expert/explorer/testnet/contract/CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322 |
| P.1 | verified production contract | info |  | CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS — not this one; its verifier is Reclaim's and cannot be signed for here |
| H.1 | borrower USDC before | ok |  | 0 stroops |
| H.1 | request_advance | ok | [`0f14ff628b2d…`](https://stellar.expert/explorer/testnet/tx/0f14ff628b2d0fe5c088161caf8c824c4a002852db346ae58683b4030a369b66) | 📅 CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4 - Success - Event: AdvanceDisbursed (advance_disbursed), borr |
| H.1 | borrower USDC after | ok |  | 10000000 stroops |
| H.1 | USDC actually moved | ok |  | 0 -> 10000000 stroops (delta 10000000) |
| H.2 | advance on record | ok |  | principal 10000000 stroops |
| H.2 | repay 2500000 stroops | ok | [`f8068c2208f8…`](https://stellar.expert/explorer/testnet/tx/f8068c2208f8c54c4b030ff956c312100ec2c930b8c2eb94511460b1cb7e7366) | outstanding 7500000 |
| H.2 | repay the remaining 7500000 | ok | [`5107662eeafe…`](https://stellar.expert/explorer/testnet/tx/5107662eeafe2a9c137465c66b2abbff8bb015c57fe28f76923364010c35b31d) | outstanding 0 |
| N.1 | proof signed by a key that is not a witness | ok |  | refused with #14, expected #14 |
| N.2 | the publisher and window already used in H.1 | ok |  | refused with #20, expected #20 |
| N.3 | a proof two hours old against a one hour window | ok |  | refused with #12, expected #12 |
| B.1 | a proof bound to one borrower, submitted for another | ok |  | refused with #14, expected #14 |
