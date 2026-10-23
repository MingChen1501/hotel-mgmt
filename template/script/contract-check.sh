#!/usr/bin/env bash
#
# Contract-check gate (stub).
#
# Checks what exists today and skips what does not yet:
# - If there is no contracts/ tree (authored in implementation slices),
#   it reports SKIP and exits 0 — the expected state until the first
#   slice lands, not a failure.
# - If contracts/ exists, every JSON file under it must parse.
# - If services/*/contract-tests/ fixtures exist alongside a
#   contracts/http/ operation manifest, every fixture must parse and
#   name a known operation.
#
# Full provider verification against the real stores and the
# breaking-change gate live in each module's CI job once services/
# and contracts/ exist; this stub grows into that gate instead of
# blocking the harness change.
#
# Usage: script/contract-check.sh (run from anywhere; resolves repo root).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

if [[ ! -d "$ROOT/contracts" ]]; then
  echo "contract-check: SKIP — no contracts/ tree yet (authored in implementation slices). Nothing to check."
  exit 0
fi

echo "contract-check: contracts/ present — validating JSON files..."
while IFS= read -r -d '' f; do
  if python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f"; then
    echo "  OK ${f#"$ROOT"/}"
  else
    echo "  FAIL unparseable JSON: ${f#"$ROOT"/}"
    fail=1
  fi
done < <(find "$ROOT/contracts" -type f -name '*.json' -print0)

ops_file="$(mktemp)"
trap 'rm -f "$ops_file"' EXIT
if [[ -d "$ROOT/contracts/http" ]]; then
  find "$ROOT/contracts/http" -type f -name '*.json' -printf '%f\n' | sed 's/\.json$//' | sort -u >"$ops_file"
else
  : >"$ops_file"
  echo "contract-check: no contracts/http/ manifest — skipping fixture cross-check."
fi

shopt -s nullglob
fixtures=( "$ROOT"/services/*/contract-tests/*.json )
if [[ "${#fixtures[@]}" -eq 0 ]]; then
  echo "contract-check: no services/*/contract-tests/ fixtures yet — nothing further to check."
else
  echo "contract-check: validating ${#fixtures[@]} fixture(s)..."
  for f in "${fixtures[@]}"; do
    if ! op=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("operation", ""))' "$f" 2>/dev/null); then
      echo "  FAIL unparseable fixture: ${f#"$ROOT"/}"
      fail=1
      continue
    fi
    if [[ -s "$ops_file" && -n "$op" ]] && ! grep -qx "$op" "$ops_file"; then
      echo "  FAIL unknown operation '$op': ${f#"$ROOT"/}"
      fail=1
    else
      echo "  OK ${f#"$ROOT"/}"
    fi
  done
fi

if [[ "$fail" -ne 0 ]]; then
  echo "contract-check: FAILED."
  exit 1
fi
echo "contract-check: PASSED."
