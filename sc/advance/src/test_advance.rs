//! Forepay #11, #12, #13 — sizing, disbursement and the repayment ledger.
//!
//! These use a **real Stellar Asset Contract** registered in the test environment, not a
//! stub token. The trustline behaviour that makes a SAC transfer to a `G…` address fail
//! is the single most likely way this breaks in front of a creator, and a stub would not
//! reproduce it.

#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Address, Bytes, Env, String, Vec,
};

use crate::test_claim::{
    signature, BORROWER, EPOCH, PROVIDER_HASH, PUB_ID, RECOVERY_ID, REVENUE, TEMPLATE, TIMESTAMP_S,
    WINDOW_END, WINDOW_START,
};

struct Fx {
    env: Env,
    client: AdvanceContractClient<'static>,
    borrower: Address,
    usdc: Address,
    usdc_admin: StellarAssetClient<'static>,
}

/// A contract wired to a real SAC, funded, with the borrower trustlined unless asked not.
fn fx(fund_stroops: i128) -> Fx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(TIMESTAMP_S + 10);

    let verifier = env.register(crate::test_claim::PermissiveVerifier, ());
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let usdc = sac.address();

    let admin = Address::generate(&env);
    let id = env.register(AdvanceContract, (admin, verifier, usdc.clone()));
    let client = AdvanceContractClient::new(&env, &id);

    let mut parts = Vec::new(&env);
    for p in TEMPLATE.iter() {
        parts.push_back(Bytes::from_slice(&env, p));
    }
    client.set_claim_template(&parts, &Bytes::from_slice(&env, PROVIDER_HASH.as_bytes()));

    let usdc_admin = StellarAssetClient::new(&env, &usdc);
    if fund_stroops > 0 {
        usdc_admin.mint(&id, &fund_stroops);
    }

    let borrower = Address::generate(&env);
    // Give the borrower a USDC trustline. `trust` is the SAC's own admin surface for it
    // (protocol 26+), and it is what a creator does through the front end before
    // accepting (#19). Without it even `balance()` fails, not only `transfer` — see
    // `a_borrower_without_a_trustline_gets_a_named_error_not_a_panic` below.
    usdc_admin.trust(&borrower);
    Fx {
        env,
        client,
        borrower,
        usdc,
        usdc_admin,
    }
}

fn request(f: &Fx) -> Result<i128, Error> {
    match f.client.try_request_advance(
        &f.borrower,
        &String::from_str(&f.env, REVENUE),
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
        &TIMESTAMP_S,
        &EPOCH,
        &signature(&f.env),
        &RECOVERY_ID,
    ) {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(_)) => Err(Error::ClaimMismatch),
        Err(Ok(e)) => Err(e),
        Err(Err(_)) => Err(Error::ClaimMismatch),
    }
}

// --- #11 sizing ---

#[test]
fn the_quote_is_a_quarter_of_proven_revenue() {
    let f = fx(0);
    // 1234.56 USD -> 123456 cents -> 12_345_600_000 stroops -> 25% = 3_086_400_000,
    // which is over the cap, so it lands on the cap.
    let q = f.client.quote(&String::from_str(&f.env, REVENUE));
    assert_eq!(q, ADVANCE_CAP_STROOPS);

    // 100.00 USD -> 1_000_000_000 stroops -> 25% = 250_000_000 (25 USDC), under the cap.
    let q = f.client.quote(&String::from_str(&f.env, "100.00"));
    assert_eq!(q, 250_000_000);
}

#[test]
fn the_cap_binds() {
    let f = fx(0);
    let huge = f.client.quote(&String::from_str(&f.env, "999999.99"));
    assert_eq!(
        huge, ADVANCE_CAP_STROOPS,
        "no proof may draw more than the cap"
    );
}

#[test]
fn a_figure_below_the_floor_is_refused_rather_than_paid_as_dust() {
    let f = fx(0);
    // 1.00 USD -> 25 cents' worth of advance, far below the 1 USDC floor.
    assert_eq!(
        f.client.try_quote(&String::from_str(&f.env, "1.00")),
        Err(Ok(Error::AdvanceTooSmall))
    );
}

#[test]
fn revenue_must_be_a_plain_decimal_with_at_most_two_places() {
    let f = fx(0);
    for bad in [
        "", "abc", "-5.00", "1.234", "1..0", "1,000.00", "1e5", " 1.00",
    ] {
        assert_eq!(
            f.client.try_quote(&String::from_str(&f.env, bad)),
            Err(Ok(Error::RevenueUnparseable)),
            "{bad} must be refused"
        );
    }
}

#[test]
fn one_decimal_place_means_tenths_not_hundredths() {
    let f = fx(0);
    // "100.5" is 10050 cents, not 1005. Getting this wrong understates by 10x.
    assert_eq!(
        f.client.quote(&String::from_str(&f.env, "100.5")),
        f.client.quote(&String::from_str(&f.env, "100.50"))
    );
    assert_ne!(
        f.client.quote(&String::from_str(&f.env, "100.5")),
        f.client.quote(&String::from_str(&f.env, "100.05"))
    );
}

#[test]
fn the_sizing_getter_describes_the_arithmetic_quote_actually_uses() {
    let f = fx(0);
    let s = f.client.sizing();

    // Not "the getter returns 25" — that only tests that two literals match. What the
    // front end needs is that re-deriving the figure from the getter lands on the same
    // number the contract paid. Done for a figure under the cap and one over it.
    for revenue in ["4.00", "100.00", "999999.99"] {
        let cents = {
            let (w, c) = revenue.split_once('.').unwrap();
            w.parse::<i128>().unwrap() * 100 + c.parse::<i128>().unwrap()
        };
        let derived = {
            let sized = cents * s.stroops_per_cent * s.rate_num / s.rate_den;
            if sized > s.cap_stroops {
                s.cap_stroops
            } else {
                sized
            }
        };
        assert_eq!(
            f.client.quote(&String::from_str(&f.env, revenue)),
            derived,
            "{revenue}: the getter must reproduce the contract's own arithmetic"
        );
    }
}

#[test]
fn the_floor_the_getter_reports_is_the_floor_quote_enforces() {
    let f = fx(0);
    let s = f.client.sizing();

    // The smallest whole cent that still clears the floor, derived from the getter rather
    // than written down: a getter that reported a floor the contract does not enforce would
    // make 2b refuse figures the contract would have paid.
    let per_cent = s.rate_num * s.stroops_per_cent / s.rate_den;
    assert_eq!(
        s.min_stroops % per_cent,
        0,
        "the floor must land on a whole cent, or the boundary below is off by one"
    );
    let cents_at_floor = s.min_stroops / per_cent;

    assert_eq!(
        f.client.quote(&usd(&f.env, cents_at_floor)),
        s.min_stroops,
        "the figure the getter's floor implies must be payable"
    );
    assert_eq!(
        f.client.try_quote(&usd(&f.env, cents_at_floor - 1)),
        Err(Ok(Error::AdvanceTooSmall)),
        "one cent below it must not be"
    );
}

/// Cents as the decimal string a claim carries. `no_std`, so written out by hand.
fn usd(env: &Env, cents: i128) -> String {
    assert!(cents >= 0);
    let mut buf = [0u8; 24];
    let mut i = buf.len();

    i -= 1;
    buf[i] = b'0' + (cents % 10) as u8;
    i -= 1;
    buf[i] = b'0' + ((cents / 10) % 10) as u8;
    i -= 1;
    buf[i] = b'.';

    let mut whole = cents / 100;
    if whole == 0 {
        i -= 1;
        buf[i] = b'0';
    }
    while whole > 0 {
        i -= 1;
        buf[i] = b'0' + (whole % 10) as u8;
        whole /= 10;
    }
    String::from_str(env, core::str::from_utf8(&buf[i..]).unwrap())
}

// --- #12 disbursement ---

#[test]
fn a_verified_claim_moves_real_usdc_to_the_borrower() {
    let f = fx(ADVANCE_CAP_STROOPS * 2);
    let token = soroban_sdk::token::Client::new(&f.env, &f.usdc);
    assert_eq!(token.balance(&f.borrower), 0);

    let paid = request(&f).expect("must disburse");
    assert_eq!(paid, ADVANCE_CAP_STROOPS);
    assert_eq!(token.balance(&f.borrower), ADVANCE_CAP_STROOPS);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_take_an_advance_in_someone_elses_name() {
    // #81. This shipped unauthenticated, and "the money goes to the borrower anyway" is
    // why it looked harmless. It is not: whoever submits the proof chooses when the
    // advance is taken and at what figure, saddles the creator with a repayment they
    // never asked for, and burns their nullifier for that whole reporting period — once,
    // permanently. A forwarded proof is accepted inside the freshness hour by design, so
    // the proof does not have to be stolen in any interesting way.
    //
    // `set_auths(&[])` rather than the usual `mock_all_auths`: an empty auth set is what
    // a third party submitting someone else's proof actually looks like.
    let f = fx(ADVANCE_CAP_STROOPS * 2);
    f.env.set_auths(&[]);
    f.client.request_advance(
        &f.borrower,
        &String::from_str(&f.env, REVENUE),
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
        &TIMESTAMP_S,
        &EPOCH,
        &signature(&f.env),
        &RECOVERY_ID,
    );
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn nobody_can_burn_someone_elses_nullifier_for_free() {
    // The same hole in `verify_and_reserve`, which is worse: it writes the nullifier and
    // pays nothing at all, so the creator loses the period and receives no advance to
    // show for it. Not part of the creator flow, but it was on the live contract's ABI.
    let f = fx(ADVANCE_CAP_STROOPS * 2);
    f.env.set_auths(&[]);
    f.client.verify_and_reserve(
        &f.borrower,
        &String::from_str(&f.env, REVENUE),
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
        &TIMESTAMP_S,
        &EPOCH,
        &signature(&f.env),
        &RECOVERY_ID,
    );
}

#[test]
fn an_underfunded_contract_refuses_before_spending_the_nullifier() {
    let f = fx(1); // one stroop: nowhere near the advance
    assert_eq!(request(&f), Err(Error::InsufficientLiquidity));

    let n = f.client.nullifier_for(
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
    );
    assert!(
        !f.client.is_spent(&n),
        "our own lack of funds must not burn the creator's period"
    );
}

#[test]
fn the_same_proof_cannot_draw_twice() {
    let f = fx(ADVANCE_CAP_STROOPS * 3);
    assert!(request(&f).is_ok());
    assert_eq!(request(&f), Err(Error::NullifierSpent));

    let token = soroban_sdk::token::Client::new(&f.env, &f.usdc);
    assert_eq!(
        token.balance(&f.borrower),
        ADVANCE_CAP_STROOPS,
        "the balance proves only one disbursement happened"
    );
}

// --- #13 repayment ---

#[test]
fn a_full_cycle_leaves_nothing_outstanding() {
    let f = fx(ADVANCE_CAP_STROOPS * 2);
    let principal = request(&f).unwrap();
    let n = f.client.nullifier_for(
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
    );

    let part = principal / 4;
    let left = f.client.repay(&f.borrower, &n, &part);
    assert_eq!(left, principal - part);
    assert_eq!(f.client.advance(&n).unwrap().repaid, part);

    let left = f.client.repay(&f.borrower, &n, &left);
    assert_eq!(left, 0);

    let adv = f.client.advance(&n).unwrap();
    assert_eq!(adv.repaid, adv.principal);
}

#[test]
fn overpaying_is_refused() {
    let f = fx(ADVANCE_CAP_STROOPS * 2);
    let principal = request(&f).unwrap();
    let n = f.client.nullifier_for(
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
    );
    // Fund the borrower so the refusal is about the ledger, not about their balance.
    f.usdc_admin.mint(&f.borrower, &principal);
    assert_eq!(
        f.client.try_repay(&f.borrower, &n, &(principal + 1)),
        Err(Ok(Error::RepaymentExceedsOutstanding))
    );
    assert_eq!(f.client.advance(&n).unwrap().repaid, 0);
}

#[test]
fn repaying_something_that_was_never_advanced_is_refused() {
    let f = fx(0);
    let n = f.client.nullifier_for(
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
    );
    assert_eq!(
        f.client.try_repay(&f.borrower, &n, &1_000),
        Err(Ok(Error::UnknownAdvance))
    );
}

#[test]
fn a_zero_or_negative_repayment_is_refused() {
    let f = fx(ADVANCE_CAP_STROOPS * 2);
    request(&f).unwrap();
    let n = f.client.nullifier_for(
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
    );
    assert_eq!(
        f.client.try_repay(&f.borrower, &n, &0),
        Err(Ok(Error::AmountNotPositive))
    );
    assert_eq!(
        f.client.try_repay(&f.borrower, &n, &-1),
        Err(Ok(Error::AmountNotPositive))
    );
}

#[test]
fn a_borrower_without_a_trustline_gets_a_named_error_not_a_panic() {
    // The single most likely way this breaks in front of a creator. A SAC transfer to a
    // `G…` address goes through classic trustline semantics, and the SAC answers
    // Error(Contract, #13) — which without `try_transfer` would trap the whole invocation
    // and show a bare host error instead of something they can act on.
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(TIMESTAMP_S + 10);

    let verifier = env.register(crate::test_claim::PermissiveVerifier, ());
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let usdc = sac.address();
    let id = env.register(
        AdvanceContract,
        (Address::generate(&env), verifier, usdc.clone()),
    );
    let client = AdvanceContractClient::new(&env, &id);
    let mut parts = Vec::new(&env);
    for p in TEMPLATE.iter() {
        parts.push_back(Bytes::from_slice(&env, p));
    }
    client.set_claim_template(&parts, &Bytes::from_slice(&env, PROVIDER_HASH.as_bytes()));
    StellarAssetClient::new(&env, &usdc).mint(&id, &(ADVANCE_CAP_STROOPS * 2));

    // A literal `G…` with nothing behind it in the test ledger. `Address::generate`
    // cannot be used here: the test host gives generated accounts a usable trustline, so
    // a transfer to one succeeds and the path under test never runs.
    let borrower = Address::from_string(&String::from_str(&env, BORROWER));
    let out = client.try_request_advance(
        &borrower,
        &String::from_str(&env, REVENUE),
        &String::from_str(&env, PUB_ID),
        &String::from_str(&env, WINDOW_START),
        &String::from_str(&env, WINDOW_END),
        &TIMESTAMP_S,
        &EPOCH,
        &signature(&env),
        &RECOVERY_ID,
    );
    assert_eq!(out, Err(Ok(Error::NoTrustline)));

    // And it must not have burned the period on a payment that could not land.
    let n = client.nullifier_for(
        &String::from_str(&env, PUB_ID),
        &String::from_str(&env, WINDOW_START),
        &String::from_str(&env, WINDOW_END),
    );
    assert!(!client.is_spent(&n));
}

#[test]
fn the_ledger_records_what_was_proven_not_what_was_claimed() {
    let f = fx(ADVANCE_CAP_STROOPS * 2);
    request(&f).unwrap();
    let n = f.client.nullifier_for(
        &String::from_str(&f.env, PUB_ID),
        &String::from_str(&f.env, WINDOW_START),
        &String::from_str(&f.env, WINDOW_END),
    );
    let adv = f.client.advance(&n).unwrap();
    assert_eq!(adv.borrower, f.borrower);
    assert_eq!(adv.revenue_cents, 123_456);
    assert_eq!(adv.pub_id, String::from_str(&f.env, PUB_ID));
    assert_eq!(adv.opened_at, TIMESTAMP_S + 10);
}
