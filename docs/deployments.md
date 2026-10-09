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
`0x1111…1111`, recorded in `tools/secp256k1_probe.py` so the probe is reproducible. **It holds no
funds and has no authority outside our own probe instance.** It is not a Forepay key and must never
be used as one.

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
demonstration meaningful. Keep the probe instance as the fallback: if Reclaim's entries ever lapse
mid-grant, re-register the production attestor address on ours and keep moving.

---

## Toolchain note

`stellar` CLI **27.0.0** against testnet on **protocol 29** (`getVersionInfo`, stellar-core 29.0.0).
Every call above worked, but the mismatch is real and the contract crate should pin
`soroban-sdk = "29"` — see issue #1.
