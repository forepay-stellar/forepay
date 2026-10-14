# Forepay — working notes for this repository

zkTLS-proven AdSense revenue sized into a USDC advance on Stellar testnet.
Scope and the build plan: issue #30. On-chain facts and evidence: `docs/deployments.md`.

## Repository layout — decided in #1, do not relitigate

**Two workspaces, one per language, each with exactly one lockfile.**

| Workspace | Root | Members | Lockfile |
| --- | --- | --- | --- |
| pnpm | `/` (`pnpm-workspace.yaml`) | `be`, `fe`, `landing-page` | `pnpm-lock.yaml` |
| Cargo | `sc/` (`sc/Cargo.toml`) | `sc/advance`, `sc/reclaim-claim` | `sc/Cargo.lock` |

Why a pnpm workspace rather than four independent projects:

- **One lockfile, one package manager.** The scaffold had a pnpm lock in `fe/` and npm locks
  in `be/` and `landing-page/`. Mixed lockfiles mean each package resolves its own versions
  and every cross-package change is a tax. pnpm because `fe` was already on it.
- **One CI install.** `pnpm install --frozen-lockfile` once, then `pnpm lint|typecheck|test|build`
  run across every package. A package added later is covered without touching CI.
- **Packages stay runnable on their own.** `cd fe && pnpm dev` still works; the workspace
  only changes where dependencies are resolved.

Why the Cargo workspace sits in `sc/` and not at the repo root:

- Rust stays under `sc/`, so the TypeScript side never sees `target/` or a `Cargo.toml`.
- `release.yml` builds with `relative_path: sc/advance`; that path is unchanged.
- One `Cargo.lock` means the contract and `reclaim-claim` (which it will link) resolve the
  same dependency versions. `[profile.release]` lives in `sc/Cargo.toml` because Cargo
  ignores profiles in member manifests.

Not in either workspace: `tools/` (stdlib-only Python) and `docs/`.

## Toolchain — pinned, change only on purpose

| Tool | Pin | Where |
| --- | --- | --- |
| Rust | `1.95.0`, with `clippy`, `rustfmt`, target `wasm32v1-none` | `sc/rust-toolchain.toml` |
| soroban-sdk | `29` (testnet is protocol 29; SDK major tracks protocol major) | `sc/Cargo.toml` `[workspace.dependencies]` |
| stellar-cli | `28.1.0` (latest release; same version `release.yml` builds with) | `ci.yml`, `release.yml` |
| pnpm | `12.3.4` | root `package.json` `packageManager` |
| Node | `24` in CI, `>=22` required | `ci.yml`, `engines` |

`soroban-sdk 29` refuses a plain `cargo build` for wasm: build the contract with
`stellar contract build`, which needs stellar-cli ≥ 25.2.0.

Install scripts are allow-listed in `pnpm-workspace.yaml` (`allowBuilds`). pnpm fails the
install on an undecided one; decide it there, in review, with a comment saying why.

## Commands

```bash
# Rust (from sc/)
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-features --locked
stellar contract build --package forepay-advance --locked

# TypeScript (from the repo root)
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# Tools
python3 -I tools/secp256k1_probe.py
```

CI (`.github/workflows/ci.yml`) runs exactly these on every push and pull request. The Rust and
TypeScript claim-digest tests share `tools/fixtures/real-reclaim-proof.json`; both jobs must keep
running or that cross-check silently disappears.

## Working agreement (from every issue)

1. One issue, one owner.
2. Branch per issue, named in the issue.
3. MCP Stellar Raven for any Stellar/Soroban fact that gets written down.
4. Merge through PR review by Axel (PM); no self-merge.
5. Deploys need evidence (contract address or tx hash on stellar.expert) in `docs/deployments.md`.
6. Secrets live in `.env` (gitignored, `chmod 600`): never printed, committed or pasted.
   Only public `G…` and `C…` addresses appear anywhere.
7. Issues, commits and PRs in English.
