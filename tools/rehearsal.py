#!/usr/bin/env python3
"""Forepay #23 — run the whole pipeline against live testnet and record it.

    python3 tools/rehearsal.py [--contract C...] [--out tools/runs]

Every step writes its evidence the moment it happens — step, action, outcome, tx hash —
to an append-only JSONL file, and the Markdown report is rendered from that file at the
end. Nothing is narrated afterwards.

Two rules this harness exists to obey, both learned the expensive way:

  * **A step that fails is recorded as failed, and the run continues.** A harness that
    retries until the output looks clean is worth nothing: the point is to find out what
    is broken, and a run that can only produce a pass cannot tell you anything.

  * **Silence is not success.** A step that produces no evidence is a failure, not a pass.
    Sterun shipped a harness that exited 0 mid-run because a child process died and left
    its calls unsettled, and reported a pass for a rehearsal that had stopped.

What it cannot do yet, and says so in the report rather than glossing it: the claims are
signed by the probe witness, because only Reclaim's production attestor can sign a real
AdSense response and that is what #5 is blocked on. The digest construction itself was
proven against a real attestor signature in #3 and accepted by Reclaim's own contract, so
what is demonstrated here is the contract's logic, not the cryptography.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import secp256k1_probe as secp  # noqa: E402

NETWORK = "testnet"
SOURCE = "forepay-probe"
EXPERT = "https://stellar.expert/explorer/testnet"

# The development deployment: its verifier is our probe instance, whose witness key is
# published in this repository. Never point this at the verified production contract
# expecting the happy path to pass — it cannot, and should not.
DEV_CONTRACT = "CD25Q4TDGDY6CI3LUIWUOH6SXCH6ETIUCI6FUOBI322GCJL5G3EIHQN4"
PROD_CONTRACT = "CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS"
USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
BORROWER = "GA2CD6PMHMBTCFAQDO3R22BSZN5ZSVTAKVNOKXL2SONZBLGRAYIOWWH2"
OTHER = "GD73M4F7RN74KBLFGJP4WKBMCBJWBOA4SFNOP5HG4NBCDQUQCC2ARSZU"

WITNESS_KEY = 0x1111111111111111111111111111111111111111111111111111111111111111
IMPOSTOR_KEY = 0x3333333333333333333333333333333333333333333333333333333333333333
PROVIDER_HASH = "0x569b93233185c054ed9fda68b5aef8fda180b6d291180450bf757b11bb52f7df"
CONTEXT_MESSAGE = "Forepay advance request"
# Eight literal segments with seven values between them: pub_id, then each date as an
# unpadded year, month and day. AdSense takes `startDate` as an `object (Date)`, which the
# REST transport flattens into three integer query parameters — there is no string date
# form, so a single "2026-07-01" cannot fill them (#76). Same bytes as
# tools/make_claim_fixture.py and be/src/adsense/request.ts.
TEMPLATE = [
    b'{"method":"GET","url":"https://adsense.googleapis.com/v2/accounts/',
    b"/reports:generate?dateRange=CUSTOM&startDate.year=",
    b"&startDate.month=",
    b"&startDate.day=",
    b"&endDate.year=",
    b"&endDate.month=",
    b"&endDate.day=",
    b'&metrics=ESTIMATED_EARNINGS&currencyCode=USD&reportingTimeZone=ACCOUNT_TIME_ZONE"}',
]

STEPS = {
    "P.1": "Preflight: the contract is live, verified, funded, and in a known state",
    "H.1": "A creator proves revenue and receives USDC",
    "H.2": "Partial repayment, then full",
    "N.1": "An invalid proof is rejected (#24)",
    "N.2": "A replayed proof is rejected (#25)",
    "N.3": "A stale proof is rejected (#26)",
    "B.1": "A proof bound to one borrower cannot be spent by another (#18)",
}


class Evidence:
    """Append-only. Every row is flushed before the next action runs."""

    def __init__(self, run_dir: Path):
        run_dir.mkdir(parents=True, exist_ok=True)
        self.dir = run_dir
        self.path = run_dir / "evidence.jsonl"
        self.rows: list[dict] = []
        self.steps: dict[str, dict] = {}

    def _write(self, row: dict) -> None:
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, default=str) + "\n")
            f.flush()
        self.rows.append(row)

    def log(self, step, action, outcome, *, tx=None, detail="") -> None:
        row = {
            "kind": "action",
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "step": step,
            "action": action,
            "outcome": outcome,
            "tx": tx,
            "url": f"{EXPERT}/tx/{tx}" if tx else None,
            "detail": detail,
        }
        self._write(row)
        print(f"[{step}] {action:<46} {outcome:<5} {detail[:90]}", flush=True)

    def conclude(self, step, status, summary) -> None:
        row = {
            "kind": "conclusion",
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "step": step,
            "status": status,
            "summary": summary,
        }
        self._write(row)
        self.steps[step] = row
        print(f"[{step}] ==> {status}: {summary}\n", flush=True)


def invoke(contract: str, fn: str, args: list[str], *, send: bool) -> tuple[bool, str, str | None]:
    """Returns (ok, output, tx_hash). Never raises — a failure is a result."""
    cmd = [
        "stellar", "contract", "invoke", "--network", NETWORK,
        "--source-account", SOURCE, "--id", contract,
    ]
    cmd += ["--send=yes"] if send else ["--send=no"]
    cmd += ["--"] + [fn] + args
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return False, "timed out after 300s", None
    out = (p.stdout or "") + (p.stderr or "")
    tx = None
    for line in out.splitlines():
        if "/tx/" in line:
            tx = line.split("/tx/")[-1].strip().rstrip(")").split()[0]
            break
    return p.returncode == 0, out.strip(), tx


def return_value(out: str) -> str | None:
    """The call's return value, which is not always the last line.

    `stellar contract invoke` prints the diagnostic event lines after the value when a
    call emits events, so taking the tail gives the event text instead. Reading a
    "Success - Event: ..." line as a number is how this harness first reported a
    repayment that had actually worked as a failure.
    """
    for line in reversed(out.splitlines()):
        t = line.strip().strip('"')
        if not t or t.startswith(("📅", "ℹ", "✅", "🔗", "🌎")):
            continue
        if t.lstrip("-").isdigit() or t in ("true", "false", "null"):
            return t
    return None


def contract_error(out: str) -> str | None:
    import re
    m = re.search(r"Error\(Contract, #(\d+)\)", out)
    return f"#{m.group(1)}" if m else None


def date_values(date):
    """`"2026-07-01"` as the three unpadded numbers AdSense takes: `2026`, `7`, `1`."""
    return [str(int(part)).encode() for part in date.split("-")]


def build_claim(pub_id, start, end, revenue, timestamp_s, key, *, borrower=BORROWER, epoch=0):
    values = [pub_id.encode()] + date_values(start) + date_values(end)
    assert len(TEMPLATE) == len(values) + 1, "a template of N parts takes N-1 values"
    params = TEMPLATE[0]
    for i, value in enumerate(values):
        params += value + TEMPLATE[i + 1]
    # Only the figure. The currency is held by the signed `"currencyCode": "USD"` match and
    # the window by the signed URL, so neither left the signature when they left here (#76).
    ctx = (
        b'{"contextAddress":"' + borrower.encode()
        + b'","contextMessage":"' + CONTEXT_MESSAGE.encode()
        + b'","extractedParameters":{"revenueUsd":"' + revenue.encode()
        + b'"},"providerHash":"' + PROVIDER_HASH.encode() + b'"}'
    )
    identifier = "0x" + secp.keccak256(b"http\n" + params + b"\n" + ctx).hex()
    digest = secp.eip191_digest(f"{identifier}\n{borrower.lower()}\n{timestamp_s}\n{epoch}")
    r, s, rec = secp.sign(digest, key)
    return (r.to_bytes(32, "big") + s.to_bytes(32, "big")).hex(), rec


def advance_args(borrower, revenue, pub_id, start, end, ts, sig, rec, epoch=0):
    return [
        "--borrower", borrower, "--revenue_usd", revenue, "--pub_id", pub_id,
        "--window_start", start, "--window_end", end, "--timestamp_s", str(ts),
        "--epoch", str(epoch), "--signature", sig, "--recovery_id", str(rec),
    ]


# --------------------------------------------------------------------------- steps


def step_preflight(ev, contract):
    ok_all = True
    for fn, want in (("is_upgradeable", "true"), ("claim_template", None), ("liquidity", None)):
        ok, out, _ = invoke(contract, fn, [], send=False)
        value = (return_value(out) or (out.splitlines()[-1].strip() if out else "")) or "(no answer)"
        ev.log("P.1", f"read {fn}", "ok" if ok else "fail", detail=value)
        ok_all &= ok
    # The verified production contract is a different deployment; record both so the
    # report cannot be mistaken for evidence about the wrong one.
    ev.log("P.1", "contract under test", "info", detail=f"{contract} ({EXPERT}/contract/{contract})")
    ev.log("P.1", "verified production contract", "info",
           detail=f"{PROD_CONTRACT} — not this one; its verifier is Reclaim's and cannot be signed for here")
    if ok_all:
        ev.conclude("P.1", "GREEN", "the contract answers and its state is on the record")
    else:
        ev.conclude("P.1", "RED", "a preflight read failed; later steps are unreliable")
    return ok_all


# Sized against what the dev contract actually holds: 4.00 USD of proven revenue is a
# 1 USDC advance, which clears the 1 USDC floor and fits inside 2 USDC of liquidity.
HAPPY_REVENUE = "4.00"


def step_happy(ev, contract, pub_id, window):
    start, end = window
    ts = int(time.time())
    # The figure signed and the figure submitted must be the same string. They were not
    # on the first run of this harness, and the contract refused with #14 — correctly,
    # since a different figure is a different digest.
    sig, rec = build_claim(pub_id, start, end, HAPPY_REVENUE, ts, WITNESS_KEY)

    before = usdc_balance(ev, "H.1", BORROWER, "borrower USDC before")

    ok, out, tx = invoke(contract, "request_advance",
                         advance_args(BORROWER, HAPPY_REVENUE, pub_id, start, end, ts, sig, rec), send=True)
    ev.log("H.1", "request_advance", "ok" if ok else "fail", tx=tx,
           detail=(out.splitlines()[-1][:120] if ok else contract_error(out) or out[:120]))
    if not ok:
        ev.conclude("H.1", "RED", f"a genuine proof was refused ({contract_error(out) or 'no code'})")
        return None
    if not tx:
        # Silence is not success: a pass with no transaction is not a pass.
        ev.conclude("H.1", "RED", "the call reported success but produced no transaction hash")
        return None

    after = usdc_balance(ev, "H.1", BORROWER, "borrower USDC after")
    moved = None
    if before is not None and after is not None:
        moved = after - before
        ev.log("H.1", "USDC actually moved", "ok" if moved > 0 else "fail",
               detail=f"{before} -> {after} stroops (delta {moved})")
    if moved is None or moved <= 0:
        # The balance is the evidence. A success message with no movement is a failure.
        ev.conclude("H.1", "RED", "the call succeeded but the borrower's balance did not move")
        return None
    ev.conclude("H.1", "GREEN", f"{moved} stroops reached the borrower ({tx[:12]}…)")
    return tx


def usdc_balance(ev, step, who, label):
    """Read a USDC balance, treating a missing trustline as an answer rather than a crash.

    `balance` on a `G…` address with no USDC trustline does not return zero — it fails
    with the SAC's own #13. Reading that as "the read broke" is the bug Sterun shipped,
    where a throw was mistaken for an error instead of for "no trustline".
    """
    ok, out, _ = invoke(USDC_SAC, "balance", ["--id", who], send=False)
    if ok:
        try:
            v = int(return_value(out) or "")
            ev.log(step, label, "ok", detail=f"{v} stroops")
            return v
        except ValueError:
            ev.log(step, label, "fail", detail=f"unparseable: {out.splitlines()[-1][:60]}")
            return None
    if contract_error(out) == "#13":
        ev.log(step, label, "ok", detail="no USDC trustline — an answer, not a failure")
        return None
    ev.log(step, label, "fail", detail=contract_error(out) or out[:90])
    return None


def step_repay(ev, contract, pub_id, window):
    """Repay the advance H.1 opened: part of it, then the rest."""
    start, end = window
    ok, out, _ = invoke(contract, "nullifier_for",
                        ["--pub_id", pub_id, "--window_start", start, "--window_end", end],
                        send=False)
    if not ok:
        ev.conclude("H.2", "RED", "could not read the nullifier for the advance")
        return False
    nullifier = None
    for line in reversed(out.splitlines()):
        t = line.strip().strip('"')
        if len(t) == 64 and all(c in "0123456789abcdef" for c in t):
            nullifier = t
            break
    if not nullifier:
        ev.conclude("H.2", "RED", "could not parse the nullifier")
        return False

    ok, out, _ = invoke(contract, "advance", ["--nullifier", nullifier], send=False)
    if not ok:
        ev.conclude("H.2", "RED", "no advance recorded for that nullifier")
        return False
    try:
        principal = int(json.loads(out.splitlines()[-1])["principal"])
    except Exception:
        ev.conclude("H.2", "RED", f"could not read the principal: {out.splitlines()[-1][:90]}")
        return False
    ev.log("H.2", "advance on record", "ok", detail=f"principal {principal} stroops")

    part = principal // 4
    ok, out, tx = invoke(contract, "repay",
                         ["--from", BORROWER, "--nullifier", nullifier, "--amount", str(part)],
                         send=True)
    left = return_value(out) if ok else None
    ev.log("H.2", f"repay {part} stroops", "ok" if ok else "fail", tx=tx,
           detail=f"outstanding {left}" if ok else contract_error(out) or out[:110])
    if not ok:
        ev.conclude("H.2", "RED", "a partial repayment was refused")
        return False

    rest = principal - part
    ok, out, tx = invoke(contract, "repay",
                         ["--from", BORROWER, "--nullifier", nullifier, "--amount", str(rest)],
                         send=True)
    left = return_value(out) if ok else None
    ev.log("H.2", f"repay the remaining {rest}", "ok" if ok else "fail", tx=tx,
           detail=f"outstanding {left}" if ok else contract_error(out) or out[:110])
    if not ok or left != "0":
        ev.conclude("H.2", "RED", f"the ledger did not reach zero (outstanding {left})")
        return False
    ev.conclude("H.2", "GREEN", "advanced, partly repaid, then fully repaid; nothing outstanding")
    return True


def step_negative(ev, step, contract, label, args, want_code):
    ok, out, _ = invoke(contract, "verify_and_reserve", args, send=False)
    code = contract_error(out)
    if ok:
        ev.log(step, label, "fail", detail="ACCEPTED — this must have been refused")
        ev.conclude(step, "RED", "a case that must be refused was accepted")
        return False
    ev.log(step, label, "ok" if code == want_code else "fail",
           detail=f"refused with {code or 'an unnamed error'}, expected {want_code}")
    if code == want_code:
        ev.conclude(step, "GREEN", f"refused with {want_code}, and the refusal never reached the ledger")
        return True
    ev.conclude(step, "RED", f"refused with {code}, not {want_code}")
    return False


def render(ev, run_dir, contract):
    green = sum(1 for s in ev.steps.values() if s["status"] == "GREEN")
    total = len(STEPS)
    lines = [
        "# Forepay rehearsal — evidence",
        "",
        f"Run `{run_dir.name}` against **{NETWORK}**, contract "
        f"[`{contract}`]({EXPERT}/contract/{contract}).",
        "",
        f"## Result: {green} / {total} GREEN",
        "",
        "| Step | What | Status | Summary |",
        "| --- | --- | --- | --- |",
    ]
    for key, title in STEPS.items():
        c = ev.steps.get(key, {})
        lines.append(f"| {key} | {title} | **{c.get('status','NOT RUN')}** | {c.get('summary','')} |")
    lines += [
        "",
        "> **What these claims do not cover.** The proofs here are signed by the probe",
        "> witness, not Reclaim's production attestor — only the attestor can sign a real",
        "> AdSense response, and that is what #5 is blocked on. The digest construction was",
        "> proven against a real attestor signature in #3 and accepted by Reclaim's own",
        "> deployed contract, so what this run demonstrates is the contract's logic rather",
        "> than the cryptography.",
        "",
        "## Every action, in the order it happened",
        "",
        "| Step | Action | Outcome | Transaction | Detail |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in ev.rows:
        if r["kind"] != "action":
            continue
        tx = f"[`{r['tx'][:12]}…`]({r['url']})" if r.get("tx") else ""
        detail = str(r.get("detail", "")).replace("|", "\\|")[:150]
        lines.append(f"| {r['step']} | {r['action']} | {r['outcome']} | {tx} | {detail} |")
    (run_dir / "EVIDENCE.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return green, total


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--contract", default=DEV_CONTRACT)
    ap.add_argument("--out", default=str(HERE / "runs"))
    a = ap.parse_args()

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    run_dir = Path(a.out) / stamp
    ev = Evidence(run_dir)
    print(f"evidence: {run_dir}\n", flush=True)

    step_preflight(ev, a.contract)

    suffix = str(int(time.time()))[-10:]
    window = ("2026-07-01", "2026-09-30")
    pub_ok = f"pub-h{suffix}"
    tx = step_happy(ev, a.contract, pub_ok, window)

    if tx:
        step_repay(ev, a.contract, pub_ok, window)
    else:
        ev.conclude("H.2", "BLOCKED", "H.1 produced no advance to repay")

    now = int(time.time())
    s, r = build_claim(f"pub-n1{suffix}", *window, "19.00", now, IMPOSTOR_KEY)
    step_negative(ev, "N.1", a.contract, "proof signed by a key that is not a witness",
                  advance_args(BORROWER, "19.00", f"pub-n1{suffix}", *window, now, s, r), "#14")

    if tx:
        ts2 = int(time.time())
        s2, r2 = build_claim(pub_ok, *window, HAPPY_REVENUE, ts2, WITNESS_KEY)
        step_negative(ev, "N.2", a.contract, "the publisher and window already used in H.1",
                      advance_args(BORROWER, HAPPY_REVENUE, pub_ok, *window, ts2, s2, r2), "#20")
    else:
        ev.conclude("N.2", "BLOCKED", "H.1 did not produce an advance to replay")

    stale = int(time.time()) - 7200
    s3, r3 = build_claim(f"pub-n3{suffix}", *window, "19.00", stale, WITNESS_KEY)
    step_negative(ev, "N.3", a.contract, "a proof two hours old against a one hour window",
                  advance_args(BORROWER, "19.00", f"pub-n3{suffix}", *window, stale, s3, r3), "#12")

    tsb = int(time.time())
    sb, rb = build_claim(f"pub-b{suffix}", *window, "19.00", tsb, WITNESS_KEY)
    step_negative(ev, "B.1", a.contract, "a proof bound to one borrower, submitted for another",
                  advance_args(OTHER, "19.00", f"pub-b{suffix}", *window, tsb, sb, rb), "#14")

    green, total = render(ev, run_dir, a.contract)
    print(f"RESULT {green} / {total} GREEN")
    print(f"evidence: {run_dir / 'EVIDENCE.md'}")
    return 0 if green == total else 1


if __name__ == "__main__":
    sys.exit(main())
