# Deployments and on-chain evidence

Every contract address and transaction hash this project relies on, with how it was checked.
Testnet only — the Instawards scope excludes mainnet funds.

---

## Machine-readable record

The API (`be/src/network.ts`) runs against exactly these. A test fails the build if that file
and this block differ, so update both in the same commit. `advance` stays `null` until #15
deploys it.

<!-- forepay:deployments -->
```json
{
  "network": "testnet",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "contracts": {
    "reclaimVerifier": "CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5",
    "usdcSac": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "advance": null
  }
}
```

---

## USDC on testnet

Checked **2026-10-10** by simulating the token interface on the contract (testnet reports protocol 29):

| Call | Result |
| --- | --- |
| `name()` on `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| `symbol()` | `USDC` |
| `decimals()` | **7**: one USDC is 10,000,000 base units. Sizing (#11) and disbursement (#12) must use this, not 6 |

A SAC transfer to a `G…` account fails without a USDC trustline (#12, #19).

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

## The feasibility gate (#5)

**Status (2026-10-14):** passed on feasibility, with one open risk on data access. This is the
[PM's ruling on #5](https://github.com/forepay-stellar/forepay/issues/5).

- What is proven: a fresh zkTLS proof, minted today, verifies on Reclaim's verifier on testnet.
  See the live run below.
- What is still open: no AdSense account in state `READY` is available yet. A `READY` account with
  $0 earnings is accepted as gate evidence, with that limitation written beside it.

When an AdSense proof exists, `pnpm -C be verify:proof be/proofs/<file>.json --submit` prints the
rows that go here.

### Live run: a fresh proof of a public endpoint (not gate evidence)

On 2026-10-14 we ran the whole pipeline live: zkFetch through Reclaim's production attestor, then
`verify_proof` on Reclaim's verifier. The fetched endpoint was `https://horizon.stellar.org/`, which
is public and **not AdSense**.

What it checked:
- **Secret header redaction.** A random canary was sent as a secret header, in the place the
  AdSense OAuth token goes. It does not appear in the proof.
- **Binding to the borrower.** The context binds the claim to the borrower address.

Commands: `pnpm -C be prove:smoke`, then `verify:proof … --submit`.

| Step | Result |
| --- | --- |
| zkFetch, engine `snarkjs` | Proof in ~10 min on a laptop. Extracted `passphrase`, `ledger` = `64940833` |
| Canary secret header | Absent from the proof |
| Context binding | `GAVGFCYCIQ2OOPNNW4MLXBE6OPB72NBRJVEPNK5YJBJ4Z6GNTXH3EOFJ` |
| `verify_proof` on `CA3EMXR6…H54DU5`, genuine digest | **Ok**: [`13bdff8b…`](https://stellar.expert/explorer/testnet/tx/13bdff8b4378fd5bdcd6d571c715f1c680a569a5284da2730d3764df9b8b958d) (ledger 5193392) |
| Same digest, one byte flipped (simulated) | `Error(Contract, #5) SignatureMismatch` |
| Signer | `0x244897572368eadf65bfbc5aec98d8e5443a9072` (production attestor) |
| Claim identifier | `0x6b91a4273e61536607d1dcf6360f79baa8dc413f9c50b9459234f83163b35c77` |

Two findings from this run, both now built into `be/src/reclaim/zk-files.ts`:

1. **The `stwo` engine is refused.** zk-fetch 1.1.0 uses `stwo` by default, and the production
   attestor refused every `stwo` proof with `invalid proof (ZK proof 0, startIdx 0, record 1)`. So
   the engine is pinned to `snarkjs`.
2. **`snarkjs` needs circuit files that npm does not ship** (~330 MB). Fetch them once with
   `pnpm -C be zk:files`.

About 10 minutes per proof matters for #17: a browser-side prover would be at least this slow.

### Pipeline check, on the #3 fixture (not gate evidence)

`verify:proof` was run end to end on 2026-10-10 against Reclaim's own verifier, with the real
production-attestor fixture from #3 (a Twitter/socialdata claim, **not AdSense**) and a
throwaway testnet fee account. It proves the submit path works, nothing about AdSense.

| Step | Result |
| --- | --- |
| `verify_proof` on `CA3EMXR6…H54DU5`, genuine digest | **Ok**: [`b1553421…`](https://stellar.expert/explorer/testnet/tx/b1553421bae188c3713d346c8c6713b8465f1f41ce38b7836e2b84e6ed5ba7a4) |
| Same digest, one byte flipped (simulated) | `Error(Contract, #5) SignatureMismatch` |
| Signer | `0x244897572368eadf65bfbc5aec98d8e5443a9072` (production attestor) |

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

### It works — second run, `v0.1.0-dev.2`

| | |
| --- | --- |
| Release | [`v0.1.0-dev.2_sc_advance_forepay-advance_pkg0.1.0_cli28.1.0`](https://github.com/forepay-stellar/forepay/releases/tag/v0.1.0-dev.2_sc_advance_forepay-advance_pkg0.1.0_cli28.1.0) |
| Asset | `forepay-advance_v0.1.0.wasm`, 17,092 bytes |
| Hash | `f93c2c6ca59381b782033ccf83fd115a93a1d45bed80c3e5f4d38672f75c5f90` |
| Attestation | [`/attestations/55888340`](https://github.com/forepay-stellar/forepay/attestations/55888340) — signed through Sigstore, logged in Rekor |

The release name is generated by the action and includes the package version and the CLI version;
it is not the git tag. `gh release view v0.1.0-dev.2` finds nothing, which is confusing the first
time.

### ⚠️ For #15: deploy the wasm from the release, not a local build

The two builds do **not** produce the same bytes:

| Built by | stellar-cli | Size | Hash |
| --- | --- | --- | --- |
| My machine | 27.0.0 | 17,035 b | `af9ee02edc4a1209…` |
| The workflow | 28.1.0 | 17,092 b | `f93c2c6ca5938...` |

Same source, same commit, different toolchain, different bytes. This is the same class of problem
Sterun lost days to: wasm is reproducible **within** a toolchain and host, not across them.

**StellarExpert links a deployed contract to a commit by matching the on-chain wasm hash against the
attested one.** So deploying a locally built wasm leaves the contract unverified, with no error
anywhere — it simply never shows the link. #15 must download the asset from the release and deploy
*that file*, then record both the contract address and the release it came from here.

---

## STE-15 — the advance contract, live and verified on testnet (2026-10-15)

| | |
| --- | --- |
| **Contract** | [`CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS`](https://stellar.expert/explorer/testnet/contract/CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS) |
| Wasm | `a1b293ba8b9043b3f893b8fca050189b5c980d570db7d1b2e03a12f4c575ee36`, 27,894 bytes |
| Release it came from | [`v0.1.0_sc_advance_forepay-advance_cli28.1.0`](https://github.com/forepay-stellar/forepay/releases/tag/v0.1.0_sc_advance_forepay-advance_cli28.1.0) |
| Verifier | `CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5` — **Reclaim's own**, whose epoch holds the production attestor |
| USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Upload | [`cafaeed6…`](https://stellar.expert/explorer/testnet/tx/cafaeed6e693477a960a2183333961fafd026cf64b06758c7fc29f420c06cb36) |
| Deploy | [`722526e6…`](https://stellar.expert/explorer/testnet/tx/722526e6c469813baad413c82ea84d3fcff13f13723320338e2fcc9db8ca3ae7) |

This is **not** the development instance used for #10's end-to-end run. That one points at our
probe verifier, which accepts forged proofs by design. This one points at Reclaim's.

### Verified on StellarExpert

```json
{"status": "verified",
 "repository": "https://github.com/forepay-stellar/forepay",
 "commit": "2b2af4c64fc46f11271bcff735a238584c253463",
 "path": "sc/advance", "package": "forepay-advance"}
```

Anyone can now open the contract and read the exact source it was built from. That is
Deliverable 1's evidence, and it only works because the **release artifact** was deployed rather
than a local build.

**Three different hashes from one commit, and only one of them belongs on chain:**

| Build | stellar-cli | sha256 | What it is for |
| --- | --- | --- | --- |
| Laptop | 27.0.0 | `a91ccc1c…` | developer reference, verified by nothing |
| CI | 28.1.0 | `a98a4620…` | rebuilt on every push, proves the source is reproducible |
| **Release** | 28.1.0 | **`a1b293ba…`** | **deployed and attested** |

CI and the release differ despite the same toolchain because the release adds
`--meta source_repo=github:forepay-stellar/forepay` into the wasm — that metadata is what ties the
contract to the repository. So `sc/wasm-hashes.txt` is about reproducibility of the source, and is
**not** the hash to expect on chain.

### Upgradeable — exercised on this contract, not only the dev one

| Call | Result |
| --- | --- |
| `is_upgradeable` | `true` |
| `propose_upgrade` | `UpgradeProposed`, `executable_at` exactly 86,400 s ahead — [`6a71c864…`](https://stellar.expert/explorer/testnet/tx/6a71c864042c7ccc39d49d333869bdc3979be5578145fdf692d2e460ec02ba13) |
| `execute_upgrade` immediately | **`Error(Contract, #4)` `TimelockNotElapsed`** |
| `cancel_upgrade` | `UpgradeCancelled` — [`e2a2ed3c…`](https://stellar.expert/explorer/testnet/tx/e2a2ed3c1b2ee5ad8f5855bc989b91a812d805a12b3c8188c0c64c455f7d9f64) |
| `pending_upgrade` after | `null` |

Left with no pending proposal.

### It deploys in a safe state, and that is proven too

`claim_template` is `null`, so `request_advance` answers **`Error(Contract, #10)` `TemplateNotSet`** —
checked on chain. The contract cannot accept a proof until an admin pins the real AdSense template,
which arrives with #5's first live proof. One admin call, no code change.

### Still to do on this deployment

- **Fund it with testnet USDC.** `liquidity` reads `0`; until then `request_advance` would answer
  `#40 InsufficientLiquidity` even with a valid proof.
- **Pin the template** once #5 produces a real AdSense claim.
- Admin is `GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2`, a throwaway testnet key held
  locally in `.env`. Fine for a testnet demonstration; it is not a key anything of value should
  depend on.

### Funded — 5 USDC, and what that actually buys

| | |
| --- | --- |
| Transfer | [`6ce9ea33…`](https://stellar.expert/explorer/testnet/tx/6ce9ea337a969bc13fd3e9ae0fd81644c263fee8e00363f2a072c1a350d83a89) |
| `liquidity` | `50000000` stroops = **5 USDC** |
| Source | Sterish's developer account, which left it with 10.7 USDC |

**The amount is a constraint, not a choice.** There is no testnet USDC to be had:

- Circle's faucet is Captcha-gated and answers nothing to a script.
- The USDC SAC's admin is `CCELIKMY7RQ3BQERWSOQHLIVYC5E3UHLTLDYIO2NVS5XGFEXYER5UWSB`, a contract we do not
  control, so minting is not an option.
- Every testnet USDC we hold — 17.7 across two accounts — belongs to **Sterish**, where the
  rehearsal spends about 0.8 per run.

So 5 was taken and 10.7 left behind, rather than draining another project to fill this one.

#### What 5 USDC can serve

The advance is 25% of proven revenue, so the contract can currently pay a claim attesting at most
**20 USD of quarterly revenue**. Above that it answers `#40 InsufficientLiquidity` — correctly, and
before the nullifier is written, so a creator who hits it keeps their period.

For reference, the sizing rule against the cap:

| Attested quarterly revenue | Advance | Payable today? |
| --- | --- | --- |
| 20 USD | 5 USDC | yes, exactly |
| 100 USD | 25 USDC | no |
| 400 USD and above | 100 USDC (the cap) | no |

**The 100 USDC cap is unreachable on testnet with the funds that exist.** That is not a bug — the cap
is an upper bound, and it simply never binds here — but a demo meant to show a realistic advance
needs more USDC in the contract than we can currently get hold of.

#### What is needed, and from whom

Topping this up needs a human at [faucet.circle.com](https://faucet.circle.com) with its Captcha,
sending to `GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2` (which first needs a USDC
trustline — it has none today) and then transferring in. A script cannot do it.

---

## #18 — a proof bound to one borrower cannot be spent by another, on chain

Checked on **2026-10-15** against the development deployment
`CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID`.

One claim, bound to `GA2CD6PM…WWH2`, submitted twice with **identical bytes** and only the borrower
argument changed:

| Submitted for | Result |
| --- | --- |
| `GD73M4F7…RSZU` — someone else | **`Error(Contract, #14)` `VerifierRejected`** |
| `GA2CD6PM…WWH2` — the bound borrower | **Success** — [`162b534c…`](https://stellar.expert/explorer/testnet/tx/162b534cd0c540fe8916acfaf6fdc6ba2f7de7cb34abbd1fa804ba8fbeecf263) |

Same signature, same revenue figure, same publisher, same window, same timestamp. The only
difference is who asked.

**Why that is the right error.** `#14` is the verifier refusing, not a Forepay rule rejecting a
mismatch. The borrower is converted from the `Address` argument and hashed into `contextAddress`
inside the claim, so submitting for a different address builds a **different digest** — and the
attestor never signed that one. There is no check to forget and no branch to get wrong: the binding
is structural.

That is what makes proofs safe to hand around. A creator's proof sitting in a log, a screenshot or
someone else's inbox is worth nothing to anyone but them.

The unit test `a_proof_bound_to_one_borrower_cannot_be_spent_by_another` pins the same property, so
a refactor cannot quietly remove it.

### Why this did not wait for #17

The issue has #17 as a blocker, on the assumption the property could only be shown through the
relay. It cannot be weakened by the relay: the binding lives in the digest, and the relay only
decides which bytes get signed. Showing it directly against the contract is the stronger
demonstration and needed nothing from the front end.

---

## The three SOW negative cases, on chain (#24, #25, #26)

Run on **2026-10-15** against `CA3YGQHU42EL2TAOG7NJ5DDT5FLKKQNDWIUFFU6KV7QJHCFGLAGYXLID`.

> *"The negative cases are what separate a credible primitive demo from a happy-path mock. They
> show the safety logic actually holds."* — SOW §4.1

**Three different error codes, because they are three different code paths.** A single generic
refusal would prove far less.

| # | Case | Result |
| --- | --- | --- |
| **24** | A well-formed proof signed by a key that is **not** a registered witness | **`#14` `VerifierRejected`** |
| **25** | A genuine proof, submitted **twice** | first succeeds — [`d00cc83e…`](https://stellar.expert/explorer/testnet/tx/d00cc83ec5836adf2d013d33bbc6579d8b641fa8118fc5d39c97a40ccf4289c1); second **`#20` `NullifierSpent`** |
| **26** | A genuine proof, timestamped **2 hours** old against a 1-hour window | **`#12` `ProofStale`** |

`#14` comes from the verifier, `#20` from the nullifier registry, `#12` from the freshness check
before either runs. Each exercises a distinct mechanism.

### #24 — what "invalid" means here

The signature is **structurally valid secp256k1** over the correct digest; it is simply from a key
the epoch does not list. That is the case worth testing. A malformed signature only proves the host
rejects garbage before the contract gets a say — it is recorded in #2 and is deliberately *not* what
this case shows.

### #25 — the balance is the evidence, not the message

Only the first submission moved state. The second was refused **at simulation and never reached the
ledger**, so a replay costs an attacker a refusal rather than a fee and a half-applied write.

A refusal message alone would not be proof: a contract that disbursed and then reverted its own
ledger row would print the same thing and the money would be gone.

### #26 — and the limit of what it proves

**What it shows:** a proof older than `MAX_PROOF_AGE_SECONDS` (3,600) is refused, measured against
`env.ledger().timestamp()` — the ledger close time, the only clock a contract has.

**What it does not show, and must not be read as:**

- **It is not proof that a forwarded proof is refused.** A proof forwarded and submitted *inside*
  the hour is accepted — and is worth exactly what the borrower's own proof is worth, because
  `contextAddress` binds it to them (#18).
- **It is not replay protection.** That is #25, and it has no time limit.

Sterun's equivalent step nearly overstated the matching claim about a QR screenshot, so the bound is
written beside the result rather than left for a reviewer to infer.

---

## #63 — `sizing()`, and the first upgrade proposed on the production contract (2026-10-16)

`sizing()` returns the constants `quote()` sizes an advance from, so the front end reads them
instead of hard-coding them. Merged in #65; `docs/interface.md` §5 carries the interface.

Getting it onto a deployed contract is the first time the upgrade path has been exercised **on the
production contract with a real reason**, rather than as a drill. The timelock is doing its job
here: the code is written, reviewed and released, and it still cannot take effect until tomorrow.

### Three hashes, one commit — again

| Where built | stellar-cli | sha256 |
| --- | --- | --- |
| laptop, `aarch64-apple-darwin` | 27.0.0 | `d8a55ce21baab9af8259ccdedd8ddb29421e1ee01c2b938a7c336a2a36c55e89` |
| CI, `x86_64-unknown-linux-gnu` | 28.1.0 | `5d9ed165cafcdd45235dbacfdf4c00667b0f123781ee9c6890d7cd4465419914` |
| **release artifact** (`v0.2.0`) | 28.1.0 | **`e5626890659fa2ad44f02f3752a37235768ee78e242d636c820d2b1581725dd6`** |

Only the third one may go on chain. StellarExpert matches the deployed wasm against the attested
release artifact, so a locally built binary — byte-identical source, different linker ordering —
would deploy fine and then fail verification, which is the trap recorded under "⚠️ For #15" above.

### Transactions

| Step | What | Transaction |
| --- | --- | --- |
| 1 | Tag `v0.2.0` → release + StellarExpert attestation | [run 38885744796](https://github.com/forepay-stellar/forepay/actions/runs/38885744796) |
| 2 | Upload the release wasm to testnet | [`1399a4106df9…`](https://stellar.expert/explorer/testnet/tx/1399a4106df9fffb2d1d2fb1733f0a00d913bade3e21688dcfdb16879d77f6e5) |
| 3 | `propose_upgrade` on production `CCQFL2Q6…I2HS` | [`937a655a9aac…`](https://stellar.expert/explorer/testnet/tx/937a655a9aac7dc40cc9c328c176ca13d0823909f764aa3c739444da35f4ef29) |
| 4 | `propose_upgrade` on dev `CD25Q4TD…HQN4` | [`761b394c4349…`](https://stellar.expert/explorer/testnet/tx/761b394c4349e37ea726f4f26b42f95caeb4b07cb34bf1eeea2575168a068830) |
| 5 | `execute_upgrade` on both | **pending — not before 2026-10-17 10:16 UTC** |

`executable_at` came back as `1792232197` (production) and `1792232217` (dev): 86,400 seconds after
each proposal, as `UPGRADE_DELAY_SECONDS` sets. Anyone can read the pending proposal and its
deadline with `pending_upgrade()` — which is the entire reason the delay exists, and why that
getter is public.

### What is not claimed yet

The upgrade has **not** taken effect. `sizing()` is not callable on either contract until step 5,
and the deployed wasm is still `a1b293ba…` on production. The verified-source link on StellarExpert
also still points at the `v0.1.0` build; it moves to the `v0.2.0` artifact when the upgrade
executes, and that will be recorded here with the tx rather than assumed.
