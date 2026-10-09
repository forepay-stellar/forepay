"""Minimal secp256k1 sign + public-key recovery, and the Ethereum-style address
derivation the Reclaim verifier performs.

Written for Forepay issue #2: to show `verify_proof` returning SignatureMismatch
we need a *syntactically valid* signature that recovers to an address which is
not the witness. An all-zero signature only proves the host rejects malformed
input, which is a different claim.

Standard curve arithmetic, no dependencies. Not constant-time, not for secrets.
"""
import hashlib

P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8


def inv(a, m):
    return pow(a, -1, m)


def add(p, q):
    if p is None:
        return q
    if q is None:
        return p
    if p[0] == q[0] and (p[1] + q[1]) % P == 0:
        return None
    if p == q:
        lam = (3 * p[0] * p[0]) * inv(2 * p[1], P) % P
    else:
        lam = (q[1] - p[1]) * inv(q[0] - p[0], P) % P
    x = (lam * lam - p[0] - q[0]) % P
    return (x, (lam * (p[0] - x) - p[1]) % P)


def mul(k, p=(GX, GY)):
    r = None
    while k:
        if k & 1:
            r = add(r, p)
        p = add(p, p)
        k >>= 1
    return r


def keccak256(b: bytes) -> bytes:
    """Keccak-256 (the pre-NIST padding Ethereum uses), pure Python."""
    RC = [0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
          0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
          0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
          0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
          0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
          0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008]
    ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
           [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
    M = (1 << 64) - 1
    rol = lambda x, n: ((x << n) | (x >> (64 - n))) & M
    rate = 136
    pad = bytearray(b) + b"\x01"
    while len(pad) % rate != 0:
        pad += b"\x00"
    pad[-1] |= 0x80
    S = [[0] * 5 for _ in range(5)]
    for off in range(0, len(pad), rate):
        blk = pad[off:off + rate]
        for i in range(rate // 8):
            S[i % 5][i // 5] ^= int.from_bytes(blk[i * 8:i * 8 + 8], "little")
        for rnd in range(24):
            C = [S[x][0] ^ S[x][1] ^ S[x][2] ^ S[x][3] ^ S[x][4] for x in range(5)]
            D = [C[(x - 1) % 5] ^ rol(C[(x + 1) % 5], 1) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    S[x][y] ^= D[x]
            B = [[0] * 5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    B[y][(2 * x + 3 * y) % 5] = rol(S[x][y], ROT[x][y])
            for x in range(5):
                for y in range(5):
                    S[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y] & M) & B[(x + 2) % 5][y])
            S[0][0] ^= RC[rnd]
    out = b""
    for i in range(4):
        out += S[i % 5][i // 5].to_bytes(8, "little")
    return out[:32]


def sign(digest: bytes, priv: int):
    """Return (r, s, recovery_id) with s normalised low, as the host expects."""
    z = int.from_bytes(digest, "big")
    k = (int.from_bytes(hashlib.sha256(digest + priv.to_bytes(32, "big")).digest(), "big") % (N - 1)) + 1
    R = mul(k)
    r = R[0] % N
    s = (inv(k, N) * (z + r * priv)) % N
    rec = (R[1] & 1) | (2 if R[0] >= N else 0)
    if s > N // 2:          # low-s normalisation flips the recovery parity
        s = N - s
        rec ^= 1
    return r, s, rec


def address_of(priv: int) -> bytes:
    """Ethereum-style address: keccak256(uncompressed pubkey without 0x04)[12:]."""
    pub = mul(priv)
    return keccak256(pub[0].to_bytes(32, "big") + pub[1].to_bytes(32, "big"))[12:]


def decompress(x, odd):
    """Lift an x-coordinate back to a curve point with the given y parity."""
    y = pow((x * x * x + 7) % P, (P + 1) // 4, P)
    if (y & 1) != odd:
        y = P - y
    return (x, y)


def recover(digest: bytes, r: int, s: int, rec_id: int):
    """Public key recovery: Q = r^-1 (sR - zG). Mirrors secp256k1_recover."""
    z = int.from_bytes(digest, "big")
    x = r + (rec_id >> 1) * N
    R = decompress(x, rec_id & 1)
    rinv = inv(r, N)
    Q = add(mul((s * rinv) % N, R), mul((N - (z * rinv) % N) % N))
    return Q


def address_of_point(Q) -> bytes:
    return keccak256(Q[0].to_bytes(32, "big") + Q[1].to_bytes(32, "big"))[12:]


def canonical_stringify(o) -> str:
    """JSON with object keys sorted, no whitespace — Reclaim's canonicalStringify."""
    import json
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def identifier_of(provider: str, parameters: str, context: str) -> str:
    """keccak256(provider \n parameters \n canonical(context)), lowercase 0x hex."""
    if context:
        context = canonical_stringify(__import__("json").loads(context))
    return "0x" + keccak256(f"{provider}\n{parameters}\n{context}".encode()).hex()


def sign_data_for_claim(identifier: str, owner: str, timestamp_s: int, epoch: int) -> str:
    return f"{identifier}\n{owner.lower()}\n{timestamp_s}\n{epoch}"


def eip191_digest(sign_data: str) -> bytes:
    msg = f"\x19Ethereum Signed Message:\n{len(sign_data)}{sign_data}"
    return keccak256(msg.encode())


if __name__ == "__main__":
    # Self-test against published vectors, then print the issue #2 probe values.
    assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    assert keccak256(b"abc").hex() == "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
    assert address_of(0x4646464646464646464646464646464646464646464646464646464646464646).hex() \
        == "9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f"
    print("self-test OK (keccak256 + address derivation match published vectors)")

    # Throwaway probe witness, committed so the probe is reproducible.
    #
    # WARNING: because this key is public, the probe verifier instance
    # (CASAIKW7EOWC3RUBS34IAW6ETXBXI4KOQNMXO66DK7LRBN5MXAWWZURP) will accept a
    # signature from anyone who reads this file. That is fine for a test
    # harness and fatal if the advance contract is ever pointed at it. Rotate
    # the witness to the production attestor first — see docs/deployments.md.
    PROBE_KEY = 0x1111111111111111111111111111111111111111111111111111111111111111
    digest = hashlib.sha256(b"forepay issue #2 probe").digest()
    r, s, rec = sign(digest, PROBE_KEY)
    print("witness address :", address_of(PROBE_KEY).hex())
    print("message_digest  :", digest.hex())
    print("signature       :", (r.to_bytes(32, "big") + s.to_bytes(32, "big")).hex())
    print("recovery_id     :", rec)
