#!/usr/bin/env bash
# Verify the recorded wasm hash for this host triple (#14).
#
# Only rows above the "developer reference" line are checked, and a PENDING row prints the
# hash it measured so it can be filled in. A row nobody verifies is a claim, not evidence,
# so this script is the thing that makes the table mean something.
set -euo pipefail
cd "$(dirname "$0")"

TRIPLE=$(rustc -vV | awk '/^host:/{print $2}')
CLI=$(stellar --version | head -1 | awk '{print $2}')
WASM=target/wasm32v1-none/release/forepay_advance.wasm

[ -f "$WASM" ] || { echo "no wasm at $WASM — run 'stellar contract build' in sc/advance first" >&2; exit 1; }
GOT=$(sha256sum "$WASM" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$WASM" | awk '{print $1}')

# Rows after the @@UNVERIFIED@@ marker are reference only and are not checked. The marker
# is a distinct token rather than prose, because prose repeats in the header comment and
# the first version of this script silently truncated the whole table.
TABLE=$(sed '/@@UNVERIFIED@@/,$d' wasm-hashes.txt | grep -v '^#' | grep -v '^$' || true)
ROW=$(echo "$TABLE" | awk -v t="$TRIPLE" '$1==t {print; exit}')

if [ -z "$ROW" ]; then
  echo "no verified row for $TRIPLE — measured $GOT (cli $CLI)"
  echo "this host is not part of the verified table; nothing to check"
  exit 0
fi

WANT=$(echo "$ROW" | awk '{print $3}')
WANT_CLI=$(echo "$ROW" | awk '{print $2}')

if [ "$WANT" = "PENDING" ]; then
  echo "::error::wasm-hashes.txt has a PENDING row for $TRIPLE."
  echo "Measured on this runner: $TRIPLE  $CLI  $GOT"
  echo "Record that row and push again."
  exit 1
fi

if [ "$WANT_CLI" != "$CLI" ]; then
  echo "::error::stellar-cli is $CLI but the recorded row for $TRIPLE was built with $WANT_CLI."
  echo "Different toolchains produce different bytes. Pin the CLI or re-record the row."
  exit 1
fi

if [ "$GOT" != "$WANT" ]; then
  echo "::error::wasm hash mismatch for $TRIPLE (cli $CLI)"
  echo "  recorded: $WANT"
  echo "  measured: $GOT"
  exit 1
fi

echo "wasm hash matches for $TRIPLE (cli $CLI): $GOT"
