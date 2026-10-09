//! Turning a Reclaim claim into the exact 32 bytes its attestor signed.
//!
//! The Rust half of Forepay issue #3. The TypeScript half lives in
//! `be/src/reclaim/claim-digest.ts`, and both are tested against the same fixture —
//! a real production-attestor signature — so they cannot drift apart silently.
//!
//! ```text
//! identifier = keccak256(provider \n parameters \n canonical_context)
//! sign_data  = identifier \n owner_lowercase \n timestamp_s \n epoch
//! digest     = keccak256("\x19Ethereum Signed Message:\n" + len(sign_data) + sign_data)
//! ```
//!
//! # Why this crate does not parse JSON
//!
//! Reclaim canonicalises `context` as JSON with sorted keys before hashing it. Doing
//! that inside a Soroban contract would mean a JSON parser and serialiser in `no_std`
//! wasm — large, slow, and a parser bug would be indistinguishable from a bad proof.
//!
//! So this crate takes `context` **already canonical** and hashes the bytes it is
//! given. The contract then has to bind that string to something it trusts, and the
//! cheap way is to rebuild it rather than parse it: see [`canonical_context_matches`].
//!
//! # What the signature actually covers
//!
//! Only `identifier`, `owner`, `timestamp_s` and `epoch`. The revenue figure is **not**
//! a signed field — it sits inside `context`, and reaches the signature only through
//! `identifier`. Nothing may trust a revenue figure that was not fed into
//! [`identifier_from_claim_info`].

#![cfg_attr(not(feature = "std"), no_std)]

use tiny_keccak::{Hasher, Keccak};

/// `keccak256` over arbitrary bytes.
///
/// Inside a Soroban contract use `env.crypto().keccak256(&bytes)` instead — the host
/// function is cheaper than carrying this implementation in the wasm. The algorithm is
/// identical, which is what lets this crate's tests stand in for the contract's.
pub fn keccak256(bytes: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut k = Keccak::v256();
    k.update(bytes);
    k.finalize(&mut out);
    out
}

/// Lowercase hex with a `0x` prefix, as Reclaim writes identifiers.
pub fn to_hex_prefixed(bytes: &[u8; 32], out: &mut [u8; 66]) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    out[0] = b'0';
    out[1] = b'x';
    for (i, b) in bytes.iter().enumerate() {
        out[2 + i * 2] = HEX[(b >> 4) as usize];
        out[3 + i * 2] = HEX[(b & 0x0f) as usize];
    }
}

/// `keccak256(provider \n parameters \n context)`.
///
/// `context` must already be canonical JSON — sorted keys, no whitespace. Hand it
/// through verbatim from a producer that does not canonicalise and the identifier will
/// be wrong in a way nothing downstream can detect: the digest simply fails to verify.
pub fn identifier_from_claim_info(provider: &[u8], parameters: &[u8], context: &[u8]) -> [u8; 32] {
    let mut k = Keccak::v256();
    k.update(provider);
    k.update(b"\n");
    k.update(parameters);
    k.update(b"\n");
    k.update(context);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

/// Decimal digits of a `u64`, written into `buf`; returns the slice that was used.
///
/// `sign_data` puts `timestamp_s` and `epoch` in as decimal text, so the contract needs
/// integer-to-string without `alloc`.
pub fn write_u64(mut v: u64, buf: &mut [u8; 20]) -> &[u8] {
    if v == 0 {
        buf[0] = b'0';
        return &buf[..1];
    }
    let mut i = buf.len();
    while v > 0 {
        i -= 1;
        buf[i] = b'0' + (v % 10) as u8;
        v /= 10;
    }
    &buf[i..]
}

/// The EIP-191 digest the attestor signed.
///
/// `identifier_hex` is the 66-byte `0x…` form, `owner_hex_lowercase` the 42-byte `0x…`
/// address **already lowercased** — a checksummed address produces a different digest
/// and an unexplained `SignatureMismatch`.
pub fn message_digest(
    identifier_hex: &[u8; 66],
    owner_hex_lowercase: &[u8; 42],
    timestamp_s: u64,
    epoch: u64,
) -> [u8; 32] {
    let mut ts_buf = [0u8; 20];
    let ts = write_u64(timestamp_s, &mut ts_buf);
    let mut ep_buf = [0u8; 20];
    let ep = write_u64(epoch, &mut ep_buf);

    // sign_data length: identifier + \n + owner + \n + ts + \n + epoch
    let len = 66 + 1 + 42 + 1 + ts.len() + 1 + ep.len();
    let mut len_buf = [0u8; 20];
    let len_txt = write_u64(len as u64, &mut len_buf);

    let mut k = Keccak::v256();
    k.update(b"\x19Ethereum Signed Message:\n");
    k.update(len_txt);
    k.update(identifier_hex);
    k.update(b"\n");
    k.update(owner_hex_lowercase);
    k.update(b"\n");
    k.update(ts);
    k.update(b"\n");
    k.update(ep);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

/// Rebuild the canonical context for a single-value provider and compare it.
///
/// The cheap alternative to parsing JSON on chain. For an AdSense claim the canonical
/// context is exactly:
///
/// ```text
/// {"extractedParameters":{"<key>":"<value>"},"providerHash":"<hash>"}
/// ```
///
/// so the contract can be handed `value` and `provider_hash`, rebuild that string, and
/// check it against the context it is about to hash. If they match, the value is bound
/// to the identifier and therefore to the attestor's signature — without a parser.
///
/// Returns false on any difference, including ordering and whitespace, which is the
/// point: the comparison is byte-exact or it is worthless.
pub fn canonical_context_matches(
    context: &[u8],
    key: &[u8],
    value: &[u8],
    provider_hash: &[u8],
) -> bool {
    let mut cursor = 0usize;
    let mut eat = |part: &[u8]| -> bool {
        if context.len() < cursor + part.len() || &context[cursor..cursor + part.len()] != part {
            return false;
        }
        cursor += part.len();
        true
    };
    if !eat(br#"{"extractedParameters":{""#) { return false; }
    if !eat(key) { return false; }
    if !eat(br#"":""#) { return false; }
    if !eat(value) { return false; }
    if !eat(br#""},"providerHash":""#) { return false; }
    if !eat(provider_hash) { return false; }
    if !eat(br#""}"#) { return false; }
    cursor == context.len()
}

#[cfg(test)]
mod tests;
