//! Forepay advance contract — the skeleton (#8).
//!
//! What this file holds today: the constructor, admin control, the upgrade path, and
//! the error table. The advance logic itself arrives in #9 to #13, and the error codes
//! those tickets need are **reserved** below rather than left to be invented, because
//! a renumbered error code silently rewrites the meaning of every failure already
//! recorded in evidence.
//!
//! # Upgradeability
//!
//! Upgradeable, behind a **timelock**: `propose_upgrade` → wait → `execute_upgrade`,
//! with `cancel_upgrade` in between and `renounce_upgradeability` as the one-way door
//! once the demo is frozen.
//!
//! The reason for the timelock rather than a bare admin upgrade: a contract that can be
//! replaced in one transaction is a contract whose entire security argument reduces to
//! "trust the admin key". The delay is what gives anyone watching a chance to notice.
//! Sterun reached the same conclusion mid-grant and needed three in-place upgrades
//! afterwards, which is why this is decided now rather than when it is first needed.
//!
//! Three rules that outlive this file:
//!
//! * **Storage is append-only forever.** Never remove, rename or retype a key. An
//!   upgraded wasm reads the old ledger entries; a retyped key is a silent corruption.
//! * **`__constructor` does not re-run on upgrade.** Anything a later version needs
//!   must have a default or a migration.
//! * **Error codes are never renumbered.** Add to the reserved blocks; never reuse.

#![no_std]
// `verify_claim` and `verify_and_reserve` take ten arguments, and `#[contractimpl]`
// expands them again into a generated client, so a per-function allow does not reach the
// macro's output.
//
// A struct would be better — two adjacent `String` parameters that mean different things
// (`window_start`, `window_end`) are easy to transpose. Not changing it today: the
// interface was frozen hours ago in docs/interface.md §8 and @Lin1er and @AncungAulia were
// told to build against it. #12 assembles `request_advance` and is the right moment to
// bundle the claim fields into one type, as a single coordinated change rather than two.
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    ContractExecutable, Env, String, Vec,
};

mod claim;
mod reclaim;

pub use claim::{CONTEXT_MESSAGE, PROVIDER};

/// Storage keys. Append-only: a new variant may be added, none may ever be removed,
/// renamed or given a different payload type.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The account allowed to propose and execute upgrades.
    Admin,
    /// Reclaim's deployed verifier. Cross-contract target for #9.
    Verifier,
    /// The USDC Stellar Asset Contract advances are paid in. Used from #12.
    Usdc,
    /// Set once `renounce_upgradeability` has been called. Absent means still upgradeable.
    UpgradeRenounced,
    /// The pending upgrade, if one has been proposed.
    PendingUpgrade,
    /// Literal segments of the Reclaim request template (#6 §2). Set by the admin once
    /// the first live proof exists; until then `verify_claim` refuses.
    ParamsTemplate,
    /// Reclaim's provider hash for the AdSense provider, as it appears in the context.
    ProviderHash,
    /// One spent nullifier. **Persistent on purpose** — see `nullifier_of`.
    Nullifier(BytesN<32>),
}

/// A claim whose signature has been checked against Reclaim's verifier.
///
/// Every field here came out of the bytes that were signed. Nothing in it was taken from
/// a caller parameter that the attestor did not cover.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedClaim {
    /// Who the advance is for, from `contextAddress` inside the signed context.
    pub borrower: Address,
    /// The attested figure, still a decimal string. #11 parses it to fixed point.
    pub revenue_usd: String,
    /// AdSense publisher id. With the window, this is the nullifier key (#10).
    pub pub_id: String,
    pub window_start: String,
    pub window_end: String,
    /// When the attestor signed, seconds. Already checked for freshness.
    pub timestamp_s: u64,
}

/// A proposed upgrade, and the earliest moment it may be executed.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingUpgrade {
    pub wasm_hash: BytesN<32>,
    /// Ledger timestamp before which `execute_upgrade` refuses.
    pub executable_at: u64,
}

/// How long a proposed upgrade must sit before it can be executed.
///
/// 24 hours. Long enough that a surprise upgrade is visible to anyone watching the
/// contract, short enough to fix something inside a 30-day grant. Deliberately a
/// constant rather than admin-settable: an admin who can shorten the delay has no delay.
pub const UPGRADE_DELAY_SECONDS: u64 = 24 * 60 * 60;

/// Error codes, assigned once and never renumbered.
///
/// Blocks are reserved so that #9 to #13 can add their own without touching anything
/// already in use. An unused reserved number is free; a reused one is a bug that only
/// shows up in an evidence file somebody already trusted.
///
/// | Range | Owner |
/// |-------|-------|
/// | 1–9   | lifecycle, admin, upgrade — this ticket |
/// | 10–19 | proof verification — #9 |
/// | 20–29 | nullifier registry — #10 |
/// | 30–39 | advance sizing — #11 |
/// | 40–49 | disbursement — #12 |
/// | 50–59 | repayment ledger — #13 |
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has no admin, so it was never constructed.
    NotInitialized = 1,
    /// Caller is not the admin.
    NotAdmin = 2,
    /// `execute_upgrade` or `cancel_upgrade` with nothing proposed.
    NoPendingUpgrade = 3,
    /// `execute_upgrade` before the timelock elapsed.
    TimelockNotElapsed = 4,
    /// Upgradeability was renounced; the code is frozen for good.
    UpgradeRenounced = 5,
    /// A second `propose_upgrade` while one is already pending. Cancel first, so that
    /// replacing a proposal cannot quietly restart someone else's timelock.
    UpgradeAlreadyPending = 6,

    // --- 10-19: proof verification (#9) ---
    /// No claim template pinned yet, so there is nothing to rebuild against. The
    /// contract deploys in this state on purpose rather than accepting anything.
    TemplateNotSet = 10,
    /// A field was longer than this contract accepts, or the stored template does not
    /// have one more part than there are values.
    ClaimMismatch = 11,
    /// The attestor signed longer ago than `MAX_PROOF_AGE_SECONDS`.
    ProofStale = 12,
    /// The attestor's timestamp is further ahead than `MAX_CLOCK_SKEW_SECONDS`.
    ProofFromTheFuture = 13,
    /// Reclaim's `verify_proof` refused the digest. Either the signature is not from a
    /// current witness, or one of the rebuilt fields differs from what was signed.
    VerifierRejected = 14,

    // --- 20-29: nullifier registry (#10) ---
    /// This publisher and window have already funded an advance.
    NullifierSpent = 20,
}

/// How old an attestor signature may be, measured against ledger time (#6 §6).
pub const MAX_PROOF_AGE_SECONDS: u64 = 3_600;

/// How far ahead of ledger time an attestor signature may be.
pub const MAX_CLOCK_SKEW_SECONDS: u64 = 300;

#[contractevent]
pub struct UpgradeProposed {
    #[topic]
    pub admin: Address,
    pub wasm_hash: BytesN<32>,
    pub executable_at: u64,
}

#[contractevent]
pub struct UpgradeExecuted {
    #[topic]
    pub admin: Address,
    pub wasm_hash: BytesN<32>,
}

#[contractevent]
pub struct UpgradeCancelled {
    #[topic]
    pub admin: Address,
    pub wasm_hash: BytesN<32>,
}

#[contractevent]
pub struct UpgradeabilityRenounced {
    #[topic]
    pub admin: Address,
}

#[contractevent]
pub struct ClaimTemplateSet {
    #[topic]
    pub admin: Address,
    pub parts: u32,
}

#[contractevent]
pub struct NullifierSpent {
    #[topic]
    pub borrower: Address,
    pub nullifier: BytesN<32>,
}

#[contract]
pub struct AdvanceContract;

#[contractimpl]
impl AdvanceContract {
    /// Runs once, at deploy. Does **not** run again on upgrade.
    pub fn __constructor(env: Env, admin: Address, verifier: Address, usdc: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Verifier, &verifier);
        s.set(&DataKey::Usdc, &usdc);
        Self::bump(&env);
    }

    // ----------------------------------------------------------------- reads

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    /// Reclaim's verifier, the cross-contract target #9 calls.
    pub fn verifier(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Verifier)
            .ok_or(Error::NotInitialized)
    }

    /// The USDC SAC advances are paid in.
    pub fn usdc(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Usdc)
            .ok_or(Error::NotInitialized)
    }

    /// Is the code still replaceable?
    pub fn is_upgradeable(env: Env) -> bool {
        !env.storage().instance().has(&DataKey::UpgradeRenounced)
    }

    /// The pending upgrade, if any. Public so that the delay is auditable by anyone,
    /// which is the entire point of having one.
    pub fn pending_upgrade(env: Env) -> Option<PendingUpgrade> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }

    // ------------------------------------------------------------- upgrades

    /// Start the clock on replacing this contract's code.
    pub fn propose_upgrade(env: Env, wasm_hash: BytesN<32>) -> Result<u64, Error> {
        let admin = Self::require_admin(&env)?;
        Self::require_upgradeable(&env)?;
        if env.storage().instance().has(&DataKey::PendingUpgrade) {
            return Err(Error::UpgradeAlreadyPending);
        }

        let executable_at = env
            .ledger()
            .timestamp()
            .saturating_add(UPGRADE_DELAY_SECONDS);
        env.storage().instance().set(
            &DataKey::PendingUpgrade,
            &PendingUpgrade {
                wasm_hash: wasm_hash.clone(),
                executable_at,
            },
        );
        Self::bump(&env);

        UpgradeProposed {
            admin,
            wasm_hash,
            executable_at,
        }
        .publish(&env);
        Ok(executable_at)
    }

    /// Replace the code, once the timelock has elapsed.
    pub fn execute_upgrade(env: Env) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        Self::require_upgradeable(&env)?;

        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .ok_or(Error::NoPendingUpgrade)?;
        if env.ledger().timestamp() < pending.executable_at {
            return Err(Error::TimelockNotElapsed);
        }

        // Clear before upgrading: the new wasm inherits this storage, and a pending
        // entry left behind would let the next admin execute a stale proposal.
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        env.deployer()
            .update_current_contract(ContractExecutable::Wasm(pending.wasm_hash.clone()));

        UpgradeExecuted {
            admin,
            wasm_hash: pending.wasm_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// Drop a proposal before it ripens.
    pub fn cancel_upgrade(env: Env) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        let pending: PendingUpgrade = env
            .storage()
            .instance()
            .get(&DataKey::PendingUpgrade)
            .ok_or(Error::NoPendingUpgrade)?;
        env.storage().instance().remove(&DataKey::PendingUpgrade);

        UpgradeCancelled {
            admin,
            wasm_hash: pending.wasm_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// Give up the ability to change this code, permanently.
    ///
    /// One way. There is no un-renounce, by design: a reversible freeze is not a freeze,
    /// and the value of this call is exactly that nobody — including us — can undo it.
    /// Any pending proposal is dropped, so a renounce cannot be front-run by one.
    pub fn renounce_upgradeability(env: Env) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        Self::require_upgradeable(&env)?;
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        env.storage()
            .instance()
            .set(&DataKey::UpgradeRenounced, &true);
        Self::bump(&env);

        UpgradeabilityRenounced { admin }.publish(&env);
        Ok(())
    }

    // ------------------------------------------------- claim template (#6 §2)

    /// Pin the Reclaim request template and provider hash.
    ///
    /// The exact bytes come from the first live AdSense proof (#5). Admin-gated, and
    /// re-callable because the template changes whenever the provider version does.
    /// Changing it does not invalidate advances already made; it only governs what a new
    /// proof must match.
    ///
    /// `parts` are the literal segments of the request, interleaved at verification time
    /// with the publisher id, window start and window end — so it must hold exactly four
    /// entries for the three values this contract supplies.
    pub fn set_claim_template(
        env: Env,
        parts: Vec<Bytes>,
        provider_hash: Bytes,
    ) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        if parts.len() != 4 {
            return Err(Error::ClaimMismatch);
        }
        let n = parts.len();
        env.storage()
            .instance()
            .set(&DataKey::ParamsTemplate, &parts);
        env.storage()
            .instance()
            .set(&DataKey::ProviderHash, &provider_hash);
        Self::bump(&env);

        ClaimTemplateSet { admin, parts: n }.publish(&env);
        Ok(())
    }

    /// The pinned template, if one is set. Public so that anyone can check what this
    /// contract will accept before sending a proof to it.
    pub fn claim_template(env: Env) -> Option<Vec<Bytes>> {
        env.storage().instance().get(&DataKey::ParamsTemplate)
    }

    pub fn provider_hash(env: Env) -> Option<Bytes> {
        env.storage().instance().get(&DataKey::ProviderHash)
    }

    // -------------------------------------------------- verify a claim (#9)

    /// Check a Reclaim proof and return only what it actually attested.
    ///
    /// The order is the security property and does not change: rebuild every field from
    /// pinned bytes and caller values, check freshness, **then** verify. Nothing the
    /// caller sent is trusted until `verify_proof` has returned, and after it returns the
    /// only reason it could have returned is that the attestor signed these exact bytes.
    ///
    /// The borrower is taken from the `Address` argument and hashed into the context, so
    /// a proof bound to one account cannot be spent by another (#18): change the address
    /// and the digest changes with it.
    pub fn verify_claim(
        env: Env,
        borrower: Address,
        revenue_usd: String,
        pub_id: String,
        window_start: String,
        window_end: String,
        timestamp_s: u64,
        epoch: u64,
        signature: BytesN<64>,
        recovery_id: u32,
    ) -> Result<VerifiedClaim, Error> {
        let parts: Vec<Bytes> = env
            .storage()
            .instance()
            .get(&DataKey::ParamsTemplate)
            .ok_or(Error::TemplateNotSet)?;
        let provider_hash: Bytes = env
            .storage()
            .instance()
            .get(&DataKey::ProviderHash)
            .ok_or(Error::TemplateNotSet)?;

        // Freshness before any hashing: a stale proof should cost the caller a cheap
        // refusal, not a keccak over the whole request template.
        let now = env.ledger().timestamp();
        if timestamp_s > now.saturating_add(MAX_CLOCK_SKEW_SECONDS) {
            return Err(Error::ProofFromTheFuture);
        }
        if now.saturating_sub(timestamp_s) > MAX_PROOF_AGE_SECONDS {
            return Err(Error::ProofStale);
        }

        let borrower_b = claim::borrower_bytes(&env, &borrower).ok_or(Error::ClaimMismatch)?;
        let revenue_b = claim::string_bytes(&env, &revenue_usd).ok_or(Error::ClaimMismatch)?;
        let pub_id_b = claim::string_bytes(&env, &pub_id).ok_or(Error::ClaimMismatch)?;
        let start_b = claim::string_bytes(&env, &window_start).ok_or(Error::ClaimMismatch)?;
        let end_b = claim::string_bytes(&env, &window_end).ok_or(Error::ClaimMismatch)?;

        let parameters =
            claim::rebuild_parameters(&parts, &[pub_id_b.clone(), start_b.clone(), end_b.clone()])
                .ok_or(Error::ClaimMismatch)?;
        let context = claim::rebuild_context(
            &env,
            &borrower_b,
            &revenue_b,
            &start_b,
            &end_b,
            &provider_hash,
        );

        let identifier = claim::identifier(&env, &parameters, &context);
        let identifier_hex = claim::hex_prefixed(&identifier);

        // The attestor's `owner` is the borrower's own address, lowercased, because that
        // is what the relay put in the claim. Reclaim lowercases it before signing.
        let owner = claim::lowercase(&env, &borrower_b);
        let digest = claim::message_digest(&env, &identifier_hex, &owner, timestamp_s, epoch);

        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verifier)
            .ok_or(Error::NotInitialized)?;
        let client = reclaim::ReclaimClient::new(&env, &verifier);

        // `try_` so a refusal comes back as a value rather than trapping the whole
        // invocation: the caller gets a Forepay error code they can act on, not a bare
        // host panic from somebody else's contract.
        let digest32: BytesN<32> = digest.try_into().map_err(|_| Error::ClaimMismatch)?;
        client
            .try_verify_proof(&digest32, &signature, &recovery_id)
            .map_err(|_| Error::VerifierRejected)?
            .map_err(|_| Error::VerifierRejected)?;

        Ok(VerifiedClaim {
            borrower,
            revenue_usd,
            pub_id,
            window_start,
            window_end,
            timestamp_s,
        })
    }

    // ------------------------------------------------ nullifiers (#10)

    /// The nullifier for a publisher and window. Public so a front end can tell a
    /// creator "this period has already been borrowed against" before they prove
    /// anything, rather than after.
    pub fn nullifier_for(
        env: Env,
        pub_id: String,
        window_start: String,
        window_end: String,
    ) -> Result<BytesN<32>, Error> {
        let pub_id = claim::string_bytes(&env, &pub_id).ok_or(Error::ClaimMismatch)?;
        let start = claim::string_bytes(&env, &window_start).ok_or(Error::ClaimMismatch)?;
        let end = claim::string_bytes(&env, &window_end).ok_or(Error::ClaimMismatch)?;
        claim::nullifier_of(&env, &pub_id, &start, &end)
            .try_into()
            .map_err(|_| Error::ClaimMismatch)
    }

    /// Has this publisher and window already funded an advance?
    pub fn is_spent(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier))
    }

    /// Verify a claim and reserve its nullifier, atomically.
    ///
    /// **Transitional.** #11 adds sizing, #12 the disbursement and #13 the ledger, at
    /// which point this becomes `request_advance` as frozen in `docs/interface.md` §8.
    /// It is a separate name today because a function called `request_advance` that
    /// reserves without paying would be a lie on a live network.
    ///
    /// The order is the security property: verify, **then** check the nullifier, **then**
    /// write it — all before any money moves in #12. Check-then-act with a transfer in
    /// between is the classic race, and the write has to be on the same invocation that
    /// later pays, or two transactions in the same ledger could both pass the check.
    pub fn verify_and_reserve(
        env: Env,
        borrower: Address,
        revenue_usd: String,
        pub_id: String,
        window_start: String,
        window_end: String,
        timestamp_s: u64,
        epoch: u64,
        signature: BytesN<64>,
        recovery_id: u32,
    ) -> Result<VerifiedClaim, Error> {
        let verified = Self::verify_claim(
            env.clone(),
            borrower,
            revenue_usd,
            pub_id,
            window_start,
            window_end,
            timestamp_s,
            epoch,
            signature,
            recovery_id,
        )?;

        let nullifier = Self::nullifier_for(
            env.clone(),
            verified.pub_id.clone(),
            verified.window_start.clone(),
            verified.window_end.clone(),
        )?;
        let key = DataKey::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::NullifierSpent);
        }
        env.storage().persistent().set(&key, &verified.timestamp_s);
        // Persistent entries are archived rather than deleted when their TTL lapses, so a
        // lapsed nullifier cannot silently read as absent — the host makes the caller
        // restore it first. Extending anyway, so nobody has to.
        env.storage()
            .persistent()
            .extend_ttl(&key, 120 * 17_280, 180 * 17_280);

        NullifierSpent {
            borrower: verified.borrower.clone(),
            nullifier,
        }
        .publish(&env);
        Ok(verified)
    }

    // -------------------------------------------------------------- helpers

    fn require_admin(env: &Env) -> Result<Address, Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        Ok(admin)
    }

    fn require_upgradeable(env: &Env) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::UpgradeRenounced) {
            return Err(Error::UpgradeRenounced);
        }
        Ok(())
    }

    /// Keep instance storage alive. Instance data is the contract's own configuration —
    /// if it is archived the contract stops answering, so every write extends it.
    fn bump(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(120 * 17_280, 180 * 17_280);
    }
}

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_claim;
