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
  "horizonUrl": "https://horizon-testnet.stellar.org",
  "contracts": {
    "reclaimVerifier": "CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5",
    "usdcSac": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "advance": "CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS"
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

---

## #62 — the production contract funded to 105 USDC (2026-10-16)

`liquidity()` on `CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS` now reads
**1,050,000,000 stroops = 105 USDC**, up from 5. `quote("999999.99")` returns `1,000,000,000`, so
the contract can pay **one advance at the full 100 USDC cap** and still have 5 USDC left — the first
time that has been true.

### Why five accounts rather than one

Circle's faucet is reCAPTCHA-gated with no API, and it gives **20 USDC per address, per chain, every
two hours**. Topping one address up to 100 USDC is five visits spread over eight hours, with the
waiting being the entire cost.

So the Captcha-free part was automated — five throwaway keypairs, friendbot XLM, a USDC trustline on
each, all verified by reading `balance` back as `0` rather than `#13 TrustlineMissing` — and the
human did five faucet requests back to back with no cooldown between them. Keys are in `.env`
(gitignored, `chmod 600`) as `FOREPAY_TOPUP_1..5_SECRET`.

### The sweep

Each account held exactly 200,000,000 stroops after the faucet, and transferred all of it to the
contract through the USDC SAC.

| From | Transaction |
| --- | --- |
| `GBURVV7U…YFCT` | [`30907065dbc2…`](https://stellar.expert/explorer/testnet/tx/30907065dbc2e14b9b11e5dc71aef91004c9fb181f4ed44106cf7ac5cbed8c29) |
| `GDAM26EH…25CQ` | [`de516ed50b46…`](https://stellar.expert/explorer/testnet/tx/de516ed50b4644b8d8878c7397765e8873ceff58fbe77483956b92e3a691e732) |
| `GCXMJQSU…IUZD` | [`685b8614d250…`](https://stellar.expert/explorer/testnet/tx/685b8614d250dde7449be2a86b5836a0ff406e35bfae2f0eb6f331db647880c6) |
| `GDGCRWII…RQZO` | [`a5bb85628ff0…`](https://stellar.expert/explorer/testnet/tx/a5bb85628ff0bf1ab6387fb4ea89d6f55f37718991561f2d9e56406809262ee9) |
| `GCT6BJPK…M7XU` | [`2ccabdc547c0…`](https://stellar.expert/explorer/testnet/tx/2ccabdc547c001c076f4618da9e9ed221b813acb5d36831cae0994d2357994b0) |

The balance is the evidence, not the five receipts: `liquidity()` moved from 50,000,000 to
1,050,000,000, a delta of exactly 1,000,000,000, which is the only reading under which all five
landed and none was double-counted.

### What this does not fix

The contract still answers `10 TemplateNotSet` for every proof — funding is not the blocker on the
creator flow, #5 and #61 are. What 105 USDC buys is that when the template is pinned, the demo (#28)
and the Chapter Lead run (#29) can show a realistic advance instead of a 5 USDC one.

No trustline was needed on the contract itself: a `C…` address holds a SAC balance in contract
storage, and trustlines are a classic-account concept. Only the five `G…` senders needed one.

---

## #63 — the upgrade executed, and the storage rule held (2026-10-17)

The timelock ran. `execute_upgrade` on both contracts, ~8 hours after `executable_at`:

| Contract | Transaction |
| --- | --- |
| production `CCQFL2Q6…I2HS` | [`443a902a9db5…`](https://stellar.expert/explorer/testnet/tx/443a902a9db5b10c67a001e385690fe62c2efbe7c60e5b48e6d05ab309b7ef69) |
| dev `CD25Q4TD…HQN4` | [`4db68f04c267…`](https://stellar.expert/explorer/testnet/tx/4db68f04c2670af7089fd962721c08d45b0361fbf9701a420be1e53a23401b2b) |

`sizing()` now answers on both:

```json
{"rate_num":"25","rate_den":"100","cap_stroops":"1000000000",
 "min_stroops":"10000000","stroops_per_cent":"100000"}
```

`pending_upgrade()` is back to `null` on both — the proposal is consumed, not left armed.

### Still verified, against the new commit

StellarExpert's API for the production contract, read after the upgrade:

```json
{"wasm":"e5626890659fa2ad44f02f3752a37235768ee78e242d636c820d2b1581725dd6",
 "validation":{"status":"verified",
               "repository":"https://github.com/forepay-stellar/forepay",
               "commit":"2b545287d1285b202cb7ec8cf5e58061b6adb0b2",
               "path":"sc/advance","package":"forepay-advance"},
 "versions":2}
```

`2b54528` is the merge commit of #65. So the chain of custody holds across an upgrade: the deployed
wasm is the release artifact, the release artifact is attested to a commit, and that commit is in
this repository. `versions: 2` is StellarExpert counting the upgrade.

This is the part that would have broken silently if the wasm had been built locally instead of
pulled from the release — same source, different linker ordering, different hash, and the contract
would read as unverified with no error anywhere to explain it.

### The storage rule, tested rather than asserted

`lib.rs` opens with "storage is append-only forever". An upgrade is the only thing that can disprove
it, so the dev contract's pre-upgrade state was read back afterwards:

| Read | Before | After |
| --- | --- | --- |
| `claim_template()` | four literal parts | unchanged |
| `is_spent(d0cd01df…c839)` | `true` | `true` |
| `advance(d0cd01df…c839)` | principal 10000000, repaid 10000000, window 2026-07-01 → 2026-09-30 | identical |
| `liquidity()` | 20000000 | 20000000 |
| `admin()` | `GA2CD6PM…WWH2` | unchanged |
| production `liquidity()` | 1050000000 | 1050000000 |

A spent nullifier that came back `false` after an upgrade would mean a creator could draw a second
advance against revenue they had already borrowed against. It did not, and now that has been checked
once on a live ledger rather than reasoned about.

### What is still not true

The production contract continues to answer `10 TemplateNotSet`. `sizing()` being live changes what
the front end can read; it does not unblock the creator flow, which is #5 and #61.

---

## #76 — the claim encoding was wrong, and only the provider could have shown it (2026-10-20)

`docs/interface.md` froze a claim shape before any real AdSense response existed. In two places the
shape it froze was one the AdSense API cannot produce, so **every real proof would have been
refused** — with a bare `ClaimMismatch` and no indication of which byte was wrong.

Found by @Lin1er on #6 while building the provider, by comparing the frozen document against
Google's API rather than against our own contract. Verified here against Google's reference before
anything was changed:

- [`accounts.reports.generate`](https://developers.google.com/adsense/management/reference/rest/v2/accounts.reports/generate):
  `startDate` and `endDate` are **`object (Date)`**, not strings.
- [`Date`](https://developers.google.com/adsense/management/reference/rest/v2/Date):
  `{year, month, day}` as **integers**, flattened by the REST transport into
  `startDate.year=2026&startDate.month=7&startDate.day=1`. Unpadded — `7`, never `07`.

There is no string date form in that API, so `?startDate=2026-07-01` describes a request Google
cannot serve.

### Three hashes again, one commit

| Where built | stellar-cli | sha256 |
| --- | --- | --- |
| laptop, `aarch64-apple-darwin` | 27.0.0 | `5ccdbdb774d76ab28322fe7b991da7b0a412968ffffec45b03fe73a8c2902c36` |
| CI, `x86_64-unknown-linux-gnu` | 28.1.0 | `ea868981fa1cb4dae52f6237956056a913c8a7baff3ebdef65df0fc5ef32dd0b` |
| **release artifact** (`v0.3.0`) | 28.1.0 | **`ade4687f35f05f7366cb10284f593b578199106f82f23e61cd5d583bec227641`** |

### Transactions

| Step | What | Transaction |
| --- | --- | --- |
| 1 | Tag `v0.3.0` → release + StellarExpert attestation | [release](https://github.com/forepay-stellar/forepay/releases/tag/v0.3.0_sc_advance_forepay-advance_pkg0.1.0_cli28.1.0) |
| 2 | Upload the release wasm | [`5323fbf0ef71…`](https://stellar.expert/explorer/testnet/tx/5323fbf0ef71133529788fbb6b297134f607b9962e50ee1cdb7b829d517db378) |
| 3 | `propose_upgrade`, production `CCQFL2Q6…I2HS` | [`33d30715d56f…`](https://stellar.expert/explorer/testnet/tx/33d30715d56f4baa4c5ebbf7dca9ae171b88ea9a11167dbece920539cd08d03f) |
| 4 | `propose_upgrade`, dev `CD25Q4TD…HQN4` | [`593d91a7fa0a…`](https://stellar.expert/explorer/testnet/tx/593d91a7fa0aa6421f70895c50644cee1b75309e1894ed8e2a5183f8078ecbeb) |
| 5 | `execute_upgrade` on both | **pending — not before 2026-10-21 08:50 UTC** |
| 6 | Re-pin the dev template with the eight new parts | after step 5 |
| 7 | Re-run the rehearsal end to end | after step 6 |

`executable_at` is `1792572617` and `1792572637`: 86,400 seconds out, as `UPGRADE_DELAY_SECONDS`
sets. This is the second real use of the upgrade path, and the first one driven by a defect rather
than an addition.

### The dev contract's pinned template is now invalid, on purpose

`set_claim_template` refuses a four-part template after the upgrade. The dev contract currently has
one pinned, so between step 5 and step 6 its `verify_claim` will refuse everything. That window is
deliberate: accepting the old shape and failing per proof would hide the cause behind the least
readable error in the pipeline.

### The fixture was the actual failure

`tools/fixtures/forepay-claim.json` was a hand-pasted blob. Nobody could re-derive it, so when the
encoding changed there was no mechanism by which anyone would notice it had gone stale — the digest
tests would have kept passing against bytes that described nothing. It is now produced by
`tools/make_claim_fixture.py`, and CI runs that script with `--check`.

The real attestor vector, `tools/fixtures/real-reclaim-proof.json`, is untouched. That one is signed
by Reclaim's production attestor and proves the digest chain itself; this one proves the contract
rebuilds the Forepay-specific bytes.

---

## #16 / #17 — the API and the proof relay, public (2026-10-20)

`https://api-forepay.jameshub.fun` runs `pnpm -C be start`: the read routes (#16) and the proof relay
(#17), as documented in `docs/api.md`.

| | |
| --- | --- |
| Deployed tree | `feat/17-proof-relay` (`62d2cff`, which carries #16) merged with `feat/4-adsense-provider` (`eb6e078`, #74) |
| Host | Node 24, one LXC (2 cores, 2 GB), behind a Cloudflare Tunnel; a systemd unit restarts it on failure |
| `/config` | the recorded addresses, `"recorded": true`, `"relay": true` |
| `/ready` | `{"status":"ok"}` against `https://soroban-testnet.stellar.org` |
| CORS | `http://localhost:3000` and `https://app.forepay.xyz` (#22), since 2026-10-23. Checked: both get `Access-Control-Allow-Origin` on `GET /transactions` and on the `POST /proofs` preflight; any other origin gets none |
| Secrets | the Reclaim app id and secret, in `be/.env`, `chmod 600`, owned by the service user. No Stellar secret key is on the host: the relay never signs. |

Checked from outside:

```
GET /health                                   200 {"status":"ok"}
GET /config                                   recorded: true, relay: true, advance CCQFL2…I2HS
GET /transactions?borrower=GA2CD6…WWH2        the USDC trustline (17a0d45d…); its advances went to the dev contract
GET /ready                                    {"status":"ok","latestLedger":5288882}
```

The proving path works on this host. `prove:smoke` (#5's smoke request, Horizon's root, bound to
`GA2CD6…WWH2`) produced a claim in **54 s**, signed by the production attestor
`0x244897572368eadf65bfbc5aec98d8e5443a9072`. `verify:proof` simulated against Reclaim's verifier
`CA3EMXR6…H54DU5`: genuine digest **Ok**, one byte flipped `Error(Contract, #5) SignatureMismatch`.
The node process stayed under 500 MB.

### What is not claimed yet

- No AdSense proof has gone through it: there is no `READY` AdSense account (#5, #77).
- The tree is not `main`. Redeploy from `main` once #66, #73 and #74 merge.

> **Updated while merging this (2026-10-20).** The second half of the first bullet — *"the contract
> cannot rebuild a real AdSense claim until the contract side of #6 lands"* — was true when written
> and is not now: #76 landed in #79, and #74 landed too. What is left is only the account. The
> deployed wasm carrying the new encoding is still behind its 24-hour timelock; `execute_upgrade`
> is not before 2026-10-21 08:50 UTC.

> **Updated 2026-10-25: the host runs `main`.** The second bullet no longer holds. The host was
> already on `main` at `29d6719`, and was fast-forwarded to `03da644` (#89, #91, #92) and restarted.
> The only runtime change is #92's wording for an account that is not `READY`; the lockfile did not
> change, so nothing was reinstalled. Checked from outside after the restart:
>
> ```
> GET /health                                   200 {"status":"ok"}
> GET /config                                   recorded: true, relay: true, advance CCQFL2…I2HS
> GET /ready                                    {"status":"ok","latestLedger":5382728}
> OPTIONS /proofs, Origin https://app.forepay.xyz   Access-Control-Allow-Origin: https://app.forepay.xyz
> OPTIONS /proofs, any other origin                 no Access-Control-Allow-Origin
> ```

> **Updated 2026-10-27: the host runs `feat/admob-relay` at `3102f64` (#100, not merged yet).**
> @Lin1er's call, so the AdMob path (#95) and the `empty` code (#104) can be tried against the real
> relay before #100 merges. `main` is an ancestor of it, so nothing on `main` is missing. The AdSense
> request is byte for byte what it was. The lockfile did not change. The host is on a detached
> `HEAD`, and goes back to `main` when #100 merges. Checked from outside after the restart:
>
> ```
> GET /health                                   200 {"status":"ok"}
> GET /config                                   relay: true, advance CCQFL2…I2HS
> GET /ready                                    {"status":"ok","latestLedger":5415910}
> POST /proofs, source "nope"                   400 source, when given, must be "adsense" or "admob"
> POST /proofs, source "admob", fake token      202, then failed with code token, naming admob.readonly
> GET /health, Origin https://app.forepay.xyz   Access-Control-Allow-Origin: https://app.forepay.xyz
> ```
>
> An AdMob proof made here cannot become an advance yet. The deployed contract has no AdMob template
> (#94).

> **Updated 2026-10-29 23:35 UTC: `feat/admob-relay` rebased onto `main` and redeployed, at `1095ba6`.**
> `main` now carries #103's relay half, so the audit refuses a proof whose `owner` is not this relay's
> Reclaim app, for AdSense and AdMob alike. The lockfile did not change. Checked from outside after the
> restart:
>
> ```
> GET /health                                   200 {"status":"ok"}
> GET /config                                   recorded: true, relay: true, advance CCQFL2…I2HS
> GET /ready                                    {"status":"ok","latestLedger":5458654}
> POST /proofs, source "admob", fake token      202, then failed with code token
> OPTIONS /proofs, Origin https://app.forepay.xyz   Access-Control-Allow-Origin: https://app.forepay.xyz
> ```
>
> #107 (history after #94's leading `source`) is not on the host yet. It has to be there before #106's
> `execute_upgrade`.

> **Updated 2026-10-30 13:35 UTC: `feat/admob-relay` rebased onto `main` with #106, #107 and #104, and
> redeployed, at `8097128`.** #107 is on the host (`requestArgs` in `be/src/chain/history.ts`, and
> `354d9e0` is an ancestor), so step 1 of #106's upgrade order is done. The lockfile did not change.
> Checked from outside after the restart:
>
> ```
> GET /health                                   200 {"status":"ok"}
> GET /config                                   recorded: true, relay: true, advance CCQFL2…I2HS
> GET /ready                                    {"status":"ok","latestLedger":5468742}
> GET /advances?borrower=GA2C…WWH2              200 []
> POST /proofs, source "admob", fake token      202, then failed with code token
> OPTIONS /proofs, Origin https://app.forepay.xyz   Access-Control-Allow-Origin: https://app.forepay.xyz
> ```

---

## #76 executed, the dev template re-pinned, and a fee worth writing down (2026-10-25)

The 24-hour timelock from 2026-10-20 ran out on 2026-10-21; this executed four days later, which is
late on my part and not a property of the contract.

| Step | Transaction |
| --- | --- |
| `execute_upgrade`, production `CCQFL2Q6…I2HS` | [`89f7a4cdeadf…`](https://stellar.expert/explorer/testnet/tx/89f7a4cdeadf957b9fc4ba4239da18abd542293aa6133cabe27958463b387c61) |
| `execute_upgrade`, dev `CD25Q4TD…HQN4` | [`d11213447e80…`](https://stellar.expert/explorer/testnet/tx/d11213447e80c8fa8a52f2b37310d6dc1694da3f2e43c4de1ade44110fe9d5bf) |
| `set_claim_template`, dev, **eight parts** | [`0143e6f080ab…`](https://stellar.expert/explorer/testnet/tx/0143e6f080ab83b1aaa802b1596534d10001d4af03be15cff239f8bb72288374) |

Both contracts now run wasm `ade4687f35f05f7366cb10284f593b578199106f82f23e61cd5d583bec227641`,
the `v0.3.0` release artifact. State survived again: `admin`, `liquidity` and `is_upgradeable` all
read back unchanged, and the old four-part template was still readable between the upgrade and the
re-pin.

The rehearsal was re-run end to end against the new encoding: **7/7 GREEN**,
`tools/runs/2026-10-25T114611Z/`. B.1 now runs in its inverted form — a proof bound to someone else,
submitted as ours — because #81 made the original direction unreachable.

### `set_claim_template` cost 21,370 XLM, and that is not a typo

The call simulated successfully and then failed to submit with `TxInsufficientBalance` against an
account holding 9,162 XLM. The CLI reported the reason plainly:

```
⚠️ Wrapping transaction with a fee bump transaction due to a fee of 21370.9566228 XLM.
```

It is **rent**, not computation. `Self::bump()` extends the instance entry's TTL by
`180 * 17_280 = 3,110,400` ledgers on every admin write — which is exactly `max_entry_ttl` on this
network — and the instance entry grew when the template went from four parts to eight. Rent is
charged per kilobyte per ledger, so a bigger entry pushed to the maximum lifetime is the whole bill.

On testnet this is free to fix: friendbot caps one grant per account, so the balance came from
sweeping three of the #62 top-up accounts, which were idle after the USDC sweep. The transaction
then went through unchanged.

**This would be absurd on mainnet, and it is a real finding rather than a testnet curiosity.**
Extending to the network maximum on every admin call is a design that charges six months of rent to
change one stored value. A contract handling real money should extend by what it needs and let a
caller top up the TTL separately — `extend_ttl` is callable by anyone, which is precisely why TTL
must never be load-bearing for security (it is not here; nothing in this contract treats expiry as
a permission). Recorded here rather than silently paid, because the number is the kind a reviewer
would find and we should have found first.

---

## #81 proposed: borrower authorisation (2026-10-25)

The second upgrade of the day, queued behind #76 because the contract allows one pending proposal
at a time.

| Step | Transaction |
| --- | --- |
| Release `v0.4.0`, wasm `481e7f16…` | [release](https://github.com/forepay-stellar/forepay/releases/tag/v0.4.0_sc_advance_forepay-advance_pkg0.1.0_cli28.1.0) |
| Upload the release artifact | [`6f43d8266876…`](https://stellar.expert/explorer/testnet/tx/6f43d8266876a798f1551cdc146b57fb264ac15f901c297814df2bad857a615d) |
| `propose_upgrade`, production `CCQFL2Q6…I2HS` | [`98403335052b…`](https://stellar.expert/explorer/testnet/tx/98403335052b23d28158db6187f367d63c43bfc5e675aa90cabcf67398ebac02) |
| `propose_upgrade`, dev `CD25Q4TD…HQN4` | [`3077b27b40f5…`](https://stellar.expert/explorer/testnet/tx/3077b27b40f5bb50b583102c99b86f7512831cf6ef2dc6f52ff977abb3d6a9ed) |
| `execute_upgrade` | **pending — not before 2026-10-26 11:58 UTC** |

`executable_at` is `1793015932` and `1793015937`.

Until it executes, both contracts still accept `request_advance` and `verify_and_reserve` **without
the borrower's authorisation**. On testnet, where every proof in existence is signed by a key
published in this repository, the only creator who could be harmed by that is us — but it is the
live state and it is stated rather than implied.

---

## #22 — the creator front end, public (2026-10-23)

**<https://app.forepay.xyz>** serves `fe/` from `main`, on testnet, with no login.

| | |
| --- | --- |
| Host | Vercel, project `forepay-vue5` in @AncungAulia's team, root directory `fe`. Each merge to `main` that touches `fe/` redeploys it |
| Deployed commit | `9b81d82` (#71 merged). `9538cf4` after it touched only `landing-page/`, and Vercel skipped it as not affected |
| Domain | `app.forepay.xyz`, a CNAME to Vercel at the domain's DNS |
| Contract | `NEXT_PUBLIC_ADVANCE_CONTRACT_ID` = `CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS`, the production contract above |
| USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`, `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| RPC | `https://soroban-testnet.stellar.org` |
| API | `https://api-forepay.jameshub.fun` (#16) |
| Not set | `NEXT_PUBLIC_RELAY_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the relay client is #75, not merged), `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`, `NEXT_PUBLIC_E2E` |

Checked by the rendered page, not by a status code (#22):

- In Chrome, with a Freighter testnet wallet connected: the onboarding step that asks an unfunded
  wallet for test XLM; then, once the wallet was funded and allowed USDC, 2a "Get an advance" with
  the wallet card (Freighter, Stellar testnet, "Can receive USDC: Yes") and the rule read from the
  contract ("A quarter of your proven revenue, up to 100 USDC"); Repayment and History reading
  "No advance yet" from the API. No console errors.
- In headless Chromium, with no wallet, at 1440 and 390: "Before you start", "Connect your wallet",
  and "Install a Stellar wallet" after pressing Connect wallet. No console errors.
- The API answers the deployed origin: `GET /config` with `Origin: https://app.forepay.xyz` returns
  `access-control-allow-origin: https://app.forepay.xyz`, as does the preflight. The `CORS` row of
  the #16 / #17 entry above is no longer only `localhost`.

The screenshots are in [`docs/evidence/`](evidence/).

### What is not claimed yet

- **Proving revenue does not reach the offer on this deployment.** With `NEXT_PUBLIC_RELAY_URL`
  empty, 2a proves against the mock in `fe/src/lib/reclaim/mock.ts`, and the contract refuses its
  proofs. No screenshot of the offer, signing, a sent advance or a repayment is taken from it.
  The relay client is #75; a real proof also needs a `READY` AdSense account with revenue (#77).
- **WalletConnect is off.** Without a project ID, only the browser extensions (Freighter, xBull,
  Rabet) are offered, although "Connect your wallet" mentions mobile wallets through WalletConnect.
