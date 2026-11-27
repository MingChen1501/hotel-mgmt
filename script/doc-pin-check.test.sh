#!/usr/bin/env bash
#
# Regression test for script/doc-pin-check.sh (issue #786).
#
# The check must verify the CONTENT of a cited line, not just that the
# line number exists. Every case below is a real drift class from the
# issue:
#   - #780 / #637: the cited line moved onto a different construct;
#   - #632 / #759 round 4: the line exists but holds no claimed keyword
#     (an existence-only sweep clears it, a content check fails it);
#   - #759 round 3 (2704e9a): an offset-shifted pin lands on a `return;`
#     instead of the claimed symbol;
#   - a missing file and a line past EOF (never silently skipped);
#   - the inline annotation form and the caller-passed keyword map;
#   - range pins (the first line of the range is verified);
#   - relative path resolution: module-relative from a service doc,
#     same-line and paragraph bare-pin inheritance, a table row that
#     stands alone;
#   - a pin with no keyword is UNVERIFIED, never PASS;
#   - broken annotation/map entries are findings of their own.
#
# Usage: bash script/doc-pin-check.test.sh [--script <path>]
#   --script defaults to the live script next to this test; point it at
#   template/script/doc-pin-check.sh to cover the template twin.
#
# Offline; builds every fixture in a temp tree.
set -euo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/doc-pin-check.sh"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --script) SCRIPT_UNDER_TEST="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--script <path>]"; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 1 ;;
  esac
done
[[ -f "${SCRIPT_UNDER_TEST}" ]] || { echo "error: script not found: ${SCRIPT_UNDER_TEST}" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
root="${work}/repo"
mkdir -p "${root}/docs/architecture/services" "${root}/services/demo/src" "${root}/src"

# Fixture source: line 5 holds requireCapacity, line 11 holds withTx.
cat >"${root}/services/demo/src/thing.ts" <<'EOF'
// fixture: services/demo/src/thing.ts
export function placeholder(): void {}
export const line3 = 3;
export const line4 = 4;
export function requireCapacity(value: number): void {}
export const line6 = 6;
export const line7 = 7;
export const line8 = 8;
export const line9 = 9;
export const line10 = 10;
export const runTx = (fn: () => void): void => { withTx(db, fn); };
export const line12 = 12;
EOF
# The #759 offset-sweep fixture: the claimed symbol is NOT at the cited line.
cat >"${root}/src/view.ts" <<'EOF'
export function render(): string {
  return "view";
}
export function openCheckout(): void {
  dispatch("checkout");
}
export function unrelated(): void {
  return;
}
EOF
export SCRIPT_UNDER_TEST root

pass=0
fail=0
STATUS=0
OUT=""

ok() { echo "ok: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL: $1"; echo "--- output ---"; printf '%s\n' "${OUT}"; fail=$((fail + 1)); }

run_check() {
  STATUS=0
  OUT="$(bash "${SCRIPT_UNDER_TEST}" --root "${root}" "$@" 2>&1)" || STATUS=$?
}

expect_status() {
  local name="$1" want="$2"
  if [[ "${STATUS}" -eq "${want}" ]]; then ok "${name}"; else bad "${name} (want exit ${want}, got ${STATUS})"; fi
}

expect_contains() {
  local name="$1" needle="$2"
  if [[ "${OUT}" == *"${needle}"* ]]; then ok "${name}"; else bad "${name} (missing '${needle}')"; fi
}

expect_absent() {
  local name="$1" needle="$2"
  if [[ "${OUT}" != *"${needle}"* ]]; then ok "${name}"; else bad "${name} (unexpected '${needle}')"; fi
}

write_doc() { cat >"${root}/docs/architecture/services/demo.md"; }

# ---------------------------------------------------------------------------
# 1. Inline annotation PASS: the cited line holds the keyword.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- C: the capacity rule (`src/thing.ts:5`) <!-- pin: requireCapacity -->.
EOF
run_check --all docs/architecture
expect_status "annotation pin with the keyword passes" 0
expect_contains "PASS is reported for the matching line" "PASS	docs/architecture/services/demo.md	3	services/demo/src/thing.ts:5	requireCapacity"

# ---------------------------------------------------------------------------
# 2. The same pin moved +6 lines: the cited line now holds withTx, so the
#    check fails and names both lines and the actual content (#780/#637).
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- C: the capacity rule (`src/thing.ts:11`) <!-- pin: requireCapacity -->.
EOF
run_check docs/architecture
expect_status "an offset-shifted pin fails" 1
expect_contains "the failure names the doc line and the cited target line" "MISMATCH	docs/architecture/services/demo.md	3	services/demo/src/thing.ts:11	requireCapacity"
expect_contains "the failure quotes the actual line content" "withTx(db, fn)"

# ---------------------------------------------------------------------------
# 3. Existence-only false positive: the line exists but holds no keyword
#    (#632 / #759 round 4). An existence check passes this; content fails.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- D: the block refusal (`src/thing.ts:7`) <!-- pin: STATE_ILLEGAL -->.
EOF
run_check docs/architecture
expect_status "a line that exists without the keyword fails" 1
expect_contains "the existence-only pin is MISMATCH, not PASS" "MISMATCH	docs/architecture/services/demo.md	3	services/demo/src/thing.ts:7	STATE_ILLEGAL"
expect_absent "no PASS row is emitted for the existence-only pin" "PASS	docs/architecture/services/demo.md"

# ---------------------------------------------------------------------------
# 4. #759 round-3 offset sweep: the pin lands on a `return;` instead of the
#    claimed symbol. This is the counter-example the ao-rules rule names.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- E: the checkout action (`src/view.ts:8`) <!-- pin: openCheckout -->.
EOF
run_check docs/architecture
expect_status "an offset sweep landing on return; fails" 1
expect_contains "the sweep failure names the claim and the wrong line" "MISMATCH	docs/architecture/services/demo.md	3	src/view.ts:8	openCheckout"
expect_contains "the sweep failure quotes return;" "return;"

# ---------------------------------------------------------------------------
# 5. Missing file and past-EOF are findings, never silently skipped.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- F: gone (`src/missing.ts:3`) <!-- pin: anything -->.
- G: past EOF (`src/thing.ts:999`) <!-- pin: anything -->.
EOF
run_check docs/architecture
expect_status "a missing target and a past-EOF line fail" 1
expect_contains "a missing file is a MISSING finding" "MISSING	docs/architecture/services/demo.md	3	src/missing.ts:3"
expect_contains "a past-EOF line is an EOF finding" "EOF	docs/architecture/services/demo.md	4	services/demo/src/thing.ts:999"

# ---------------------------------------------------------------------------
# 6. Range pin: the first line of the range is verified.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- H: capacity (`src/thing.ts:5-6`) <!-- pin: requireCapacity -->.
- I: shifted range (`src/thing.ts:6-7`) <!-- pin: requireCapacity -->.
EOF
run_check --all docs/architecture
expect_status "one passing and one failing range pin fail the run" 1
expect_contains "a range whose first line matches passes" "PASS	docs/architecture/services/demo.md	3	services/demo/src/thing.ts:5-6	requireCapacity"
expect_contains "a range whose first line is wrong fails" "MISMATCH	docs/architecture/services/demo.md	4	services/demo/src/thing.ts:6-7	requireCapacity"

# ---------------------------------------------------------------------------
# 7. Keyword map form (the seed-map shape, issue #786).
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- J: capacity (`src/thing.ts:5`).
- K: transaction (`src/thing.ts:11`).
EOF
printf '%s\t%s\t%s\n' \
  "docs/architecture/services/demo.md" "services/demo/src/thing.ts:5" "requireCapacity" \
  >"${work}/keywords.tsv"
run_check --all --keywords "${work}/keywords.tsv" docs/architecture
expect_status "a map row with the keyword passes and an unmapped pin does not fail" 0
expect_contains "the map row verifies the resolved target" "PASS	docs/architecture/services/demo.md	3	services/demo/src/thing.ts:5	requireCapacity"
expect_contains "an unmapped pin is UNVERIFIED, never PASS" "UNVERIFIED	docs/architecture/services/demo.md	4	services/demo/src/thing.ts:11"

# A map row that matches no pin is STALE-MAP: the map cannot rot silently.
printf '%s\t%s\t%s\n' \
  "docs/architecture/services/demo.md" "services/demo/src/thing.ts:999" "nope" \
  >"${work}/keywords.tsv"
run_check --keywords "${work}/keywords.tsv" docs/architecture
expect_status "a stale map row fails the run" 1
expect_contains "a stale map row is reported as STALE-MAP" "STALE-MAP	docs/architecture/services/demo.md"

# A broken map row is a finding, not a silent skip.
printf '%s\n' "docs/architecture/services/demo.md only-two-columns" >"${work}/keywords.tsv"
run_check --keywords "${work}/keywords.tsv" docs/architecture
expect_status "a malformed map row fails the run" 1
expect_contains "a malformed map row is reported as BAD-MAP" "BAD-MAP"

# ---------------------------------------------------------------------------
# 8. Path resolution: module-relative from a service doc, and bare `:line`
#    inheritance on the same line and within a paragraph.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- L: capacity `src/thing.ts:5` and `:6`
- M: still the same paragraph file (`:7`)
EOF
run_check --all docs/architecture
expect_status "module-relative and inherited pins resolve" 0
expect_contains "module-relative path resolves under services/<svc>/" "services/demo/src/thing.ts:5"
expect_contains "a same-line bare pin inherits the path" "services/demo/src/thing.ts:6"
expect_contains "a next-line bare pin inherits within the paragraph" "services/demo/src/thing.ts:7"

# A table row stands alone: no inheritance from the row above.
cat >"${root}/docs/architecture/services/demo.md" <<'EOF'
# Demo

| a | `src/thing.ts` |
| b | `:5` |
EOF
run_check --all docs/architecture
expect_status "a table row without a path stays unresolved" 0
expect_contains "the second table row does not inherit the first row's path" "UNRESOLVED	docs/architecture/services/demo.md	4"

# ---------------------------------------------------------------------------
# 9. A pin with no keyword is UNVERIFIED and never PASS; warnings alone do
#    not fail the run.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- N: no keyword (`src/thing.ts:5`).
EOF
run_check docs/architecture
expect_status "an unverified pin does not fail the run" 0
expect_contains "the unverified pin is counted" "unverified=1"
expect_absent "the unverified pin is not reported as PASS" "pass=1"

# ---------------------------------------------------------------------------
# 10. --report-only: findings printed, exit 0 (the CI first iteration).
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- O: wrong (`src/thing.ts:11`) <!-- pin: requireCapacity -->.
EOF
run_check --report-only docs/architecture
expect_status "--report-only exits 0 with findings" 0
expect_contains "--report-only still prints the finding" "MISMATCH	docs/architecture/services/demo.md	3"
expect_contains "--report-only names its scope" "REPORT-ONLY"

# ---------------------------------------------------------------------------
# 11. Broken annotation: an annotation on a line with no pin is a finding.
# ---------------------------------------------------------------------------
write_doc <<'EOF'
# Demo

- P: nothing to verify here <!-- pin: requireCapacity -->.
EOF
run_check docs/architecture
expect_status "an annotation with no pin fails the run" 1
expect_contains "the orphan annotation is reported" "STALE-ANNOTATION	docs/architecture/services/demo.md"

# ---------------------------------------------------------------------------
# 12. Usage errors are rejected, not guessed.
# ---------------------------------------------------------------------------
run_check
expect_status "a missing doc set is a usage error" 2
run_check docs/does-not-exist
expect_status "a missing doc path is a usage error" 2

echo "test result: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
