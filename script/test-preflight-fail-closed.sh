#!/usr/bin/env bash
#
# Fail-closed proof for the install gate (issue #153).
#
# Proves script/preflight.sh refuses the install (non-zero exit with
# a named reason) for each invalid input behind acceptance criterion
# 2: default secrets, a missing configuration set, a set that is not
# valid JSON, and a set that still carries the EXAMPLE placeholder.
# Runs without docker and without bringing any stack up: every case
# must fail on its own reason regardless of host sizing or tooling,
# so the assertions check the exit code plus the expected reason
# line, never the absence of unrelated failures.
#
# Usage (from the repo root):
#   script/test-preflight-fail-closed.sh
#
# Never prints secret values.

set -euo pipefail

ROOT="$(dirname "$0")"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

pass=0
fail=0

# expect_fail <name> <expected-reason-substring> <preflight-args...>
# with DB_PASSWORD/ADMIN_BOOT_SECRET supplied in the environment.
expect_fail() {
  local name="$1" reason="$2"
  shift 2
  local out
  if out="$(DB_PASSWORD=pf-test-db-secret-01 ADMIN_BOOT_SECRET=pf-test-owner-secret-01 \
    "$ROOT/preflight.sh" "$@" --staging-dir "$TMPDIR/staging" 2>&1)"; then
    echo "FAIL: $name: preflight passed, want a fail-closed refusal."
    fail=$((fail + 1))
    return 0
  fi
  if grep -qF "$reason" <<<"$out"; then
    echo "PASS: $name (refused: $reason)."
    pass=$((pass + 1))
  else
    echo "FAIL: $name: refusal did not name '$reason'. Output:"
    echo "$out"
    fail=$((fail + 1))
  fi
}

# 1. Default secrets fail closed even before any configuration is read.
echo "--- case: default secrets ---"
if out="$(DB_PASSWORD=change-me ADMIN_BOOT_SECRET=change-me \
  "$ROOT/preflight.sh" --config "$TMPDIR/does-not-matter.json" \
  --staging-dir "$TMPDIR/staging" 2>&1)"; then
  echo "FAIL: default secrets: preflight passed, want a fail-closed refusal."
  fail=$((fail + 1))
else
  if grep -qF "DB_PASSWORD is unset or still a dev default" <<<"$out"; then
    echo "PASS: default secrets (refused on DB_PASSWORD)."
    pass=$((pass + 1))
  else
    echo "FAIL: default secrets: refusal did not name DB_PASSWORD. Output:"
    echo "$out"
    fail=$((fail + 1))
  fi
fi

# 2. A missing configuration set fails closed.
expect_fail "missing configuration set" \
  "fails validation" \
  --config "$TMPDIR/no-such-hotel.json"

# 3. A set that is not valid JSON fails closed.
printf '{ this is not json' >"$TMPDIR/malformed.json"
expect_fail "malformed configuration set" \
  "fails validation" \
  --config "$TMPDIR/malformed.json"

# 4. A set that still carries the EXAMPLE placeholder fails closed.
cp deploy/config/hotel.example.json "$TMPDIR/placeholder.json"
expect_fail "placeholder configuration set" \
  "EXAMPLE-001 placeholder" \
  --config "$TMPDIR/placeholder.json"

echo "preflight fail-closed: $pass passed, $fail failed."
[[ "$fail" -eq 0 ]]
