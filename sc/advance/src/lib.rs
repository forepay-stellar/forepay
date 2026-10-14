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

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN,
    ContractExecutable, Env,
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
}

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
