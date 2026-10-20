# Interface freeze (#6)

What the contract, the relay and the front end build against. Frozen **2026-10-14**.

> ## Why this is frozen before #5 passes
>
> #6 was meant to wait for the feasibility gate. It cannot: **M2 is due 23 October**, all eight
> contract tickets sit behind this document, and the gate is blocked on access to an AdSense
> account that may not exist before 30 October (#5).
>
> Waiting would cost the whole of M2 to a problem that is about a Google account, not about the
> design. So everything that does not depend on the live AdSense response is frozen here, and the
> one thing that does — the exact `parameters` bytes — is made **admin-settable** so it can be
> pinned the moment #5 produces a real proof.
>
> The AdSense delay now costs us one storage write, not the contract.

---

## 1. What the attestor actually signs

Established in #3 against a real production-attestor signature, and accepted on chain by Reclaim's
own testnet verifier ([`96a744d7…`](https://stellar.expert/explorer/testnet/tx/96a744d71ecada206fd46359fe7e895dd31919c9079f1c731d6b4ccdc8a41cda)).

```
identifier = keccak256(provider \n parameters \n canonical_context)
sign_data  = identifier \n owner_lowercase \n timestamp_s \n epoch
digest     = keccak256("\x19Ethereum Signed Message:\n" + len(sign_data) + sign_data)
```

**The revenue figure is not a signed field.** It lives in `context` and reaches the signature only
through `identifier`. Nothing may trust a figure that was not fed into the identifier computation.

Reference implementations, both tested against the same fixture so they cannot drift:
`sc/reclaim-claim` (Rust, `no_std`) and `be/src/reclaim/claim-digest.ts`.

## 2. `provider` and `parameters` are pinned in the contract, never submitted

Two independent reasons:

- **The attestor signs whatever the fetched server returned** (@Lin1er, #4). A zkFetch against
  `attacker.example` returning a fat `totals` carries a perfectly valid signature. A contract that
  trusts a submitted `parameters` string cannot tell it from the real one.
- **Reclaim's separator is ambiguous** (#3). `provider="a", parameters="b\nc"` hashes identically to
  `provider="a\nb", parameters="c"`. There is a test asserting that collision.

So the contract stores the expected bytes and rebuilds them. A caller supplies only the values that
vary.

| Stored | Set by | Why |
| --- | --- | --- |
| `provider` | constant `"http"` | Reclaim's HTTP provider |
| `parameters_template` | **admin, `set_claim_template`** | The exact bytes come from the first live proof (#5) |
| `provider_hash` | **admin, same call** | Reclaim's provider hash for the AdSense provider |

`set_claim_template` is admin-gated and may be called again — the template changes whenever the
provider version changes. It does **not** invalidate existing advances; it only governs what a new
proof must match.

**Until the template is set, `request_advance` refuses with `TemplateNotSet` (10).** The contract
deploys in a safe state rather than one that accepts anything.

### The template holds eight parts and takes seven values (#76)

```
pub_id, start_year, start_month, start_day, end_year, end_month, end_day
```

Seven, not three, because **AdSense has no string form for a date.** `startDate` and `endDate` on
`accounts.reports.generate` are `object (Date)` — `{year, month, day}` as *integers* — which the
REST transport flattens into `startDate.year=2026&startDate.month=7&startDate.day=1`. Unpadded:
`7`, never `07`. Verified against Google's own reference, not inferred.

So the rebuilt URL is the one `be/src/adsense/request.ts` actually sends:

```
https://adsense.googleapis.com/v2/accounts/<pub_id>/reports:generate
  ?dateRange=CUSTOM
  &startDate.year=<y>&startDate.month=<m>&startDate.day=<d>
  &endDate.year=<y>&endDate.month=<m>&endDate.day=<d>
  &metrics=ESTIMATED_EARNINGS&currencyCode=USD&reportingTimeZone=ACCOUNT_TIME_ZONE
```

**The interface does not change.** `request_advance` still takes `window_start` and `window_end` as
`YYYY-MM-DD`, and the nullifier is still computed over those strings. `claim::split_date` converts
them on the way into the template — ten bytes of fixed-width parsing, every byte checked, no JSON.
A window that is not exactly `dddd-dd-dd` is refused with `ClaimMismatch` rather than guessed at.

A four-part template is now refused by `set_claim_template` itself. It described
`?startDate=2026-07-01`, a request the AdSense API cannot serve, so every real proof built against
it was refused with a bare `ClaimMismatch` and no clue why.

## 3. The claim's context, rebuilt rather than parsed

Canonical context is sorted-key JSON with no whitespace. A JSON parser in `no_std` wasm would be
large, slow, and its bugs indistinguishable from a bad proof, so the contract **rebuilds** the
string from the values it was handed and compares byte for byte:

```
{"contextAddress":"<borrower G…>","contextMessage":"<constant>","extractedParameters":{"revenueUsd":"<figure>"},"providerHash":"<hash>"}
```

Key order above is alphabetical because that is what canonicalisation produces — it is not a
stylistic choice and must not be "tidied".

### `extractedParameters` holds the figure and nothing else (#76)

It used to carry `currency`, `startDate` and `endDate` as well. Those cannot be there. A Reclaim
`responseMatches` regex captures **one contiguous substring**, and AdSense echoes the window back as
`"startDate":{"year":2026,"month":7,"day":1}` — there is no `"2026-07-01"` anywhere in the response
to capture. A context asking for one describes a proof the provider cannot produce.

Neither field left the signature; both moved to where the provider actually puts them, and both are
in `parameters`, which this contract pins:

| Was asserted by | Now asserted by |
| --- | --- |
| `extractedParameters.currency` | the `"currencyCode": "USD"` response match |
| `extractedParameters.startDate` / `.endDate` | the URL — Google computes the totals **for the window in the URL** |

So the window and the currency are held exactly as strongly as before. What changed is which signed
field holds them.

`canonical_context_matches` in `sc/reclaim-claim` does this comparison. Any difference at all —
ordering, whitespace, a trailing byte — is a refusal.

**The borrower is `contextAddress`, read from inside the signed context**, never from a parameter
beside it. A binding the attestor did not sign is not a binding (#9, #18).

## 4. Nullifier: `sha256(pub_id ‖ window_start ‖ window_end)`

Keyed on the **economic thing being borrowed against** — the account and the period — not on the
proof's bytes.

A nullifier keyed on the proof identifier would be wrong: any difference in the response at all (a
recalculated total, a trailing zero, a window boundary landing a day differently) mints a fresh
identifier and would fund a second advance against the same revenue.

Stored in **`persistent`** storage, never `temporary`. A temporary entry expires with its TTL, and
an expired nullifier means the proof becomes spendable again — replay protection with a time limit
is not replay protection. Written **before** disbursement, in the same invocation.

> ### Known limitation: the nullifier is publicly computable, and a salt does not fix it
>
> `pub_id` is public — it appears in the ad code on every page serving AdSense. So anyone can
> compute any publisher's nullifier and check whether it is spent, which leaks **who borrowed and
> for which period**, in a product whose pitch is proving revenue without revealing things.
>
> It is not a security hole: nobody can write a nullifier without a valid proof.
>
> **Salting it was considered and rejected as theatre.** A salt only helps if it is secret, and
> nothing in contract storage is secret — anyone can read it off the ledger. An on-chain nullifier
> over a public identifier is inherently enumerable. The real fix is a commitment scheme, which is
> out of scope for a 30-day testnet demonstration.
>
> Recorded here so it is a known limitation rather than something a reviewer discovers.

## 5. Sizing: deterministic, and the numbers

```
advance_stroops = min(ADVANCE_CAP, revenue_stroops × ADVANCE_NUM / ADVANCE_DEN)
```

| Constant | Value | Reasoning |
| --- | --- | --- |
| `ADVANCE_NUM / ADVANCE_DEN` | **25 / 100** | A quarter of three months' proven revenue — about three weeks of earnings. Conservative, because the advance is effectively unsecured and this phase has no default mechanics (SOW §4.1) |
| `ADVANCE_CAP_STROOPS` | **1_000_000_000** (100 USDC) | The contract is funded by us on testnet; the cap keeps one demo from draining it |
| `MIN_ADVANCE_STROOPS` | **10_000_000** (1 USDC) | Below this, refuse. A dust advance burns the creator's nullifier for the period and gives them nothing |

No admin discretion anywhere in the path. The same proof always sizes the same advance — that
determinism is the product, and the front end shows the derivation (#20).

### Reading the constants from the contract (#63)

```
sizing() -> { rate_num, rate_den, cap_stroops, min_stroops, stroops_per_cent }
```

Pure, no storage read, cannot fail. The front end must read these rather than hard-code them: 2b
shows the derivation beside the figure, and a hard-coded `25%` next to a number the contract sized
differently is a derivation that lies. It also lets 2b tell *capped* apart from *exactly 100 USDC* —
compare `quote()` to `cap_stroops`, not to a literal in the bundle.

These are compile-time constants, not storage, so they can only change by upgrade — and when they
do, this getter changes with the arithmetic, in the same wasm.

### Fixed point

USDC's SAC reports **7 decimals** — read from chain on 2026-10-14, not assumed, because the Stellar
docs warn explicitly against assuming 7.

`revenueUsd` arrives as a decimal string matching `\d+(\.\d+)?`. Parse to **cents**, rejecting more
than two decimal places, then convert:

```
stroops = cents × 100_000          // 10^7 per USDC ÷ 10^2 per cent
```

`i128` throughout, `overflow-checks = true`. Reject zero and negative explicitly rather than letting
them reach a transfer.

## 6. Freshness

| Constant | Value |
| --- | --- |
| `MAX_PROOF_AGE_SECONDS` | **3_600** (1 hour) |
| `MAX_CLOCK_SKEW_SECONDS` | **300** (5 minutes) |

Measured as `claim.timestamp_s` against **`env.ledger().timestamp()`** — the ledger close time, which
is the only clock a contract has.

- older than `MAX_PROOF_AGE_SECONDS` → `ProofStale` (12)
- more than `MAX_CLOCK_SKEW_SECONDS` in the future → `ProofFromTheFuture` (13)

One hour, not minutes: the creator proves in a browser and the relay submits, and a window measured
in minutes turns an ordinary slow connection into a failed advance. Freshness is a **secondary**
guard here — the primary protection against replay is the nullifier, and against stale revenue the
window pinned in `parameters_template`.

**What #26 may claim.** That a proof older than one hour is refused. **Not** that a forwarded proof
is refused — a proof forwarded and submitted inside the hour is accepted, and is worth exactly what
the borrower's own proof is worth, because `contextAddress` binds it to them.

## 7. Error codes

Assigned once, **never renumbered**. Blocks reserved in #8; this freeze fills 10–59.

| Code | Name | Raised by |
| --- | --- | --- |
| 1–6 | lifecycle, admin, upgrade | #8, in use |
| **10** | `TemplateNotSet` | #9 |
| **11** | `ClaimMismatch` — rebuilt claim info does not match what was signed | #9 |
| **12** | `ProofStale` | #9 |
| **13** | `ProofFromTheFuture` | #9 |
| **14** | `VerifierRejected` — Reclaim's `verify_proof` refused | #9 |
| **20** | `NullifierSpent` | #10 |
| **30** | `RevenueUnparseable` — not `\d+(\.\d+)?`, or more than two decimals | #11 |
| **31** | `AdvanceTooSmall` — below `MIN_ADVANCE_STROOPS` | #11 |
| **40** | `InsufficientLiquidity` — the contract cannot cover the advance | #12 |
| **41** | `NoTrustline` — the borrower holds no USDC trustline | #12 |
| **50** | `UnknownAdvance` | #13 |
| **51** | `RepaymentExceedsOutstanding` | #13 |

`NoTrustline` is named rather than left as a raw panic: a SAC transfer to a `G…` address fails when
the account has no USDC trustline, and "add a USDC trustline" is something a creator can act on.
The front end checks first (#19), but the contract does not assume it did.

## 8. The call

```rust
request_advance(
    borrower: Address,        // must equal contextAddress inside the signed claim
    revenue_usd: String,      // decimal string from extractedParameters
    pub_id: String,           // AdSense publisher id
    window_start: String,     // YYYY-MM-DD; split into year/month/day for the URL (§2)
    window_end: String,
    timestamp_s: u64,
    epoch: u64,
    signature: BytesN<64>,
    recovery_id: u32,
) -> Result<i128, Error>       // stroops disbursed
```

Order is the security property, and it does not change:

1. template is set, else `TemplateNotSet`
2. split each window date into unpadded year/month/day, else `ClaimMismatch`; rebuild `context` and
   `parameters`; rebuild `identifier`; build the digest
3. freshness
4. **cross-contract `verify_proof`** — everything after this point is attested
5. nullifier not spent → **write the nullifier**
6. size
7. disburse
8. record the advance

Verify before trusting any field, and write the nullifier before moving money. Check-then-act with a
transfer in between is the classic race.

## 9. Still open

**The `parameters_template` and `provider_hash` bytes.** They come from the first real AdSense proof
(#5) and are set by `set_claim_template` — no code change, one admin call.

Everything else here is frozen. @Lin1er @AncungAulia — build against it.

### What this freeze got wrong, and how (#76)

The freeze happened before any real AdSense response existed — deliberately, because waiting would
have cost all of M2 to a problem about a Google account. The gamble was that the *shape* of a
claim could be pinned ahead of seeing one. It mostly held; in two places it did not:

- `?startDate=2026-07-01` is not a request AdSense can serve.
- `extractedParameters` asked for fields a single-capture regex cannot extract.

Every real proof would have been refused, with `ClaimMismatch` and no indication of which byte was
wrong — the hardest failure in this pipeline to read. Found by @Lin1er on #6 while building the
provider, by comparing this document against the API rather than against the contract, which is the
only way it could have been found before the first proof arrived.

The lesson worth keeping is narrow: **the part of a freeze that describes someone else's API is a
guess until it is checked against that API.** Checking it did not need a live account — the
reference page was enough, and nobody read it.
