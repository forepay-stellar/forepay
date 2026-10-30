#!/usr/bin/env python3
"""Derive the eight claim-template parts from a real proof, and prove them (#61).

    python3 tools/pin_template.py PROOF.json --pub-id pub-… --start 2026-07-01 --end 2026-09-30
    python3 tools/pin_template.py PROOF.json ... --contract C… --command
    python3 tools/pin_template.py PROOF.json --source admob ...      # an AdMob proof (#96)

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
2. **Structure.** Each value must sit immediately after the one separator it belongs to. For
   AdSense, every separator between two values ends with `=` and the first part ends with
   `/`. For AdMob, each date number follows its JSON key in the body (`"startDate":{"year":`,
   `"month":`, `"day":`) and the publisher id follows `/accounts/`. This is what actually
   catches a wrong occurrence: a split inside a publisher id or a regex does not land on
   one of those boundaries.
3. **The attestor's own signature.** The identifier is recomputed from the rebuilt
   `parameters` and the claim's `context` and compared with the identifier the attestor
   signed. If that matches, the bytes are right because the signature says so, not because
   this script believes its own string surgery.

**The value order depends on the source** (#94, #96). The attestor sorts the parameters'
keys, so for AdMob `body`, which holds the window, comes before `url`, which holds the
publisher id: the order is `[sy, sm, sd, ey, em, ed, pub_id]`, the reverse of AdSense's.

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


# What each value must immediately follow in the signed parameters, per source, in the order
# the values appear. The AdMob body is a JSON string inside the parameters' JSON, so its
# quotes arrive escaped.
SOURCES = {
    "adsense": {
        "pub_first": True,
        "after": ["/", "=", "=", "=", "=", "=", "="],
    },
    "admob": {
        "pub_first": False,
        "after": [
            '\\"startDate\\":{\\"year\\":', '\\"month\\":', '\\"day\\":',
            '\\"endDate\\":{\\"year\\":', '\\"month\\":', '\\"day\\":',
            "/accounts/",
        ],
    },
}


def values_for(pub_id: str, start: str, end: str, source: str = "adsense") -> list[str]:
    for d in (start, end):
        if not DATE.match(d):
            raise SystemExit(f"not a YYYY-MM-DD date: {d}")
    dates: list[str] = []
    for d in (start, end):
        dates += [unpadded(p) for p in d.split("-")]
    return [pub_id] + dates if SOURCES[source]["pub_first"] else dates + [pub_id]


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
          provider: str, context: str, identifier: str, source: str = "adsense") -> None:
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
    for i, sep in enumerate(SOURCES[source]["after"]):
        if not parts[i].endswith(sep):
            problems.append(f"part {i} should end with {sep!r} before value {i}, ends {parts[i][-len(sep) - 8:]!r}")
    if problems:
        raise SystemExit(f"the split did not land on the {source} boundaries:\n  - " + "\n  - ".join(problems))
    print(f"  structure ........ every value sits immediately after its own {source} separator")

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


def self_test_one(name: str, source: str) -> None:
    fx = json.loads((Path(__file__).parent / "fixtures" / name).read_text())
    values = values_for(fx["pubId"], fx["windowStart"], fx["windowEnd"], source)
    print(f"self-test ({source}) against tools/fixtures/{name}")
    print(f"  values     {values}")
    print("checks:")
    parts = split_parts(fx["parameters"], values)
    check(parts, values, fx["parameters"], "http", fx["context"], fx["identifier"], source)
    if len(parts) != 8:
        raise SystemExit(f"expected 8 parts, derived {len(parts)}")
    print("  arity ............ 8 parts for 7 values, which is what set_claim_template takes")

    # A window the proof was not signed for must fail loudly rather than produce a
    # plausible-looking template for the wrong period.
    try:
        wrong = values_for(fx["pubId"], "2025-01-01", "2025-03-31", source)
        check(split_parts(fx["parameters"], wrong), wrong, fx["parameters"], "http", fx["context"], fx["identifier"], source)
    except SystemExit:
        print("  wrong window ..... refused, as it must be")
    else:
        raise SystemExit("a window the proof was not signed for was accepted")

    # The other source's value order must be refused too: that is the #94 mistake, and
    # it has to fail here rather than as an unexplained ClaimMismatch on chain.
    other = "adsense" if source == "admob" else "admob"
    try:
        swapped = values_for(fx["pubId"], fx["windowStart"], fx["windowEnd"], other)
        check(split_parts(fx["parameters"], swapped), swapped, fx["parameters"], "http", fx["context"], fx["identifier"], source)
    except SystemExit:
        print(f"  {(other + ' order '):.<18} refused, as it must be")
    else:
        raise SystemExit(f"the {other} value order was accepted for a {source} proof")


def self_test() -> int:
    """Run the whole derivation against the signed fixture, with no real proof needed.

    The point of a tool that only runs once, on the most consequential day of the project,
    is that it has to be known-good before that day. So this builds a Reclaim-shaped proof
    out of `tools/fixtures/forepay-claim.json` — whose parameters, context and identifier
    were produced by the same code path the contract rebuilds — and derives the template
    from it exactly as it will from the real one.

    It also checks the failures that matter: a wrong window, and the other source's value
    order, must be refused, not guessed at. The AdMob fixture, `tools/fixtures/admob-claim.json`,
    is the relay's own request; `be/src/admob/fixture.test.ts` fails if they drift apart.
    """
    self_test_one("forepay-claim.json", "adsense")
    print()
    self_test_one("admob-claim.json", "admob")
    print("\nself-test passed: both derivations work, and refuse a window or a value order they were not given")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    if "--self-test" in sys.argv:
        return self_test()
    ap.add_argument("--self-test", action="store_true", help="prove the derivation against the signed fixture")
    ap.add_argument("proof", help="a real Reclaim proof, as JSON")
    ap.add_argument("--source", choices=sorted(SOURCES), default="adsense", help="which product the proof is from")
    ap.add_argument("--pub-id", required=True, help="the publisher id in the signed URL")
    ap.add_argument("--start", required=True, help="window start, YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="window end, YYYY-MM-DD")
    ap.add_argument("--contract", help="print the invoke command for this contract")
    ap.add_argument("--command", action="store_true", help="print the invoke command")
    a = ap.parse_args()

    proof = json.loads(Path(a.proof).read_text())
    provider, parameters, context, identifier = read_claim(proof)
    values = values_for(a.pub_id, a.start, a.end, a.source)

    print(f"proof: {a.proof} ({a.source})")
    print(f"  provider   {provider}")
    print(f"  values     {values}")
    print("checks:")
    parts = split_parts(parameters, values)
    check(parts, values, parameters, provider, context, identifier, a.source)

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
