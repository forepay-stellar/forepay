#!/usr/bin/env python3
"""Check every link in the evidence pack, on the day it is submitted (#27).

    python3 tools/check_links.py                  # docs/evidence.md
    python3 tools/check_links.py docs/*.md        # any markdown
    python3 tools/check_links.py --no-network     # local paths and anchors only

A dead link in an evidence pack costs more credibility than a missing feature. A missing
feature is a scoping conversation; a dead link reads as nobody having checked. So this is
run against the pack itself on submission day, not on the day each row was written.

What it checks:

* **local paths** resolve, relative to the file holding the link;
* **in-page anchors** match a heading in the target file, with GitHub's slug rules;
* **http(s) links** answer. stellar.expert transaction and contract pages are checked
  through Horizon and the Stellar RPC instead of by fetching the page: the explorer is a
  JavaScript app, so a 200 from it says nothing about whether the transaction exists.
  A ledger entry that is really there is the claim being made, so that is what is tested.
* **the contract's source verification**, live from StellarExpert's API — because
  "verified" is the one claim in the pack that can stop being true without anyone
  touching the repository.

Exit code is non-zero if anything fails, so it can gate a release.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT = ["docs/evidence.md"]

HORIZON = "https://horizon-testnet.stellar.org"
EXPERT_API = "https://api.stellar.expert/explorer/testnet"
TIMEOUT = 25

LINK = re.compile(r"\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
BARE = re.compile(r"<(https?://[^>\s]+)>")
HEADING = re.compile(r"^#{1,6}\s+(.*)$", re.M)

TX = re.compile(r"^https://stellar\.expert/explorer/testnet/tx/([0-9a-f]{64})$")
CONTRACT = re.compile(r"^https://stellar\.expert/explorer/testnet/contract/(C[A-Z2-7]{55})$")


# StellarExpert's API sits behind Cloudflare, which answers 403 to a bare urllib
# User-Agent. The first version of this script reported every contract as missing from
# testnet because of it — a checker that cries wolf is worse than no checker, since the
# next person learns to ignore it.
AGENT = "Mozilla/5.0 (compatible; forepay-link-check/1.0)"


def get_json(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError):
        return None


def head_ok(url: str) -> tuple[bool, str]:
    """Does this URL answer? GET rather than HEAD — too many hosts refuse HEAD."""
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return (r.status < 400, str(r.status))
    except urllib.error.HTTPError as e:
        # 403 and 429 are the host declining to be scraped, not a dead link.
        return (e.code in (403, 429), f"{e.code}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return (False, f"{type(e).__name__}: {e}")


def slug(heading: str) -> str:
    """GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens."""
    text = re.sub(r"[`*_~]", "", heading).strip()
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s]+", "-", text).strip("-")


def anchors_of(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    return {slug(h) for h in HEADING.findall(path.read_text(encoding="utf-8", errors="replace"))}


def links_in(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return LINK.findall(text) + BARE.findall(text)


def check_file(path: Path, network: bool) -> list[str]:
    failures: list[str] = []
    seen: set[str] = set()
    for target in links_in(path):
        if target in seen:
            continue
        seen.add(target)

        if target.startswith("#"):
            if slug(target[1:]) not in anchors_of(path):
                failures.append(f"{path}: no heading for anchor {target}")
            continue

        if target.startswith(("http://", "https://")):
            if not network:
                continue
            m = TX.match(target)
            if m:
                if not get_json(f"{HORIZON}/transactions/{m.group(1)}"):
                    failures.append(f"{path}: Horizon does not know transaction {m.group(1)[:12]}…")
                continue
            m = CONTRACT.match(target)
            if m:
                if not get_json(f"{EXPERT_API}/contract/{m.group(1)}"):
                    failures.append(f"{path}: no contract {m.group(1)} on testnet")
                continue
            ok, why = head_ok(target)
            if not ok:
                failures.append(f"{path}: {target} -> {why}")
            continue

        # A local path, with an optional anchor.
        rel, _, frag = target.partition("#")
        dest = (path.parent / rel).resolve() if rel else path
        if not dest.exists():
            failures.append(f"{path}: missing file {target}")
        elif frag and dest.is_file() and dest.suffix == ".md" and slug(frag) not in anchors_of(dest):
            failures.append(f"{path}: {rel} has no heading for anchor #{frag}")
    return failures


def check_verification(contract: str) -> list[str]:
    """The pack claims the contract is source-verified. Ask, do not assume."""
    data = get_json(f"{EXPERT_API}/contract/{contract}")
    if data is None:
        return [f"could not reach StellarExpert for {contract}"]
    v = (data or {}).get("validation") or {}
    if v.get("status") != "verified":
        return [f"{contract} is NOT verified on StellarExpert (status: {v.get('status', 'none')})"]
    print(f"  verified: {contract}")
    print(f"            wasm   {data.get('wasm', '?')}")
    print(f"            commit {v.get('commit', '?')}  ({v.get('repository', '?')})")
    return []


PRODUCTION = "CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="*", default=DEFAULT)
    ap.add_argument("--no-network", action="store_true", help="skip every remote check")
    a = ap.parse_args()

    failures: list[str] = []
    for name in a.files or DEFAULT:
        path = (REPO / name).resolve() if not Path(name).is_absolute() else Path(name)
        if not path.is_file():
            failures.append(f"no such file: {name}")
            continue
        count = len(set(links_in(path)))
        print(f"{path.relative_to(REPO)}: {count} distinct links")
        failures += check_file(path, not a.no_network)

    if not a.no_network:
        print("source verification:")
        failures += check_verification(PRODUCTION)

    if failures:
        print(f"\n{len(failures)} problem(s):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("\nevery link resolves" + ("" if a.no_network else " and the contract is verified"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
