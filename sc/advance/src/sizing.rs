//! Turning an attested revenue figure into a number of stroops (#11).
//!
//! Deterministic by design: the same proof always sizes the same advance, with no admin
//! discretion anywhere in the path. That determinism is the product — the front end shows
//! the derivation (#20), and a number nobody can re-derive is indistinguishable from one
//! we made up.
//!
//! Frozen in `docs/interface.md` §5.

use soroban_sdk::{Env, String};

/// `advance = min(CAP, revenue × NUM / DEN)`. A quarter of three months' proven revenue,
/// which is about three weeks of earnings — conservative, because the advance is
/// effectively unsecured and this phase has no default mechanics (SOW §4.1).
pub const ADVANCE_NUM: i128 = 25;
pub const ADVANCE_DEN: i128 = 100;

/// 100 USDC. The contract is funded by us on testnet; the cap keeps one demo from
/// draining it.
pub const ADVANCE_CAP_STROOPS: i128 = 1_000_000_000;

/// 1 USDC. Below this, refuse: a dust advance burns the creator's nullifier for the
/// period and gives them nothing back for it.
pub const MIN_ADVANCE_STROOPS: i128 = 10_000_000;

/// Stroops per cent. USDC's SAC reports **7 decimals**, read from chain on 2026-10-14
/// rather than assumed — the Stellar docs warn explicitly against assuming 7.
pub const STROOPS_PER_CENT: i128 = 100_000;

/// Parse a decimal USD string into cents.
///
/// `revenueUsd` arrives as text because that is how it appears in the attested claim, and
/// it is matched by the provider's regex as `\d+(\.\d+)?`. More than two decimal places is
/// refused rather than rounded: rounding would make the advance depend on how we round,
/// and the whole point is that anyone can re-derive the figure.
///
/// Returns `None` for anything that is not a plain non-negative decimal.
pub fn parse_usd_cents(env: &Env, revenue: &String) -> Option<i128> {
    let len = revenue.len() as usize;
    if len == 0 || len > 32 {
        return None;
    }
    let mut buf = [0u8; 32];
    revenue.copy_into_slice(&mut buf[..len]);
    let _ = env;

    let mut whole: i128 = 0;
    let mut frac: i128 = 0;
    let mut frac_digits = 0u32;
    let mut seen_dot = false;
    let mut any_digit = false;

    for &c in &buf[..len] {
        match c {
            b'0'..=b'9' => {
                any_digit = true;
                let d = (c - b'0') as i128;
                if seen_dot {
                    if frac_digits == 2 {
                        return None; // a third decimal place; refuse rather than round
                    }
                    frac = frac * 10 + d;
                    frac_digits += 1;
                } else {
                    whole = whole.checked_mul(10)?.checked_add(d)?;
                    // A figure this large is not an AdSense quarter; stop before the
                    // multiply below can overflow rather than wrapping silently.
                    if whole > i128::MAX / 1_000_000 {
                        return None;
                    }
                }
            }
            b'.' if !seen_dot => seen_dot = true,
            _ => return None,
        }
    }
    if !any_digit {
        return None;
    }
    // "12.5" is 50 cents, not 5.
    if frac_digits == 1 {
        frac *= 10;
    }
    whole.checked_mul(100)?.checked_add(frac)
}

/// The advance for a given number of cents, in stroops. `None` on overflow.
pub fn advance_stroops(cents: i128) -> Option<i128> {
    let revenue = cents.checked_mul(STROOPS_PER_CENT)?;
    let sized = revenue.checked_mul(ADVANCE_NUM)? / ADVANCE_DEN;
    Some(if sized > ADVANCE_CAP_STROOPS {
        ADVANCE_CAP_STROOPS
    } else {
        sized
    })
}

/// Micros per cent. AdMob reports `ESTIMATED_EARNINGS` as `microsValue`: millionths of a
/// currency unit, so `"123450000"` is $123.45 and one cent is 10,000 micros.
pub const MICROS_PER_CENT: i128 = 10_000;

/// Parse an AdMob `microsValue` string into cents, **truncating**.
///
/// The figure arrives as an integer string of micros, with no decimal point — that is the
/// shape of the field, and the provider's regex captures it as `\d+`. So this refuses a
/// `.` rather than accepting a decimal it was not given, for the same reason
/// `parse_usd_cents` refuses a third decimal place: a figure nobody can re-derive is
/// indistinguishable from one we made up.
///
/// **Truncation is deliberate and one-directional.** `1_239_999` micros is $1.239999, and
/// this returns 123 cents, not 124. The advance is never sized from more than was
/// attested, and the lost fraction is at most one cent — below the 1 USDC floor by four
/// orders of magnitude, so it can never be the difference between an advance and a
/// refusal.
///
/// Returns `None` for anything that is not a plain non-negative integer.
pub fn parse_micros_cents(env: &Env, micros: &String) -> Option<i128> {
    let len = micros.len() as usize;
    if len == 0 || len > 32 {
        return None;
    }
    let mut buf = [0u8; 32];
    micros.copy_into_slice(&mut buf[..len]);
    let _ = env;

    let mut total: i128 = 0;
    for &c in &buf[..len] {
        match c {
            b'0'..=b'9' => {
                total = total.checked_mul(10)?.checked_add((c - b'0') as i128)?;
                // Stop well before the multiply in `advance_stroops` can overflow, the
                // same guard `parse_usd_cents` applies to its whole part.
                if total > i128::MAX / 1_000_000 {
                    return None;
                }
            }
            // No '.' arm on purpose: a micros field has no fractional part, and silently
            // accepting one would mean accepting a figure in a unit we were not given.
            _ => return None,
        }
    }
    Some(total / MICROS_PER_CENT)
}
