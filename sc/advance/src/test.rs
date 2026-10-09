//! Forepay #8 — the skeleton, the admin gate and the upgrade timelock.
//!
//! The tests that matter here are the refusals. A constructor that stores three
//! addresses is hard to get wrong; an upgrade path that can be executed early, twice,
//! or by the wrong account is how a contract with a timelock ends up with no timelock.

#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, BytesN, Env, IntoVal,
};

struct Fixture {
    env: Env,
    client: AdvanceContractClient<'static>,
    admin: Address,
    verifier: Address,
    usdc: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let verifier = Address::generate(&env);
    let usdc = Address::generate(&env);
    let id = env.register(
        AdvanceContract,
        (admin.clone(), verifier.clone(), usdc.clone()),
    );
    let client = AdvanceContractClient::new(&env, &id);
    Fixture {
        env,
        client,
        admin,
        verifier,
        usdc,
    }
}

fn wasm_hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

#[test]
fn the_constructor_stores_what_every_later_ticket_reads() {
    let f = setup();
    assert_eq!(f.client.admin(), f.admin);
    assert_eq!(f.client.verifier(), f.verifier);
    assert_eq!(f.client.usdc(), f.usdc);
    assert!(f.client.is_upgradeable());
    assert_eq!(f.client.pending_upgrade(), None);
}

#[test]
fn an_upgrade_cannot_be_executed_before_the_timelock_elapses() {
    let f = setup();
    let hash = wasm_hash(&f.env, 0xAA);

    let at = f.client.propose_upgrade(&hash);
    assert_eq!(at, f.env.ledger().timestamp() + UPGRADE_DELAY_SECONDS);

    // One second short.
    f.env.ledger().set_timestamp(at - 1);
    assert_eq!(
        f.client.try_execute_upgrade(),
        Err(Ok(Error::TimelockNotElapsed))
    );

    // The proposal is still standing — a refused execution must not consume it.
    assert_eq!(f.client.pending_upgrade().unwrap().wasm_hash, hash);
}

#[test]
fn executing_with_nothing_proposed_is_refused() {
    let f = setup();
    assert_eq!(
        f.client.try_execute_upgrade(),
        Err(Ok(Error::NoPendingUpgrade))
    );
    assert_eq!(
        f.client.try_cancel_upgrade(),
        Err(Ok(Error::NoPendingUpgrade))
    );
}

#[test]
fn a_second_proposal_cannot_quietly_restart_the_clock() {
    let f = setup();
    f.client.propose_upgrade(&wasm_hash(&f.env, 0xAA));
    // Proposing again must fail rather than overwrite: silently replacing the pending
    // hash would reset the delay on a proposal people were already watching.
    assert_eq!(
        f.client.try_propose_upgrade(&wasm_hash(&f.env, 0xBB)),
        Err(Ok(Error::UpgradeAlreadyPending))
    );
    assert_eq!(
        f.client.pending_upgrade().unwrap().wasm_hash,
        wasm_hash(&f.env, 0xAA)
    );
}

#[test]
fn cancelling_clears_the_proposal_and_lets_a_new_one_start() {
    let f = setup();
    f.client.propose_upgrade(&wasm_hash(&f.env, 0xAA));
    f.client.cancel_upgrade();
    assert_eq!(f.client.pending_upgrade(), None);

    f.client.propose_upgrade(&wasm_hash(&f.env, 0xBB));
    assert_eq!(
        f.client.pending_upgrade().unwrap().wasm_hash,
        wasm_hash(&f.env, 0xBB)
    );
}

#[test]
fn renouncing_is_permanent_and_drops_any_pending_proposal() {
    let f = setup();
    f.client.propose_upgrade(&wasm_hash(&f.env, 0xAA));

    f.client.renounce_upgradeability();
    assert!(!f.client.is_upgradeable());
    // A proposal must not survive the renounce, or it could be executed afterwards.
    assert_eq!(f.client.pending_upgrade(), None);

    assert_eq!(
        f.client.try_propose_upgrade(&wasm_hash(&f.env, 0xBB)),
        Err(Ok(Error::UpgradeRenounced))
    );
    assert_eq!(
        f.client.try_execute_upgrade(),
        Err(Ok(Error::UpgradeRenounced))
    );
    assert_eq!(
        f.client.try_renounce_upgradeability(),
        Err(Ok(Error::UpgradeRenounced))
    );
}

#[test]
fn every_admin_call_requires_the_admin() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let other = Address::generate(&env);
    let id = env.register(
        AdvanceContract,
        (
            admin.clone(),
            Address::generate(&env),
            Address::generate(&env),
        ),
    );
    let client = AdvanceContractClient::new(&env, &id);
    let hash = BytesN::from_array(&env, &[0xAA; 32]);

    // No auth mocked at all: the require_auth must bite.
    assert!(client.try_propose_upgrade(&hash).is_err());
    assert!(client.try_cancel_upgrade().is_err());
    assert!(client.try_execute_upgrade().is_err());
    assert!(client.try_renounce_upgradeability().is_err());

    // Authorising somebody who is not the admin must not help either.
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &other,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &id,
            fn_name: "propose_upgrade",
            args: (hash.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_propose_upgrade(&hash).is_err());
}

#[test]
fn the_error_table_is_stable() {
    // These numbers appear in evidence files and in other teams' error handling.
    // Changing one silently rewrites the meaning of every failure already recorded,
    // so the table is pinned here rather than trusted to review.
    assert_eq!(Error::NotInitialized as u32, 1);
    assert_eq!(Error::NotAdmin as u32, 2);
    assert_eq!(Error::NoPendingUpgrade as u32, 3);
    assert_eq!(Error::TimelockNotElapsed as u32, 4);
    assert_eq!(Error::UpgradeRenounced as u32, 5);
    assert_eq!(Error::UpgradeAlreadyPending as u32, 6);
    // 10–19 proof verification (#9), 20–29 nullifier (#10), 30–39 sizing (#11),
    // 40–49 disbursement (#12), 50–59 repayment (#13) are reserved and unused.
}
