# Forepay API (#16, #17)

What the front end reads, and the proof relay. Run it with `pnpm -C be start` (port 8787 by default).
Configuration is in `be/.env.example`.

Every route returns JSON. All are `GET` except `POST /proofs`.

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
| `POST /proofs` | The relay (#17): prove the creator's AdSense revenue, bound to their `G…`. `202` with a job. See [the relay](#the-proof-relay-17). |
| `/proofs/:id` | The job's stage, then `request_advance`'s arguments, or why it failed. |

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

## The proof relay (#17)

### The browser flow

1. The creator connects their wallet (#19). That gives the `G…` the claim is bound to.
2. The front end opens **Google's own sign-in popup** with Google Identity Services (the token client,
   `google.accounts.oauth2.initTokenClient`). It asks for one scope,
   `https://www.googleapis.com/auth/adsense.readonly`, and gets back an access token that lasts an hour.
   **No Reclaim SDK runs in the browser.**
3. The front end sends `POST /proofs` with the `G…` and the token, then polls `GET /proofs/:id`.
4. When the job is `done`, its `request` goes straight into `request_advance`, signed by the creator's
   wallet. The relay never submits on the creator's behalf: `request_advance` requires the borrower's own
   authorization (`docs/interface.md`).

Why the proof is made on the relay and not in the browser: the proving engine Reclaim's attestor accepts
(`snarkjs`, see #5) needs about 330 MB of circuit files and minutes of CPU (about one on the relay host, ten on a laptop). Reclaim's
browser SDKs (popup, QR, redirect) need a provider published in Reclaim's portal and a login inside
Reclaim's app; the AdSense provider (#4) is a zkFetch request to the AdSense Management API, which takes
an OAuth token instead.

For `fe/src/lib/reclaim`'s `ProveStage`: `waiting` is while Google's popup is open; `reading` is from
`POST /proofs` until the job ends.

The Google OAuth client is a **Web application** client, with the front end's origins as authorized
JavaScript origins. While the consent screen is in testing, only the test users listed on it can sign in.

### What happens to the token

It travels once, over HTTPS, in the body of `POST /proofs`. The relay uses it for three reads (which
account, is it `READY`, does the live report have the expected shape) and inside zkFetch's secret
headers, which stay out of the claim. It lives in memory for the length of the job: it is not written to
disk, logged, returned or kept after the job ends. A proof that contains it anywhere fails the audit and
is not returned. Error messages are scrubbed of it.

### Where the binding comes from

The `G…` is written into the claim's `context.contextAddress` **before** the attestor signs it, so it is
inside the signed bytes (#9). The relay checks the signed context names the requester before returning
anything, and the contract reads the borrower from that context, never from an argument.

### `POST /proofs`

```json
{ "borrower": "GA2C…WWH2", "accessToken": "ya29.…", "publisherId": "pub-1234567890123456" }
```

`publisherId` is optional: without it, the relay uses the only AdSense account the token can read.

`202`, with `Location: /proofs/<id>`:

```json
{ "id": "423a114a-01d2-4a88-aa32-442fa961818f", "stage": "queued", "position": 0, "createdAt": 1792466795 }
```

| Status | When |
| --- | --- |
| `400` | Not JSON, a borrower that is not a `G…`, no token, or a malformed `publisherId` |
| `409` | A proof for this borrower is already in progress (`code: "running"`). The running job's id is not returned: a borrower's address is public, and the id reads their revenue. Keep the id from the `202` |
| `413` | Body over 8 KB |
| `503` | The relay is busy (`code: "busy"`, `Retry-After: 120`), or not configured on this server (`code: "unconfigured"`; `/config` says `"relay": false`) |

### `GET /proofs/:id`

Poll every few seconds. `stage` goes `queued` → `checking` → `proving` → `auditing` → `done` or
`failed`. `position` is how many jobs are ahead while `queued`. One proof runs at a time.

```json
{
  "id": "423a114a-…",
  "stage": "done",
  "createdAt": 1792466795,
  "request": {
    "revenueUsd": "1234.56",
    "pubId": "pub-1234567890123456",
    "windowStart": "2026-07-01",
    "windowEnd": "2026-09-30",
    "timestampS": "1792467390",
    "epoch": "1",
    "signature": "<64 bytes, hex>",
    "recoveryId": 1
  }
}
```

`request` is `AdvanceRequest` in `fe/src/lib/stellar/contract.ts`, except that `timestampS` and
`epoch` are strings: pass them through `BigInt()`. The contract accepts the proof for an hour after
`timestampS`.

A failed job has `error: { code, message }`. The code says whose move it is:

| `code` | Meaning | What the creator can do |
| --- | --- | --- |
| `token` | Google refused the token: expired, or without `adsense.readonly` | Sign in again |
| `account` | No AdSense account, several (pass `publisherId`), or one that is not `READY` | Use an approved account |
| `provider` | AdSense answered in a shape the provider does not expect | Nothing; ours to fix |
| `prove` | The attestor or zkFetch failed | Try again |
| `audit` | The proof came back but failed the audit, so it was not returned | Nothing; ours to fix |
| `internal` | Anything else | Try again |

`404` for an unknown id. Jobs are kept for an hour after they finish; a restart of the relay loses them.

### Running it

The relay is on when `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET` are set and the circuit files are
present (`pnpm -C be zk:files`, about 330 MB). Otherwise the read routes still serve and `POST /proofs`
answers `503`.
