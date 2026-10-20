#!/usr/bin/env python3
"""Derive the eight claim-template parts from a real proof, and prove them (#61).

    python3 tools/pin_template.py PROOF.json --pub-id pub-… --start 2026-07-01 --end 2026-09-30
    python3 tools/pin_template.py PROOF.json ... --contract C… --command

`set_claim_template` takes the literal segments of the request the attestor signed, with
seven values interleaved between them (`docs/interface.md` §2). Those bytes can only come
from a real proof: the canonical `parameters` string carries `body`, `headers`, `method`,
`responseMatches` and `responseRedactions` before `url`, in sorted-key order, and one wrong
byte anywhere produces a different identifier and an unexplained `ClaimMismatch` — the
hardest failure in this pipeline to read.

So this exists to stop that being done by hand on the day it matters. It splits the real
`parameters` at the seven values and then **proves the split three ways**:

1. **Round trip.** Interleaving the parts with the values reproduces `parameters` byte for
   byte. Necessary but weak on its own — a split at the wrong occurrence of a short value
   like `"1"` also round-trips.
2. **Structure.** Every separator between two values must end with `=`, and the first part
   must end with `/`. This is what actually catches a wrong occurrence: a split inside a
   publisher id or a regex does not land on a query-parameter boundary.
3. **The attestor's own signature.** The identifier is recomputed from the rebuilt
   `parameters` and the claim's `context` and compared with the identifier the attestor
   signed. If that matches, the bytes are right because the signature says so, not because
   this script believes its own string surgery.

It writes nothing to chain. With `--command` it prints the `stellar contract invoke` line,
for a human to read and run.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import secp256k1_probe as secp  # noqa: E402

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def unpadded(digits: str) -> str:
    """ASCII digits as an integer is serialised: `"07"` -> `"7"`. AdSense takes integers."""
    return str(int(digits))


def values_for(pub_id: str, start: str, end: str) -> list[str]:
    for d in (start, end):
        if not DATE.match(d):
            raise SystemExit(f"not a YYYY-MM-DD date: {d}")
    out = [pub_id]
    for d in (start, end):
        out += [unpadded(p) for p in d.split("-")]
    return out


def read_claim(proof: dict) -> tuple[str, str, str, str]:
    """`(provider, parameters, context, identifier)` from either proof shape Reclaim emits."""
    info = proof.get("claimInfo") or proof.get("claimData") or {}
    claim = (proof.get("signedClaim") or {}).get("claim") or proof.get("claimData") or {}
    provider = info.get("provider") or claim.get("provider")
    parameters = info.get("parameters") or claim.get("parameters")
    context = info.get("context") or claim.get("context")
    identifier = claim.get("identifier") or proof.get("identifier")
    missing = [n for n, v in (("provider", provider), ("parameters", parameters),
                              ("context", context), ("identifier", identifier)) if not v]
    if missing:
        raise SystemExit(f"the proof is missing {', '.join(missing)}")
    return provider, parameters, context, identifier


def split_parts(parameters: str, values: list[str]) -> list[str]:
    """The literal segments around `values`, found left to right."""
    parts: list[str] = []
    cursor = 0
    for i, value in enumerate(values):
        at = parameters.find(value, cursor)
        if at < 0:
            raise SystemExit(
                f"value {i} ({value!r}) does not appear in the signed parameters after offset "
                f"{cursor}. The window or publisher id does not match this proof."
            )
        parts.append(parameters[cursor:at])
        cursor = at + len(value)
    parts.append(parameters[cursor:])
    return parts


def check(parts: list[str], values: list[str], parameters: str,
          provider: str, context: str, identifier: str) -> None:
    if len(parts) != len(values) + 1:
        raise SystemExit(f"{len(parts)} parts for {len(values)} values; the contract wants exactly 8 parts")

    rebuilt = parts[0]
    for i, value in enumerate(values):
        rebuilt += value + parts[i + 1]
    if rebuilt != parameters:
        raise SystemExit("the rebuilt parameters differ from the signed ones")
    print("  round trip ....... the parts and values reproduce the signed parameters exactly")

    # The check that actually matters. A split at the wrong occurrence of "1" or "7"
    # round-trips perfectly and produces a template that breaks for every other window.
    problems = []
    if not parts[0].endswith("/"):
        problems.append(f"part 0 should end with '/' before the publisher id, ends {parts[0][-12:]!r}")
    for i in range(1, len(values)):
        if not parts[i].endswith("="):
            problems.append(f"part {i} should end with '=' before a date value, ends {parts[i][-14:]!r}")
    if problems:
        raise SystemExit("the split did not land on query-parameter boundaries:\n  - " + "\n  - ".join(problems))
    print("  structure ........ every value sits immediately after a '=' or the accounts path")

    got = "0x" + secp.keccak256(f"{provider}\n{parameters}\n{context}".encode()).hex()
    if got.lower() != identifier.lower():
        raise SystemExit(
            f"the recomputed identifier does not match the one the attestor signed\n"
            f"  signed:     {identifier}\n  recomputed: {got}\n"
            "Either the proof is not canonical or provider/context were read wrongly."
        )
    print(f"  signature ........ identifier recomputes to {identifier}, which the attestor signed")


def provider_hash_of(context: str) -> str:
    m = re.search(r'"providerHash"\s*:\s*"([^"]+)"', context)
    if not m:
        raise SystemExit("no providerHash in the signed context")
    return m.group(1)


def self_test() -> int:
    """Run the whole derivation against the signed fixture, with no real proof needed.

    The point of a tool that only runs once, on the most consequential day of the project,
    is that it has to be known-good before that day. So this builds a Reclaim-shaped proof
    out of `tools/fixtures/forepay-claim.json` — whose parameters, context and identifier
    were produced by the same code path the contract rebuilds — and derives the template
    from it exactly as it will from the real one.

    It also checks the failure that matters: a wrong window must be refused, not guessed at.
    """
    fx = json.loads((Path(__file__).parent / "fixtures" / "forepay-claim.json").read_text())
    proof = {
        "claimInfo": {"provider": "http", "parameters": fx["parameters"], "context": fx["context"]},
        "signedClaim": {"claim": {"identifier": fx["identifier"]}},
    }
    values = values_for(fx["pubId"], fx["windowStart"], fx["windowEnd"])
    print("self-test against tools/fixtures/forepay-claim.json")
    print(f"  values     {values}")
    print("checks:")
    parts = split_parts(proof["claimInfo"]["parameters"], values)
    check(parts, values, fx["parameters"], "http", fx["context"], fx["identifier"])
    if len(parts) != 8:
        raise SystemExit(f"expected 8 parts, derived {len(parts)}")
    print(f"  arity ............ 8 parts for 7 values, which is what set_claim_template takes")

    # A window the proof was not signed for must fail loudly rather than produce a
    # plausible-looking template for the wrong period.
    try:
        wrong = values_for(fx["pubId"], "2025-01-01", "2025-03-31")
        split_parts(fx["parameters"], wrong)
    except SystemExit:
        print("  wrong window ..... refused, as it must be")
    else:
        raise SystemExit("a window the proof was not signed for was accepted")

    print("\nself-test passed: the derivation works, and refuses a window it was not given")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    if "--self-test" in sys.argv:
        return self_test()
    ap.add_argument("--self-test", action="store_true", help="prove the derivation against the signed fixture")
    ap.add_argument("proof", help="a real Reclaim proof, as JSON")
    ap.add_argument("--pub-id", required=True, help="the AdSense publisher id in the signed URL")
    ap.add_argument("--start", required=True, help="window start, YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="window end, YYYY-MM-DD")
    ap.add_argument("--contract", help="print the invoke command for this contract")
    ap.add_argument("--command", action="store_true", help="print the invoke command")
    a = ap.parse_args()

    proof = json.loads(Path(a.proof).read_text())
    provider, parameters, context, identifier = read_claim(proof)
    values = values_for(a.pub_id, a.start, a.end)

    print(f"proof: {a.proof}")
    print(f"  provider   {provider}")
    print(f"  values     {values}")
    print("checks:")
    parts = split_parts(parameters, values)
    check(parts, values, parameters, provider, context, identifier)

    ph = provider_hash_of(context)
    print(f"\nprovider_hash: {ph}")
    print(f"\n{len(parts)} template parts:")
    for i, p in enumerate(parts):
        shown = p if len(p) <= 96 else p[:60] + " … " + p[-30:]
        print(f"  [{i}] {len(p):>4}B  {shown!r}")

    if a.command or a.contract:
        contract = a.contract or "<CONTRACT_ID>"
        parts_json = json.dumps([p.encode().hex() for p in parts], separators=(",", ":"))
        print(
            "\nTo pin it — runs as the admin, and nothing on this line is a secret:\n\n"
            f"  stellar contract invoke --network testnet --source-account forepay-probe \\\n"
            f"    --id {contract} -- set_claim_template \\\n"
            f"    --parts '{parts_json}' \\\n"
            f"    --provider_hash {ph.encode().hex()}\n\n"
            "The parts are hex because the CLI takes Bytes that way. They are the UTF-8 of the\n"
            "segments printed above — read them before running this.\n\n"
            "Afterwards: read `claim_template()` back, then run `python3 tools/rehearsal.py`."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
