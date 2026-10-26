//! Rebuilding the exact bytes a Reclaim attestor signed, inside the contract (#9).
//!
//! The chain, frozen in `docs/interface.md` §1 and proven in #3 against a real
//! attestor signature:
//!
//! ```text
//! identifier = keccak256(provider \n parameters \n canonical_context)
//! sign_data  = identifier \n owner_lowercase \n timestamp_s \n epoch
//! digest     = keccak256("\x19Ethereum Signed Message:\n" + len(sign_data) + sign_data)
//! ```
//!
//! # Nothing here is taken from the caller unchecked
//!
//! `provider` and `parameters` are **rebuilt from a pinned template**, never read from a
//! submitted string. The attestor signs whatever the fetched server returned, so a zkFetch
//! against `attacker.example` returning a large `totals` carries a perfectly valid
//! signature; a contract that accepts a `parameters` string cannot tell it from the real
//! one. Pinning also removes Reclaim's separator ambiguity, where `provider="a",
//! parameters="b\nc"` hashes identically to `provider="a\nb", parameters="c"`.
//!
//! The caller supplies only values that vary, and every one of them lands inside the
//! bytes that get hashed. If any is wrong, the digest is wrong, and the verifier refuses.

use soroban_sdk::{Address, Bytes, Env, String, Vec};

/// Reclaim's HTTP provider. Constant, never submitted.
pub const PROVIDER: &[u8] = b"http";

/// The `contextMessage` every Forepay claim must carry.
///
/// Checked rather than accepted: a claim produced for some other application, with the
/// same publisher and window, must not be spendable here.
pub const CONTEXT_MESSAGE: &[u8] = b"Forepay advance request";

/// A soroban `String` as raw UTF-8 bytes.
///
/// `String::copy_into_slice` panics unless the slice length matches exactly, so the
/// buffer is sized from `len()` first. Capped at 512 bytes — every field this contract
/// accepts is a publisher id, a date or a decimal figure, and a caller sending more than
/// that is not describing an AdSense account.
pub fn string_bytes(env: &Env, s: &String) -> Option<Bytes> {
    let len = s.len() as usize;
    if len > 512 {
        return None;
    }
    let mut buf = [0u8; 512];
    s.copy_into_slice(&mut buf[..len]);
    Some(Bytes::from_slice(env, &buf[..len]))
}

/// Rebuild `parameters` by interleaving pinned literals with caller values.
///
/// `parts` holds the literal segments of the request template, and the values are placed
/// between them in a fixed order: publisher id, window start, window end. There is no
/// search-and-replace and no parsing — a template of N parts takes exactly N-1 values, so
/// a caller cannot introduce a segment the admin did not pin.
///
/// Returns `None` if the template does not have exactly one more part than there are
/// values, which means the stored template does not match this contract version.
pub fn rebuild_parameters(parts: &Vec<Bytes>, values: &[Bytes]) -> Option<Bytes> {
    if parts.len() as usize != values.len() + 1 {
        return None;
    }
    let mut out = parts.get(0)?;
    for (i, value) in values.iter().enumerate() {
        out.append(value);
        out.append(&parts.get(i as u32 + 1)?);
    }
    Some(out)
}

/// Split `"YYYY-MM-DD"` into the three unpadded ASCII numbers AdSense takes (#76).
///
/// The AdSense Management API has **no string form for a date**. `startDate` and `endDate`
/// on `accounts.reports.generate` are `object (Date)` — `{year, month, day}` as *integers*
/// — which the REST transport flattens into `startDate.year=2026&startDate.month=7&
/// startDate.day=1`. Integers, so `7`, never `07`.
///
/// So the contract takes the window in the one form a human and a nullifier can both read,
/// `YYYY-MM-DD`, and produces the six values the signed URL actually carries. The interface
/// and the nullifier are unchanged; only what gets interleaved into the template changes.
///
/// Fixed-width parsing of exactly ten bytes. No JSON, no allocation beyond the three
/// outputs, and every byte is checked: a caller cannot smuggle a `&` or a digit-shaped
/// surprise into the URL this helps rebuild.
///
/// Returns `None` for anything that is not exactly `dddd-dd-dd`.
pub fn split_date(env: &Env, date: &Bytes) -> Option<(Bytes, Bytes, Bytes)> {
    if date.len() != 10 {
        return None;
    }
    let mut b = [0u8; 10];
    date.copy_into_slice(&mut b);
    if b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    for (i, c) in b.iter().enumerate() {
        if i != 4 && i != 7 && !c.is_ascii_digit() {
            return None;
        }
    }
    Some((
        unpadded(env, &b[0..4]),
        unpadded(env, &b[5..7]),
        unpadded(env, &b[8..10]),
    ))
}

/// ASCII digits with leading zeros removed, as an integer is serialised. `"07"` → `"7"`,
/// `"00"` → `"0"`. Never empty, so the rebuilt URL always has a value where one belongs.
fn unpadded(env: &Env, digits: &[u8]) -> Bytes {
    let mut i = 0;
    while i + 1 < digits.len() && digits[i] == b'0' {
        i += 1;
    }
    Bytes::from_slice(env, &digits[i..])
}

/// Rebuild the canonical context, byte for byte.
///
/// Canonical context is sorted-key JSON with no whitespace, so the key order below is
/// alphabetical because that is what canonicalisation produces — it is not style and must
/// not be tidied. Building it rather than parsing it keeps a JSON parser out of the wasm,
/// where its bugs would be indistinguishable from a bad proof.
///
/// # Why `extractedParameters` holds only the figure (#76)
///
/// It used to carry `currency`, `startDate` and `endDate` too. Those cannot be there: a
/// Reclaim `responseMatches` regex captures one contiguous substring, and AdSense echoes
/// the window back as `"startDate":{"year":2026,"month":7,"day":1}` — there is no
/// `"2026-07-01"` anywhere in the response to capture. A context asking for one describes
/// a proof the provider cannot produce, which is why every real AdSense proof was refused.
///
/// Neither field is lost, only moved to where it is actually signed:
///
/// * **the currency** by the `"currencyCode": "USD"` match, which lives in `parameters`;
/// * **the window** by the URL, which lives in `parameters` too — Google computes the
///   totals *for the window in the URL*, so the URL alone fixes the period.
///
/// `parameters` is pinned in this contract and rebuilt here, so both are as strongly held
/// as they were in the context. Nothing moved outside the signature.
pub fn rebuild_context(
    env: &Env,
    borrower: &Bytes,
    revenue_usd: &Bytes,
    provider_hash: &Bytes,
) -> Bytes {
    let mut out = Bytes::from_slice(env, br#"{"contextAddress":""#);
    out.append(borrower);
    out.extend_from_slice(br#"","contextMessage":""#);
    out.extend_from_slice(CONTEXT_MESSAGE);
    out.extend_from_slice(br#"","extractedParameters":{"revenueUsd":""#);
    out.append(revenue_usd);
    out.extend_from_slice(br#""},"providerHash":""#);
    out.append(provider_hash);
    out.extend_from_slice(br#""}"#);
    out
}

/// `keccak256(provider \n parameters \n context)`, as 32 raw bytes.
pub fn identifier(env: &Env, parameters: &Bytes, context: &Bytes) -> [u8; 32] {
    let mut buf = Bytes::from_slice(env, PROVIDER);
    buf.extend_from_slice(b"\n");
    buf.append(parameters);
    buf.extend_from_slice(b"\n");
    buf.append(context);

    let mut out = [0u8; 32];
    env.crypto()
        .keccak256(&buf)
        .to_bytes()
        .copy_into_slice(&mut out);
    out
}

/// Lowercase `0x…` hex, the form Reclaim writes identifiers in.
pub fn hex_prefixed(bytes: &[u8; 32]) -> [u8; 66] {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = [0u8; 66];
    out[0] = b'0';
    out[1] = b'x';
    for (i, b) in bytes.iter().enumerate() {
        out[2 + i * 2] = HEX[(b >> 4) as usize];
        out[3 + i * 2] = HEX[(b & 0x0f) as usize];
    }
    out
}

/// Decimal digits of a `u64`. `sign_data` carries the timestamp and epoch as text.
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
/// `owner` must already be lowercase — a checksummed address produces a different digest
/// and an unexplained `SignatureMismatch`, which is the hardest kind of failure to read.
pub fn message_digest(
    env: &Env,
    identifier_hex: &[u8; 66],
    owner_lowercase: &Bytes,
    timestamp_s: u64,
    epoch: u64,
) -> Bytes {
    let mut ts_buf = [0u8; 20];
    let ts = write_u64(timestamp_s, &mut ts_buf);
    let mut ep_buf = [0u8; 20];
    let ep = write_u64(epoch, &mut ep_buf);

    let sign_data_len = 66 + 1 + owner_lowercase.len() as usize + 1 + ts.len() + 1 + ep.len();
    let mut len_buf = [0u8; 20];
    let len_txt = write_u64(sign_data_len as u64, &mut len_buf);

    let mut buf = Bytes::from_slice(env, b"\x19Ethereum Signed Message:\n");
    buf.extend_from_slice(len_txt);
    buf.extend_from_slice(identifier_hex);
    buf.extend_from_slice(b"\n");
    buf.append(owner_lowercase);
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(ts);
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(ep);

    env.crypto().keccak256(&buf).to_bytes().into()
}

/// The borrower's `G…` address as the bytes that appear in `contextAddress`.
///
/// Taken from the `Address` the caller passed and converted here, so the string hashed
/// into the identifier is the one the contract will actually pay. A separately submitted
/// address string could differ from the `Address`, and the signature would still verify.
pub fn borrower_bytes(env: &Env, borrower: &Address) -> Option<Bytes> {
    string_bytes(env, &borrower.to_string())
}

/// `0x` followed by exactly 40 hex digits, either case: the shape of a Reclaim owner.
pub fn is_eth_address(b: &Bytes) -> bool {
    if b.len() != 42 || b.get(0) != Some(b'0') || b.get(1) != Some(b'x') {
        return false;
    }
    (2..42).all(|i| matches!(b.get(i), Some(c) if c.is_ascii_hexdigit()))
}

/// ASCII-lowercase a byte string.
///
/// Reclaim lowercases `owner` before signing, so the digest must be built from the
/// lowercase form. A checksummed address hashes differently and comes back as an
/// unexplained `SignatureMismatch`, which is the hardest failure in this pipeline to read.
///
/// Stellar `G…` strkeys are already uppercase base32 and unaffected; this exists for the
/// Ethereum-style addresses Reclaim also allows as owners, and costs nothing when the
/// input has no lowercase to apply.
pub fn lowercase(env: &Env, b: &Bytes) -> Bytes {
    let len = b.len() as usize;
    if len > 512 {
        return b.clone();
    }
    let mut buf = [0u8; 512];
    b.copy_into_slice(&mut buf[..len]);
    for c in buf[..len].iter_mut() {
        if c.is_ascii_uppercase() {
            *c += 32;
        }
    }
    Bytes::from_slice(env, &buf[..len])
}

/// The nullifier for a publisher and a reporting window.
///
/// Keyed on the **economic thing being borrowed against** — the account and the period —
/// not on the proof's bytes. A nullifier keyed on the proof identifier would be wrong:
/// any difference in the response at all (a recalculated total, a trailing zero, a window
/// boundary landing a day differently) mints a fresh identifier and would fund a second
/// advance against the same revenue.
///
/// Each field is **length-prefixed** rather than separated by a delimiter. Reclaim's own
/// claim format concatenates with `\n` and is ambiguous because of it — `provider="a",
/// parameters="b\nc"` hashes identically to `provider="a\nb", parameters="c"`, which #3
/// pinned with a test. Length prefixes cost four bytes each and remove the question, so
/// no caller can shift a boundary between the publisher id and the window.
pub fn nullifier_of(env: &Env, pub_id: &Bytes, window_start: &Bytes, window_end: &Bytes) -> Bytes {
    let mut buf = Bytes::new(env);
    for field in [pub_id, window_start, window_end] {
        buf.extend_from_slice(&field.len().to_be_bytes());
        buf.append(field);
    }
    env.crypto().sha256(&buf).to_bytes().into()
}
