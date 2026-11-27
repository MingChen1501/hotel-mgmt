#!/usr/bin/env bash
#
# Self-coverage for the duplicate-key detector in
# script/openapi-route-check.sh (issue #768).
#
# The gate used to parse the spec with yaml.safe_load, a last-key-wins
# loader: a duplicated response key silently replaced its sibling and
# every assertion still passed (the #759 head shipped two '503' keys
# for CreateReservation). This test builds a throwaway fixture root
# from the live spec and proves the detector cannot rot:
#   1. the clean fixture passes with the same OK lines and PASSED;
#   2. a duplicate '503' key in both copies fails, naming the key,
#      both file:line positions, and the key path;
#   3. the same duplicate in the served mirror alone fails the same
#      way (the byte-identical check cannot see it when both copies
#      carry it);
#   4. restoring the clean copies makes the gate pass again.
#
# Runs offline (PyYAML only, already required by the gate). Called from
# script/contract-check.sh, so the CI contract-check job exercises it.
#
# Usage: script/openapi-route-check.test.sh (run from anywhere).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$REPO_ROOT/script/openapi-route-check.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
root="$work/repo"
pristine="$work/pristine"
mkdir -p "$root/contracts" "$root/frontend/docs" "$pristine"
cp -R "$REPO_ROOT/contracts/http" "$root/contracts/http"
cp "$REPO_ROOT/contracts/openapi.yaml" "$pristine/source.yaml"
cp "$REPO_ROOT/frontend/docs/openapi.yaml" "$pristine/mirror.yaml"

restore_clean() {
  cp "$pristine/source.yaml" "$root/contracts/openapi.yaml"
  cp "$pristine/mirror.yaml" "$root/frontend/docs/openapi.yaml"
}

# inject_duplicate <spec> — duplicates the CreateReservation '503'
# response block (the #759 shape) in place and prints
# "<first-line> <duplicate-line>" (1-based).
inject_duplicate() {
  python3 - "$1" <<'PY'
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    lines = fh.read().splitlines(keepends=True)

start = next(
    i for i, line in enumerate(lines)
    if line.rstrip("\n") == "  /v1/reservations/CreateReservation:"
)
key = next(
    i for i in range(start + 1, len(lines))
    if lines[i].strip().startswith("'503':")
)
indent = len(lines[key]) - len(lines[key].lstrip(" "))
end = key + 1
while end < len(lines):
    line = lines[end]
    if line.strip() and (len(line) - len(line.lstrip(" "))) <= indent:
        break
    end += 1

block = lines[key:end]
lines[end:end] = block
with open(path, "w", encoding="utf-8") as fh:
    fh.writelines(lines)

print(key + 1, end + 1)
PY
}

run_gate() {
  "$GATE" --root "$root" >"$work/out" 2>&1
}

pass=0
fail=0
ok() {
  echo "PASS: $1"
  pass=$((pass + 1))
}
bad() {
  echo "FAIL: $1"
  fail=$((fail + 1))
}

# 1. Clean fixture: the existing contract gate still passes unchanged.
restore_clean
if run_gate; then
  if grep -qF "OK contracts/openapi.yaml == frontend/docs/openapi.yaml" "$work/out" \
    && grep -qF "OK 14 spec operation(s)" "$work/out" \
    && grep -qF "openapi-route-check: PASSED." "$work/out"; then
    ok "clean fixture keeps the existing OK lines and PASSED"
  else
    bad "clean fixture passed but lost an expected OK/PASSED line"
  fi
else
  bad "clean fixture failed the gate"
  cat "$work/out"
fi

# 2. Duplicate in both copies: the detector names the key and both
#    line numbers even though the mirror stays byte-identical.
restore_clean
read -r first second <<<"$(inject_duplicate "$root/contracts/openapi.yaml")"
cp "$root/contracts/openapi.yaml" "$root/frontend/docs/openapi.yaml"
if run_gate; then
  bad "duplicate key in both copies did not fail the gate"
else
  if grep -qF "duplicate mapping key '503'" "$work/out" \
    && grep -qF "contracts/openapi.yaml:$first" "$work/out" \
    && grep -qF "contracts/openapi.yaml:$second" "$work/out" \
    && grep -qF "responses.503" "$work/out"; then
    ok "duplicate in both copies fails with key, both lines, and key path"
  else
    bad "duplicate in both copies failed without the expected key/line/path report"
    cat "$work/out"
  fi
fi

# 3. Duplicate in the served mirror alone: the detector scans the
#    mirror too, so the failure names the mirror's own lines.
restore_clean
read -r _ second <<<"$(inject_duplicate "$root/frontend/docs/openapi.yaml")"
if run_gate; then
  bad "duplicate key in the served mirror did not fail the gate"
else
  if grep -qF "duplicate mapping key '503' at $root/frontend/docs/openapi.yaml:$second" "$work/out"; then
    ok "duplicate in the served mirror alone fails with its own line"
  else
    bad "duplicate in the served mirror failed without naming the mirror line"
    cat "$work/out"
  fi
fi

# 4. Removing the duplicate restores the pass.
restore_clean
if run_gate && grep -qF "openapi-route-check: PASSED." "$work/out"; then
  ok "gate passes once the duplicate is removed"
else
  bad "gate stayed red after the duplicate was removed"
  cat "$work/out"
fi

echo "openapi-route-check.test: ${pass} passed, ${fail} failed."
if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
