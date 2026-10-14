# Licensing

**Forepay is AGPL-3.0-only.** The full text is in [`LICENSE`](../LICENSE).

## Why AGPL, and why this was not a free choice

The proof relay depends on [`@reclaimprotocol/zk-fetch`](https://github.com/reclaimprotocol/zk-fetch),
which is **AGPL-3.0**. AGPL is a strong copyleft licence with a network clause: software that
conveys it, or offers it over a network, must offer its own source under the same terms.

Forepay cannot drop that dependency — zkFetch *is* how a claim gets produced, and replacing it would
mean reimplementing Reclaim's attestor protocol, which is neither in scope nor sensible. So the
licence of the dependency sets the licence of the project, and AGPL-3.0 is the honest fit rather
than a preference.

Raised by @Lin1er on PR #35 while wiring the provider, when the repository still had no licence file
at all. A public repository with no licence is **not** permissively licensed — it is all-rights-
reserved by default, which means nobody could legally use, fork or build on it. For an Instawards
submission whose evidence is "here is the public repo", that was an awkward gap.

## What this means in practice

- **Anyone may use, study, modify and redistribute Forepay**, including commercially.
- **If you run a modified Forepay as a network service, you must offer your users its source**
  under AGPL-3.0. That is the clause that distinguishes AGPL from GPL, and it is the one that
  matters for a hosted lending pipeline.
- **Combining Forepay with closed-source code and distributing or hosting the result is not
  permitted.** If that is ever wanted, the dependency has to go first.

## Scope

Everything in this repository: the Soroban contracts (`sc/`), the backend and relay (`be/`), the
creator front end (`fe/`), the landing page (`landing-page/`) and the tooling (`tools/`).

Declared in `sc/Cargo.toml` as a workspace field inherited by both crates, and in each
`package.json` as `AGPL-3.0-only`.

## Not covered

- **Reclaim's own contracts and SDKs** carry their own licences; see their repositories.
- **The fixture in `tools/fixtures/real-reclaim-proof.json`** is a published sample proof from a
  third-party repository, included as test data with its source recorded in the file.
