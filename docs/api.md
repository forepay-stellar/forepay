# Forepay API (#16)

What the front end reads. Run it with `pnpm -C be start` (port 8787 by default). Configuration is in
`be/.env.example`.

Every route is `GET` and returns JSON.

- **Amounts** are stroops: USDC has 7 decimals, so `10000000` = 1 USDC.
- **Times** are seconds since the epoch.
- Both are sent as **decimal strings**. JSON numbers lose precision past 2^53, and an `i128` can exceed
  that.

| Route | Answers |
| --- | --- |
| `/health` | `{"status":"ok"}`. The process is up. |
| `/ready` | `200` when the Stellar RPC answers, `503` when it does not. |
| `/config` | The network, RPC, Horizon and contract addresses in use, where each came from, and whether they match `docs/deployments.md`. |
| `/advances?borrower=G…` | Every advance the wallet took, newest first. |
| `/transactions?borrower=G…` | Advances, repayments and the USDC trustline, newest first. Failed transactions are included. |

## Errors

| Status | Body | When |
| --- | --- | --- |
| `400` | `{"error":"borrower must be a Stellar account address (G…)"}` | `borrower` is missing, or is not a `G…` address |
| `502` | `{"error":"the chain could not be read; try again"}` | Horizon or the RPC failed. Safe to retry. |
| `503` | `{"error":"no advance contract is configured"}` | Deployment misconfiguration |

## `/advances`

```json
[{
  "nullifier": "1d1248…68f5",
  "borrower": "GA2C…WWH2",
  "windowStart": "2026-07-01",
  "windowEnd": "2026-09-30",
  "revenueCents": "400",
  "principal": "10000000",
  "repaid": "10000000",
  "openedAt": "1792262007",
  "txHash": "1e0662…0f25"
}]
```

- Every figure comes from the **contract's own record**, read with `advance(nullifier)`. The API does not
  rebuild it from history, so the balance shown is always the balance the contract holds.
- `nullifier` is what `repay(from, nullifier, amount)` takes. It is
  `sha256(len ‖ pub_id ‖ len ‖ window_start ‖ len ‖ window_end)`, where each length is a 4-byte big-endian
  u32. That is the same derivation as the contract's `nullifier_for`.
- `txHash` is the disbursement transaction.
- Outstanding is `principal − repaid`.

## `/transactions`

```json
[{ "hash": "8861…ed66", "kind": "repayment", "amount": "7500000", "at": "1792262032",
   "status": "completed", "nullifier": "1d1248…68f5" }]
```

`kind` is one of the following:

- `advance`: `amount` is the USDC received.
- `repayment`: `amount` is the USDC the repayment asked to send.
- `trustline`: the wallet allowing USDC. `amount` is `"0"` and `nullifier` is `""`.

**`status: "failed"`** means the transaction **reached the ledger and failed**.

- The network fee (a fraction of an XLM) was spent.
- **No USDC moved.** For a failed repayment, `amount` is what was attempted. For a failed advance, it is
  `"0"`.

A transaction that never reached a ledger is **not listed**: refused in the wallet, refused at simulation,
or dropped by the network. Nothing was charged and nothing about it is on chain. If the front end wants to
show those, it has to keep them itself.

## Where the data comes from

The routes read two sources:

- **Horizon**, for the account's operations. It keeps the full history, failed transactions included,
  with each contract call's arguments and the USDC that moved.
- **The RPC**, for the contract's current record of each advance.

The RPC's `getEvents` is not used, because it only reaches back about a week, and an advance taken early
in the grant outlives that.

A call counts as the borrower's only when the borrower's own wallet submitted it. That is how the front
end submits every call.
