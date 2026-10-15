# Forepay rehearsal — evidence

Run `2026-10-15T164019Z` against **testnet**, contract [`CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID`](https://stellar.expert/explorer/testnet/contract/CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID).

## Result: 5 / 7 GREEN

| Step | What | Status | Summary |
| --- | --- | --- | --- |
| P.1 | Preflight: the contract is live, verified, funded, and in a known state | **RED** | a preflight read failed; later steps are unreliable |
| H.1 | A creator proves revenue and receives USDC | **GREEN** | a genuine proof was accepted and recorded (2b0400569f8b…) |
| H.2 | Partial repayment, then full | **NOT RUN** | no disbursement on this deployment to repay |
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
| P.1 | read liquidity | fail |  | (no answer) |
| P.1 | contract under test | info |  | CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID (https://stellar.expert/explorer/testnet/contract/CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7Q |
| P.1 | verified production contract | info |  | CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS — not this one; its verifier is Reclaim's and cannot be signed for here |
| H.1 | borrower USDC before | fail |  | ? |
| H.1 | verify_and_reserve | ok | [`2b0400569f8b…`](https://stellar.expert/explorer/testnet/tx/2b0400569f8bea47ee6522b92640b8f96a600dfef4210670161903030c7358a2) | 📅 CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID - Success - Event: NullifierSpent (nullifier_spent), borrower |
| H.2 | repayment | info |  | verify_and_reserve reserves without paying; request_advance on a funded contract is what #27 captures for the repayment cycle |
| N.1 | proof signed by a key that is not a witness | ok |  | refused with #14, expected #14 |
| N.2 | the publisher and window already used in H.1 | ok |  | refused with #20, expected #20 |
| N.3 | a proof two hours old against a one hour window | ok |  | refused with #12, expected #12 |
| B.1 | a proof bound to one borrower, submitted for another | ok |  | refused with #14, expected #14 |
