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
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, ContractExecutable, Env, String, Vec,
};

mod claim;
mod reclaim;
mod sizing;

pub use claim::{CONTEXT_MESSAGE, PROVIDER};
pub use sizing::{
    ADVANCE_CAP_STROOPS, ADVANCE_DEN, ADVANCE_NUM, MIN_ADVANCE_STROOPS, STROOPS_PER_CENT,
};

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
    /// One advance, keyed by the nullifier that funded it. Persistent: an advance that
    /// vanished when its TTL lapsed would erase a debt, which is not a rounding error.
    Advance(BytesN<32>),
    /// The attestor's `owner` every claim must carry: the Reclaim app the relay proves
    /// with, `0x…`, lowercase (#102). Absent means the borrower, which is what the
    /// rehearsal's test witness signs; no real attestor claim has that owner.
    ClaimOwner,
}

/// An advance that has been paid out, and what is still owed on it.
///
/// **No default handling, recovery or liquidation** — SOW §4.1 excludes them, and a
/// half-built default path would make this read as a lending product rather than the
/// technical demonstration it is scoped as.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Advance {
    pub borrower: Address,
    pub pub_id: String,
    pub window_start: String,
    pub window_end: String,
    /// The attested figure the advance was sized from, in cents.
    pub revenue_cents: i128,
    /// Stroops disbursed.
    pub principal: i128,
    /// Stroops repaid so far.
    pub repaid: i128,
    /// Ledger timestamp at disbursement.
    pub opened_at: u64,
}

/// The constants `quote` sizes an advance from (#63).
///
/// These are compile-time constants, not storage — an upgrade can change them, and when
/// it does, this getter changes with the arithmetic in the same wasm. That is the point:
/// the front end shows the derivation on 2b (#20), and a hard-coded `25%` on screen beside
/// a figure the contract computed from something else is a derivation that lies.
///
/// `rate_num` / `rate_den` rather than a percentage: the contract divides integers, and a
/// front end that renders `rate_num / rate_den` reproduces the same arithmetic instead of
/// approximating it.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Sizing {
    /// Numerator of the advance rate. 25 today.
    pub rate_num: i128,
    /// Denominator of the advance rate. 100 today.
    pub rate_den: i128,
    /// The most any one advance can be, in stroops. 100 USDC today.
    pub cap_stroops: i128,
    /// Below this an advance is refused with `AdvanceTooSmall`. 1 USDC today.
    pub min_stroops: i128,
    /// Stroops per cent for the USDC SAC this contract pays in. 100_000 at 7 decimals.
    pub stroops_per_cent: i128,
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

    // --- 30-39: sizing (#11) ---
    /// `revenueUsd` is not a plain non-negative decimal, or carries more than two
    /// decimal places. Refused rather than rounded: rounding would make the advance
    /// depend on how we round, and anyone must be able to re-derive the figure.
    RevenueUnparseable = 30,
    /// The sized advance is below `MIN_ADVANCE_STROOPS`. Refused so that a dust advance
    /// cannot burn the creator's nullifier for the period in exchange for nothing.
    AdvanceTooSmall = 31,

    // --- 40-49: disbursement (#12) ---
    /// The contract does not hold enough USDC to pay this advance.
    InsufficientLiquidity = 40,
    /// The transfer to the borrower could not land. In practice this is a missing USDC
    /// trustline, which is the actionable case and what the name says; it also covers an
    /// account that does not exist on the network at all, and an authorisation the issuer
    /// has revoked. All three are "we cannot pay this address", and all three are fixed
    /// by the creator rather than by us.
    ///
    /// Named rather than left as a raw panic, because "add a USDC trustline" is something
    /// a creator can act on and `Error(Contract, #13)` from somebody else's contract is
    /// not.
    NoTrustline = 41,

    // --- 50-59: repayment (#13) ---
    /// No advance exists for this publisher and window.
    UnknownAdvance = 50,
    /// The repayment is larger than what is still owed.
    RepaymentExceedsOutstanding = 51,
    /// A zero or negative amount.
    AmountNotPositive = 52,
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
pub struct ClaimOwnerSet {
    #[topic]
    pub admin: Address,
    pub owner: Bytes,
}

#[contractevent]
pub struct NullifierSpent {
    #[topic]
    pub borrower: Address,
    pub nullifier: BytesN<32>,
}

#[contractevent]
pub struct AdvanceDisbursed {
    #[topic]
    pub borrower: Address,
    pub nullifier: BytesN<32>,
    pub revenue_cents: i128,
    pub principal: i128,
}

#[contractevent]
pub struct Repaid {
    #[topic]
    pub borrower: Address,
    pub nullifier: BytesN<32>,
    pub amount: i128,
    pub outstanding: i128,
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
    /// with the **seven** values this contract supplies, in this order:
    ///
    /// ```text
    /// pub_id, start_year, start_month, start_day, end_year, end_month, end_day
    /// ```
    ///
    /// So it must hold exactly eight entries. Seven rather than three because AdSense has
    /// no string form for a date: `reports:generate` takes `startDate.year=2026&
    /// startDate.month=7&startDate.day=1`, unpadded, and one `"2026-07-01"` cannot fill
    /// three query parameters (#76).
    pub fn set_claim_template(
        env: Env,
        parts: Vec<Bytes>,
        provider_hash: Bytes,
    ) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        if parts.len() != 8 {
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

    /// Pin the attestor's `owner`: the Reclaim app id the relay proves with (#102).
    ///
    /// A real attestor signs `identifier \n owner \n timestamp \n epoch` with `owner` set
    /// to the **requesting app's** address, not to anything in the claim. The contract
    /// cannot read it from the claim, because it rebuilds the digest rather than trusting
    /// one, so it has to be pinned like the template. Pinning it also refuses claims made
    /// through any other Reclaim app.
    ///
    /// It carries no part of the borrower binding: that lives in `contextAddress`, inside
    /// the identifier, and is unaffected.
    ///
    /// `owner` must be `0x` and 40 hex digits. It is stored lowercased, because Reclaim
    /// lowercases it before signing.
    pub fn set_claim_owner(env: Env, owner: Bytes) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        if !claim::is_eth_address(&owner) {
            return Err(Error::ClaimMismatch);
        }
        let owner = claim::lowercase(&env, &owner);
        env.storage().instance().set(&DataKey::ClaimOwner, &owner);
        Self::bump(&env);

        ClaimOwnerSet { admin, owner }.publish(&env);
        Ok(())
    }

    /// The pinned owner, if one is set. Absent means the borrower (the rehearsal's form).
    pub fn claim_owner(env: Env) -> Option<Bytes> {
        env.storage().instance().get(&DataKey::ClaimOwner)
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

        // The window reaches the signed URL as six unpadded numbers, because that is the
        // only form AdSense accepts (#76). `window_start` and `window_end` stay
        // `YYYY-MM-DD` in the interface and in the nullifier — this is a re-encoding on
        // the way into the template, not a change to what is being borrowed against.
        let (sy, sm, sd) = claim::split_date(&env, &start_b).ok_or(Error::ClaimMismatch)?;
        let (ey, em, ed) = claim::split_date(&env, &end_b).ok_or(Error::ClaimMismatch)?;

        let parameters =
            claim::rebuild_parameters(&parts, &[pub_id_b.clone(), sy, sm, sd, ey, em, ed])
                .ok_or(Error::ClaimMismatch)?;
        let context = claim::rebuild_context(&env, &borrower_b, &revenue_b, &provider_hash);

        let identifier = claim::identifier(&env, &parameters, &context);
        let identifier_hex = claim::hex_prefixed(&identifier);

        // The attestor's `owner` is the Reclaim app that requested the proof, pinned by the
        // admin (#102). Before #102 this was the borrower, which no real attestor claim
        // carries; that form survives only where nothing is pinned, for the rehearsal's
        // test witness. Reclaim lowercases the owner before signing.
        let owner: Bytes = match env.storage().instance().get(&DataKey::ClaimOwner) {
            Some(pinned) => pinned,
            None => claim::lowercase(&env, &borrower_b),
        };
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

    /// Verify a claim and reserve its nullifier, **without paying anything**.
    ///
    /// # Not part of the creator flow. `request_advance` is.
    ///
    /// This was written in #10, before sizing and disbursement existed, so that the
    /// nullifier registry could be proven on chain on its own. #12 superseded it. It is
    /// kept because the nullifier tests run against a stub token that cannot transfer, and
    /// because the rehearsal's negative cases use it to show a refusal without needing
    /// liquidity.
    ///
    /// **It requires the borrower's own authorisation**, and that is not decoration. A
    /// nullifier is spent once and never unspent, so an unauthenticated version of this
    /// function lets anyone holding a valid proof — including a forwarded one, which
    /// `docs/interface.md` §6 deliberately accepts inside the freshness hour — burn that
    /// creator's whole reporting period and hand them nothing for it. No funds move, and
    /// the damage is permanent. It shipped that way and #81 closed it.
    ///
    /// The order is the security property: verify, **then** check the nullifier, **then**
    /// write it, before any money moves. Check-then-act with a transfer in between is the
    /// classic race, and the write has to be on the same invocation that later pays, or two
    /// transactions in the same ledger could both pass the check.
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
        // Before any hashing: the cheapest possible refusal, and the only thing standing
        // between a leaked proof and a permanently burned reporting period.
        borrower.require_auth();

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

    // ------------------------------------------- the advance (#11, #12, #13)

    /// What an advance would be for a given attested figure, in stroops.
    ///
    /// Public and pure so a front end can show the derivation before anyone proves
    /// anything — `revenue × 25 / 100`, capped at 100 USDC — and so the number on screen
    /// is the contract's own arithmetic rather than a reimplementation of it (#20).
    /// The constants behind `quote`, so the front end can stop hard-coding them (#63).
    ///
    /// Pure, no storage read, no error: these are compile-time constants and this function
    /// cannot fail. It is a read of the wasm, which is exactly what makes it honest — upgrade
    /// the arithmetic and this answer moves with it, in the same transaction.
    ///
    /// It also lets 2b tell "capped" apart from "happens to be exactly 100 USDC": compare
    /// `quote()` against `cap_stroops` instead of against a literal in the bundle.
    pub fn sizing(_env: Env) -> Sizing {
        Sizing {
            rate_num: sizing::ADVANCE_NUM,
            rate_den: sizing::ADVANCE_DEN,
            cap_stroops: sizing::ADVANCE_CAP_STROOPS,
            min_stroops: sizing::MIN_ADVANCE_STROOPS,
            stroops_per_cent: sizing::STROOPS_PER_CENT,
        }
    }

    pub fn quote(env: Env, revenue_usd: String) -> Result<i128, Error> {
        let cents = sizing::parse_usd_cents(&env, &revenue_usd).ok_or(Error::RevenueUnparseable)?;
        let stroops = sizing::advance_stroops(cents).ok_or(Error::RevenueUnparseable)?;
        if stroops < sizing::MIN_ADVANCE_STROOPS {
            return Err(Error::AdvanceTooSmall);
        }
        Ok(stroops)
    }

    /// How much USDC this contract can still lend.
    pub fn liquidity(env: Env) -> Result<i128, Error> {
        let usdc: Address = env
            .storage()
            .instance()
            .get(&DataKey::Usdc)
            .ok_or(Error::NotInitialized)?;
        Ok(token::Client::new(&env, &usdc).balance(&env.current_contract_address()))
    }

    /// The advance funded by a given nullifier, if any.
    pub fn advance(env: Env, nullifier: BytesN<32>) -> Option<Advance> {
        env.storage().persistent().get(&DataKey::Advance(nullifier))
    }

    /// Prove revenue, size an advance, and receive USDC. The product, in one call.
    ///
    /// The order is the security property and does not change:
    ///
    /// 0. **the borrower authorises it** — nobody takes on a debt they did not ask for
    /// 1. verify the claim — nothing after this came from an untrusted source
    /// 2. size it, so a figure too small to be worth borrowing against fails **before**
    ///    the nullifier is consumed
    /// 3. check and **write** the nullifier
    /// 4. disburse
    ///
    /// # Why step 0 exists
    ///
    /// It did not, until #81. The money moves *to* the borrower, so an unauthenticated
    /// version looks harmless — a stranger paying a fee to give someone USDC. It is not.
    /// Whoever submits the proof chooses **when** the advance is taken, at **what** figure,
    /// and burns the creator's nullifier for that whole reporting period. The creator ends
    /// up owing a repayment they never asked for, and cannot borrow against that quarter
    /// again. A forwarded proof is accepted inside the freshness hour by design
    /// (`docs/interface.md` §6), so the proof does not even have to be stolen in any
    /// interesting way.
    ///
    /// `docs/interface.md` §8 and the relay's own PR both said this call "needs the
    /// borrower's own auth". The contract did not check it. The document was right and the
    /// code was wrong; this is the code catching up.
    ///
    /// Sizing sits before the nullifier deliberately: a creator whose quarter is below the
    /// floor should be able to come back when it is not, rather than having burned the
    /// period on a refused advance. The nullifier is written before the transfer, in the
    /// same invocation, because check-then-act with a transfer in between is the classic
    /// race and two transactions in one ledger could otherwise both pass the check.
    pub fn request_advance(
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
    ) -> Result<i128, Error> {
        borrower.require_auth();

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

        let cents = sizing::parse_usd_cents(&env, &verified.revenue_usd)
            .ok_or(Error::RevenueUnparseable)?;
        let principal = sizing::advance_stroops(cents).ok_or(Error::RevenueUnparseable)?;
        if principal < sizing::MIN_ADVANCE_STROOPS {
            return Err(Error::AdvanceTooSmall);
        }

        let nullifier = Self::nullifier_for(
            env.clone(),
            verified.pub_id.clone(),
            verified.window_start.clone(),
            verified.window_end.clone(),
        )?;
        let null_key = DataKey::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&null_key) {
            return Err(Error::NullifierSpent);
        }

        let usdc: Address = env
            .storage()
            .instance()
            .get(&DataKey::Usdc)
            .ok_or(Error::NotInitialized)?;
        let client = token::Client::new(&env, &usdc);
        if client.balance(&env.current_contract_address()) < principal {
            return Err(Error::InsufficientLiquidity);
        }

        env.storage()
            .persistent()
            .set(&null_key, &verified.timestamp_s);
        env.storage()
            .persistent()
            .extend_ttl(&null_key, 120 * 17_280, 180 * 17_280);

        // `try_transfer` rather than `transfer`: a borrower with no USDC trustline makes
        // the SAC fail, and without `try_` that failure traps the whole invocation and
        // the creator sees a bare host error. They get a named one they can act on.
        client
            .try_transfer(
                &env.current_contract_address(),
                &verified.borrower,
                &principal,
            )
            .map_err(|_| Error::NoTrustline)?
            .map_err(|_| Error::NoTrustline)?;

        let advance = Advance {
            borrower: verified.borrower.clone(),
            pub_id: verified.pub_id.clone(),
            window_start: verified.window_start.clone(),
            window_end: verified.window_end.clone(),
            revenue_cents: cents,
            principal,
            repaid: 0,
            opened_at: env.ledger().timestamp(),
        };
        let adv_key = DataKey::Advance(nullifier.clone());
        env.storage().persistent().set(&adv_key, &advance);
        env.storage()
            .persistent()
            .extend_ttl(&adv_key, 120 * 17_280, 180 * 17_280);

        NullifierSpent {
            borrower: verified.borrower.clone(),
            nullifier: nullifier.clone(),
        }
        .publish(&env);
        AdvanceDisbursed {
            borrower: verified.borrower,
            nullifier,
            revenue_cents: cents,
            principal,
        }
        .publish(&env);
        Ok(principal)
    }

    /// Repay an advance, in whole or in part.
    ///
    /// Anyone may repay on a borrower's behalf — `from` authorises the transfer, and
    /// paying down someone else's debt harms nobody. What is refused is paying **more**
    /// than is owed, so the ledger cannot go negative and nobody overpays by accident.
    pub fn repay(
        env: Env,
        from: Address,
        nullifier: BytesN<32>,
        amount: i128,
    ) -> Result<i128, Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::AmountNotPositive);
        }

        let key = DataKey::Advance(nullifier.clone());
        let mut advance: Advance = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::UnknownAdvance)?;

        let outstanding = advance.principal - advance.repaid;
        if amount > outstanding {
            return Err(Error::RepaymentExceedsOutstanding);
        }

        let usdc: Address = env
            .storage()
            .instance()
            .get(&DataKey::Usdc)
            .ok_or(Error::NotInitialized)?;
        token::Client::new(&env, &usdc).transfer(&from, env.current_contract_address(), &amount);

        advance.repaid += amount;
        let remaining = advance.principal - advance.repaid;
        let borrower = advance.borrower.clone();
        env.storage().persistent().set(&key, &advance);
        env.storage()
            .persistent()
            .extend_ttl(&key, 120 * 17_280, 180 * 17_280);

        Repaid {
            borrower,
            nullifier,
            amount,
            outstanding: remaining,
        }
        .publish(&env);
        Ok(remaining)
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
mod test_advance;
#[cfg(test)]
mod test_claim;
