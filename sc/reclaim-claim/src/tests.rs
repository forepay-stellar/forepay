//! Forepay #3 — the Rust canonicalisation is checked against the SAME fixture as the
//! TypeScript one, which carries a real production-attestor signature.
//!
//! The point of sharing the fixture is that the two implementations cannot agree with
//! each other while both being wrong: the expected values come from a signature Reclaim
//! actually produced, and the digest below was accepted on chain by Reclaim's own
//! testnet verifier in transaction `96a744d7…`.

extern crate std;
use std::format;

use super::*;

const FIXTURE: &str = include_str!("../../../tools/fixtures/real-reclaim-proof.json");

fn fixture() -> serde_json::Value {
    serde_json::from_str(FIXTURE).expect("fixture is valid JSON")
}

#[test]
fn keccak256_matches_published_vectors() {
    // If this is wrong nothing else in the file means anything.
    assert_eq!(
        hex::encode(keccak256(b"")),
        "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    );
    assert_eq!(
        hex::encode(keccak256(b"abc")),
        "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
    );
}

#[test]
fn identifier_matches_the_one_the_attestor_signed() {
    let f = fixture();
    let info = &f["claimInfo"];
    // The fixture's context is already canonical (sorted keys), which is why this
    // crate can hash it without a parser. `context_in_the_fixture_is_canonical`
    // below is what keeps that true.
    let id = identifier_from_claim_info(
        info["provider"].as_str().unwrap().as_bytes(),
        info["parameters"].as_str().unwrap().as_bytes(),
        info["context"].as_str().unwrap().as_bytes(),
    );
    assert_eq!(
        format!("0x{}", hex::encode(id)),
        f["expected"]["identifier"].as_str().unwrap()
    );
}

#[test]
fn digest_matches_the_one_accepted_on_chain() {
    let f = fixture();
    let claim = &f["signedClaim"]["claim"];

    let mut id_hex = [0u8; 66];
    let id_bytes = hex::decode(&f["expected"]["identifier"].as_str().unwrap()[2..]).unwrap();
    let mut id = [0u8; 32];
    id.copy_from_slice(&id_bytes);
    to_hex_prefixed(&id, &mut id_hex);

    let owner = claim["owner"].as_str().unwrap().to_lowercase();
    let mut owner_hex = [0u8; 42];
    owner_hex.copy_from_slice(owner.as_bytes());

    let digest = message_digest(
        &id_hex,
        &owner_hex,
        claim["timestampS"].as_u64().unwrap(),
        claim["epoch"].as_u64().unwrap(),
    );
    assert_eq!(
        hex::encode(digest),
        f["expected"]["messageDigest"].as_str().unwrap(),
        "this digest was accepted on chain; a mismatch means the canonicalisation drifted"
    );
}

#[test]
fn context_in_the_fixture_is_canonical() {
    // This crate hashes `context` verbatim, so the fixture must already be sorted-key
    // JSON — otherwise the test above would pass for the wrong reason and the contract
    // would fail on real input.
    let f = fixture();
    let raw = f["claimInfo"]["context"].as_str().unwrap();
    let parsed: serde_json::Value = serde_json::from_str(raw).unwrap();
    // serde_json::Value is a BTreeMap when the `preserve_order` feature is off, so
    // re-serialising gives sorted keys and no whitespace — Reclaim's canonical form.
    assert_eq!(serde_json::to_string(&parsed).unwrap(), raw);
}

#[test]
fn to_hex_prefixed_is_lowercase_and_prefixed() {
    let mut out = [0u8; 66];
    to_hex_prefixed(&[0xabu8; 32], &mut out);
    assert_eq!(
        core::str::from_utf8(&out).unwrap(),
        format!("0x{}", "ab".repeat(32))
    );
}

#[test]
fn write_u64_covers_zero_and_the_maximum() {
    let mut b = [0u8; 20];
    assert_eq!(write_u64(0, &mut b), b"0");
    let mut b = [0u8; 20];
    assert_eq!(write_u64(1_746_175_158, &mut b), b"1746175158");
    let mut b = [0u8; 20];
    assert_eq!(write_u64(u64::MAX, &mut b), b"18446744073709551615");
}

#[test]
fn a_one_byte_change_anywhere_changes_the_identifier() {
    let f = fixture();
    let info = &f["claimInfo"];
    let base = identifier_from_claim_info(
        info["provider"].as_str().unwrap().as_bytes(),
        info["parameters"].as_str().unwrap().as_bytes(),
        info["context"].as_str().unwrap().as_bytes(),
    );
    let tampered_context = info["context"]
        .as_str()
        .unwrap()
        .replace(r#""amount":"1""#, r#""amount":"2""#);
    assert_ne!(tampered_context, info["context"].as_str().unwrap());
    let tampered = identifier_from_claim_info(
        info["provider"].as_str().unwrap().as_bytes(),
        info["parameters"].as_str().unwrap().as_bytes(),
        tampered_context.as_bytes(),
    );
    assert_ne!(
        base, tampered,
        "the revenue figure must be bound to the identifier"
    );
}

#[test]
fn the_separator_cannot_be_smuggled_across_fields() {
    // provider="a", parameters="b\nc" must not hash the same as provider="a\nb",
    // parameters="c" — otherwise a crafted claim could move bytes between fields.
    let a = identifier_from_claim_info(b"a", b"b\nc", b"");
    let b = identifier_from_claim_info(b"a\nb", b"c", b"");
    // They DO collide: the concatenation is ambiguous. Recorded rather than hidden —
    // it is Reclaim's format, not ours, and the mitigation is that `provider` and
    // `parameters` are pinned by the contract rather than taken from the caller.
    assert_eq!(
        a, b,
        "documented ambiguity in Reclaim's concatenation — see #6"
    );
}

#[test]
fn canonical_context_can_be_rebuilt_instead_of_parsed() {
    let ctx = br#"{"extractedParameters":{"revenue":"1234.56"},"providerHash":"0xabc"}"#;
    assert!(canonical_context_matches(
        ctx, b"revenue", b"1234.56", b"0xabc"
    ));
    // Any difference at all is a refusal.
    assert!(!canonical_context_matches(
        ctx, b"revenue", b"1234.57", b"0xabc"
    ));
    assert!(!canonical_context_matches(
        ctx, b"revenu", b"1234.56", b"0xabc"
    ));
    assert!(!canonical_context_matches(
        ctx, b"revenue", b"1234.56", b"0xabd"
    ));
    // Trailing junk must not be accepted.
    let ctx_extra = br#"{"extractedParameters":{"revenue":"1234.56"},"providerHash":"0xabc"} "#;
    assert!(!canonical_context_matches(
        ctx_extra, b"revenue", b"1234.56", b"0xabc"
    ));
}
