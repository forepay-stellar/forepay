# Deployments and on-chain evidence

Every contract address and transaction hash this project relies on, with how it was checked.
Testnet only — the Instawards scope excludes mainnet funds.

---

## The Reclaim verifier (issue #2)

Checked **2026-10-09** against live testnet. Everything below was invoked, not read from a README.

### Addresses

| What | Address | Notes |
| --- | --- | --- |
| Reclaim verifier, **testnet** | `CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5` | Reclaim's own deployment. Owner `GA5UT3POTPOV6TUQVSRC3ZICLV6LTB6N6TFWL2JXY3NIXXD4TTVSUMH7` — **not us** |
| Reclaim verifier, mainnet | `CD4M2KHW3ESOV3RUT7KCTC6BX37PIL2Z3BEK47IA74KIMFIFUI3JJDMO` | Out of scope, recorded for completeness |
| **Forepay probe instance** | `CASAIKW7EOWC3RUBS34IAW6ETXBXI4KOQNMXO66DK7LRBN5MXAWWZURP` | Ours. Same wasm hash, deployed so we can exercise the success path |

Both instances run wasm `3d28b81b83345ed4478e88f335df469aa92d427affe0876a6b08f40ad257ee97`. Source: [`reclaimprotocol/stellar-sdk-onchain-integration`](https://github.com/reclaimprotocol/stellar-sdk-onchain-integration).

### Interface, read from chain

```rust
fn instantiate(env: Env, user: Address) -> Result<(), ReclaimError>;
fn add_epoch(env: Env, witnesses: Vec<Witness>, minimum_witness: u32) -> Result<(), ReclaimError>;
fn verify_proof(env: Env, message_digest: BytesN<32>, signature: BytesN<64>, recovery_id: u32)
    -> Result<(), ReclaimError>;

enum ReclaimError { OnlyOwner = 1, AlreadyInitialized = 2, HashMismatch = 3,
                    LengthMismatch = 4, SignatureMismatch = 5 }
```

### The question issue #2 was opened to answer

**Does the deployed testnet instance carry the real Reclaim witness set, or a test one?**

**It carries the real one.** Read from persistent storage key `EPOCH`:

| Field | Value |
| --- | --- |
| `id` | 0 |
| `minimum_witness` | 1 |
| `witnesses` | exactly one — address `244897572368eadf65bfbc5aec98d8e5443a9072`, host `"http"` |
| `timestamp_start` / `timestamp_end` | 2025-12-21 02:28:56Z → 05:15:36Z |

`0x244897572368eadf65bfbc5aec98d8e5443a9072` is **Reclaim's production attestor**. It appears as the witness across Reclaim's own NEAR, Sui, Aptos, Move, Gear and Substrate SDK integrations, and their docs list it with `url: "https://reclaim-node.questbook.app"`.

So the Week 1 feasibility gate (#5) is **not** blocked by a test witness set. A genuine AdSense proof signed by the production attestor network should verify against this instance.

### Both outcomes, proven

| Case | Where | Result |
| --- | --- | --- |
| All-zero signature | Reclaim's testnet instance | `Error(Crypto, InvalidInput)` — host rejects malformed input before the contract can judge it |
| **Valid signature, non-witness key** | Reclaim's testnet instance | **`Error(Contract, #5)` SignatureMismatch** ✅ |
| **Valid signature, registered witness** | Forepay probe instance | **`Ok(())`** ✅ — [`e212efd9…`](https://stellar.expert/explorer/testnet/tx/e212efd9eb6ea4db14c0d35701481468eacb645673c9d9427bbd257c862c1355) |
| Same digest, one byte flipped | Forepay probe instance | `Error(Contract, #5)` SignatureMismatch ✅ |

The all-zero case is recorded because it is *not* the negative test: it only proves the host rejects a malformed signature. The real negative needs a **syntactically valid** signature that recovers to the wrong address, which is what `tools/secp256k1_probe.py` produces.

The success path could not be shown on Reclaim's instance — that would need the production attestor's private key. So we deployed an instance of the identical wasm, registered a witness we control, and proved `Ok(())` there. Same code, same code path.

### Probe instance setup transactions

| Step | Transaction |
| --- | --- |
| Deploy (from existing wasm hash) | [`444b2a06…`](https://stellar.expert/explorer/testnet/tx/444b2a068842b27c43eda113d2d9a5352ddd3d026128ff86e6c1ba5fb280e26f) |
| `instantiate` | [`5a29cb8f…`](https://stellar.expert/explorer/testnet/tx/5a29cb8fbec47335a33885236c9ced9c002186ecb395741dd8e29699de1c153e) |
| `add_epoch` (test witness `19e7e376…`) | [`500dc3e3…`](https://stellar.expert/explorer/testnet/tx/500dc3e3954c0b9be76d7d1fbbbe92132ead5109936bb1fe1a4d893a7bbac690) |

The probe witness `19e7e376e7c213b7e7e7e46cc70a5dd086daff2a` derives from the throwaway constant
`0x1111…1111`, recorded in `tools/secp256k1_probe.py` so the probe is reproducible. It holds no
funds — it is an Ethereum-style address that exists only as a witness entry — and it is not a
Forepay key.

> ### ⚠️ The probe instance accepts forged proofs, on purpose
>
> Its witness key is **published in this repository**. Anyone who reads `tools/secp256k1_probe.py`
> can sign anything the probe instance will accept. That is exactly what makes it useful as a test
> harness, and exactly what makes it dangerous if it is ever mistaken for a real dependency.
>
> **Never point the Forepay advance contract at `CASAIKW7…WZURP` as it stands.** Doing so would let
> any reader of this repo mint themselves an advance against a proof they forged in ten lines of
> Python.
>
> If the fallback below is ever needed, the **first** step is `add_epoch` replacing the test witness
> with the production attestor `244897572368eadf65bfbc5aec98d8e5443a9072`. Only after that is the
> instance safe to depend on. Record that transaction here when it happens.

---

## Four things the probe turned up that are not in the SOW

**1. `verify_proof` never checks the epoch time window.** It reads `epoch.witnesses` and nothing
else. The stored window expired on 2025-12-21 and verification still works — confirmed by the
`Error(Contract, #5)` above, which is only reachable *after* the storage read and the signature
recovery. So the expired timestamps are harmless. Worth knowing before someone spends a day on it.

**2. `minimum_witness` is not an m-of-n threshold.** `verify_proof` takes a *single* signature,
slices `witnesses[0..minimum_witness]`, and checks the one recovered address against that slice.
With `minimum_witness = 1` and one witness it is 1-of-1. **Do not read it as a quorum** — nothing in
this contract aggregates multiple attestor signatures.

**3. The contract recovers through `crypto_hazmat().secp256k1_recover`.** That is Soroban's
explicitly-unaudited surface. It is Reclaim's contract and their call to make, but it belongs in our
risk notes rather than being discovered by a reviewer.

**4. We do not own the instance everything depends on, and its state is in persistent storage.**
Owner is `GA5UT3PO…`. `CONFIG` and `EPOCH` are persistent entries, which are **archived** when their
TTL lapses, and `verify_proof` does `env.storage().persistent().get(&EPOCH).unwrap()` — an archived
entry makes that panic, and only the owner can call `instantiate`/`add_epoch` to rebuild it.

Both entries are live today: the probe read them successfully, which an archived entry would not
allow. But a 30-day grant resting on somebody else's storage rent is a risk worth naming, and the
probe instance above is the mitigation — identical code, our ownership, our TTL.

**Recommendation for #5 and beyond:** verify real AdSense proofs against **Reclaim's** instance,
since that is the deployment whose witness is the production attestor and that is what makes the
demonstration meaningful.

The probe instance is the fallback, **but only after rotating its witness** — see the warning above.
If Reclaim's entries ever lapse mid-grant: call `add_epoch` on ours with
`244897572368eadf65bfbc5aec98d8e5443a9072`, confirm the test witness is gone, record the
transaction here, and only then repoint anything at it.

---

## Toolchain note

`stellar` CLI **27.0.0** against testnet on **protocol 29** (`getVersionInfo`, stellar-core 29.0.0).
Every call above worked, but the mismatch is real and the contract crate should pin
`soroban-sdk = "29"` — see issue #1.

---

## The advance contract (issue #8)

Not deployed yet — #15 does that, after the logic lands in #9 to #13. Recorded here so the
build is reproducible from the first commit rather than reconstructed later.

| | |
| --- | --- |
| Crate | `sc/advance` (`forepay-advance`) |
| SDK | `soroban-sdk 29` — testnet is protocol 29, and the SDK major tracks the protocol major |
| Target | `wasm32v1-none` |
| Built with | `stellar contract build` (the SDK refuses a bare `cargo build`, requiring stellar-cli ≥ 25.2.0) |
| Skeleton wasm | 6,848 bytes, `sha256 63f1cbff8fc154e6f21359a29d504286c181eb2075d4409e30e58e15212dd565` |

That hash is the **skeleton only** and will change with every ticket from #9 onward. The
per-host-triple hash table that #14 sets up is the one that matters for release; this row
exists so the first build is on the record.

### Upgradeable, behind a timelock

`propose_upgrade` → wait 24 hours → `execute_upgrade`, with `cancel_upgrade` in between and
`renounce_upgradeability` as a one-way door once the demo is frozen.

A bare admin upgrade would reduce the contract's whole security argument to "trust the admin
key". The delay is what gives anyone watching a chance to notice. The delay is a constant
rather than an admin-settable value, because an admin who can shorten the delay has no delay.

### Verified on StellarExpert

`.github/workflows/release.yml` runs `stellar-expert/soroban-build-workflow` on any `v*` tag.
It compiles and optimises the contract, publishes a GitHub release with the artifacts and
their SHA256 hashes, and sends the hash, repo and commit to StellarExpert — which then shows
a link from the deployed contract to the exact commit it came from.

To cut a verified release:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Do this **after** #15 deploys, so the verified hash is the one actually on chain.

---

## The nullifier, proven on live testnet (issue #10)

An end-to-end run against a deployed contract on **2026-10-14**. Not a unit test with a mocked
verifier — real transactions, a real cross-contract call, real ledger state.

| What | Address |
| --- | --- |
| Advance contract (dev) | [`CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID`](https://stellar.expert/explorer/testnet/contract/CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID) |
| Verifier it points at | `CASAIKW7EOWC3RUBS34IAW6ETXBXI4KOQNMXO66DK7LRBN5MXAWWZURP` — **our probe instance** (#2) |
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Wasm | `af9ee02edc4a12097dcc1c9e8a7be5841e0eec891658dbd75d96a555ae0cdc55`, 17,035 bytes |

**Why the probe verifier and not Reclaim's.** The success path needs a signature the verifier will
accept, and only the production attestor can produce one for a real AdSense response — which is
exactly what #5 is blocked on. The probe instance runs **the identical wasm** with a witness we
control, so the contract's code path is the same in every respect but whose key signed. The digest
construction itself was proven against the real attestor in #3 and accepted by Reclaim's own
contract, so what is being shown here is the nullifier, not the cryptography.

This deployment is **development only** and must not be used for anything real: its verifier accepts
forged proofs by design, as recorded above.

### The run

| Step | Result | Transaction |
| --- | --- | --- |
| Upload wasm | — | [`959ad856…`](https://stellar.expert/explorer/testnet/tx/959ad85651072af4636f7fac245ed09d052d4f6df4be6ed60d07d97efd010fc2) |
| Deploy | — | [`05cb75d1…`](https://stellar.expert/explorer/testnet/tx/05cb75d1586c27dff901613d6556869104ada975fa75400264853fe774eb3fa0) |
| `set_claim_template` | `ClaimTemplateSet`, 4 parts | [`36d6362e…`](https://stellar.expert/explorer/testnet/tx/36d6362ea16d4233a4f3002787389ea294b2eae94b9f159f4f59d90be1ae3527) |
| **`verify_and_reserve`, first call** | **Success**, event `NullifierSpent` | [`c9ea01e4…`](https://stellar.expert/explorer/testnet/tx/c9ea01e40444ef41ee2557bab6b963db51d3d9e0f9dfa531d84511767ea847e8) |
| **The same proof again** | **`Error(Contract, #20)` `NullifierSpent`** | refused at simulation; nothing submitted |
| `is_spent(nullifier)` | `true`, read from chain | — |

The first call returned the verified claim:

```json
{"borrower":"GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2",
 "pub_id":"pub-9988776655443322","revenue_usd":"4821.75",
 "window_start":"2026-07-01","window_end":"2026-09-30","timestamp_s":1791989719}
```

Nullifier `d43c27e55f8376145943774f79de86792867841cc3c00fea13cca39697505e09`.

**The second attempt failed at simulation, so it never reached the ledger.** That is the right
shape: a replay costs the attacker a refusal, not a transaction fee and a half-applied state.

### Why the nullifier is persistent and not temporary

Checked against the Stellar docs rather than assumed:

| Storage | When the TTL expires |
| --- | --- |
| `temporary` | **Removed forever** |
| `persistent` | **Archived**, and restorable |

A nullifier in temporary storage would be deleted when its TTL lapsed, and the proof would become
spendable again — replay protection with a time limit is not replay protection. A persistent entry
is archived instead, and the host makes a caller restore it before touching it, so a lapsed
nullifier cannot silently read as absent.

---

## Upgradeability and verification, both exercised rather than claimed (issue #8 follow-up)

Checked on **2026-10-14** against the development deployment
`CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID`. An upgrade path that has never run
on chain is a claim, not a capability, and a verification workflow that has never run is worse —
it looks like evidence until the day it is needed.

### Upgradeable — proven on chain

| Call | Result |
| --- | --- |
| `is_upgradeable` | `true` |
| `propose_upgrade` | Success, event `UpgradeProposed`, `executable_at` exactly **86,400 s** ahead — [`5f2f59dd…`](https://stellar.expert/explorer/testnet/tx/5f2f59dd10228060f20b2cae5188a4fde04b1a7e907261a1459f42c13970c8da) |
| `execute_upgrade` immediately after | **`Error(Contract, #4)` `TimelockNotElapsed`** — refused at simulation |
| `cancel_upgrade` | Success, event `UpgradeCancelled` |
| `pending_upgrade` after cancel | `null` |

The delay is real and enforced by the ledger's own clock, not only by a unit test with a mocked
timestamp. The contract is left with no pending proposal.

`execute_upgrade` after the full 24 hours is the one step not shown here, because it takes 24
hours. It is covered by `an_upgrade_cannot_be_executed_before_the_timelock_elapses` and the other
upgrade tests in `sc/advance/src/test.rs`.

### Verified — the workflow was broken, and only running it showed that

The first tagged release (`v0.1.0-dev.1`) **failed**:

```
An error occurred trying to start process '/usr/bin/bash' with working directory
'/home/runner/work/forepay/forepay/<sha>/[sc/advance]'. No such file or directory
```

**The action's README is wrong for the current version.** It shows

```yaml
relative_path: '["src/my-awesome-contract"]'
```

but `stellar-expert/soroban-build-workflow`'s `release.yml` declares `relative_path` as
`type: string` and uses it directly:

```bash
WORK_DIR="$WORK_DIR/${{ inputs.relative_path }}"
```

so the JSON-array form makes the runner look for a directory literally named `[sc/advance]`.
The fix is a plain string, and the comment in `.github/workflows/release.yml` records it so nobody
"corrects" it back to the README's form.

Worth the dev tag: finding this in Week 4, with the evidence pack due and Deliverable 1 resting on
a verified contract, would have been an expensive hour.
