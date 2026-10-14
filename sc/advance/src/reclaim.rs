//! A typed client for Reclaim's deployed verifier.
//!
//! Declared by hand rather than through `contractimport!`, which would mean vendoring
//! their wasm into this repository. The interface below was read off the live testnet
//! contract `CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5` with
//! `stellar contract info interface` on 2026-10-09 (#2).
//!
//! `verify_proof` recovers a secp256k1 signer from the digest and checks the recovered
//! address against the witnesses in the current epoch. It does **not** parse a claim, and
//! it does not build the digest — that is `claim.rs`, and it is why one wrong byte comes
//! back as a bare `SignatureMismatch`.

use soroban_sdk::{contractclient, contracterror, BytesN, Env};

/// Reclaim's error table, as the deployed contract declares it.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReclaimError {
    OnlyOwner = 1,
    AlreadyInitialized = 2,
    HashMismatch = 3,
    LengthMismatch = 4,
    /// The recovered address is not a witness in the current epoch.
    SignatureMismatch = 5,
}

#[contractclient(name = "ReclaimClient")]
#[allow(dead_code)] // the generated client is what we use; the trait documents the ABI
pub trait ReclaimVerifier {
    fn verify_proof(
        env: Env,
        message_digest: BytesN<32>,
        signature: BytesN<64>,
        recovery_id: u32,
    ) -> Result<(), ReclaimError>;
}
