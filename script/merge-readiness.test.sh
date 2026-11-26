#!/usr/bin/env bash
# Regression test: merge-readiness.sh (issue #746) is the read-only
# merge-readiness preflight behind every owner-facing "ready to merge"
# report. It must print the block the report quotes and exit non-zero on
# exactly the two owner-fixed conditions:
#   - the PR is CONFLICTING or DIRTY (GitHub's conflict state), or
#   - no APPROVE / SPEC-GATE PASS verdict quotes the CURRENT head
#     (a verdict on an older head is stale and does not count).
# CI is reported (worst conclusion) but never gated, and the script stays
# read-only: no push, merge, comment, label, or branch operation.
#
# The gate rules are mirrored from script/orchestrator-merge.sh, so this
# test also pins the copied classifier text and green-check predicate
# against the live merge gate: a change to the gate without the matching
# preflight change fails here.
#
# Runs the script with a stubbed `gh` on PATH, so no network or real PR
# is needed. Usage: bash script/merge-readiness.test.sh [--script <path>]
#   --script defaults to the live script next to this test; point it at
#   template/script/merge-readiness.sh to cover the template twin.
set -euo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/merge-readiness.sh"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --script) SCRIPT_UNDER_TEST="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--script <path>]"; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -f "${SCRIPT_UNDER_TEST}" ]] || { echo "error: script not found: ${SCRIPT_UNDER_TEST}" >&2; exit 1; }
# Absolutize: cases below run the script from a temp working directory.
if [[ "${SCRIPT_UNDER_TEST}" != /* ]]; then
  SCRIPT_UNDER_TEST="$(pwd)/${SCRIPT_UNDER_TEST}"
fi
SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_UNDER_TEST}")" && pwd)"
MIRROR_SRC="${SCRIPT_DIR}/orchestrator-merge.sh"

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

TEST_REPO="$(grep '^REPO=' "${SCRIPT_UNDER_TEST}" | cut -d'"' -f2)"
export TEST_REPO
TEST_DEFAULT_BRANCH="$(grep '^DEFAULT_BRANCH=' "${SCRIPT_UNDER_TEST}" | cut -d'"' -f2)"
export TEST_DEFAULT_BRANCH
TEST_HEAD="abcdef1234567890abcdef1234567890abcdef12"
export TEST_HEAD

mkdir -p "${work}/bin"
cat >"${work}/bin/gh" <<'EOF'
#!/usr/bin/env bash
# Stub gh: every call is logged so a case can prove the script read only.
if [[ -n "${TEST_GH_LOG:-}" ]]; then printf '%s\n' "$*" >>"${TEST_GH_LOG}"; fi

if [[ "$1" == "pr" && "$2" == "view" ]]; then
  fixture=""
  if [[ -n "${TEST_PR_DIR:-}" && -f "${TEST_PR_DIR}/$3.json" ]]; then fixture="${TEST_PR_DIR}/$3.json"; fi
  [[ -n "${fixture}" ]] || { echo "stub gh: no PR fixture for #$3" >&2; exit 1; }
  cat "${fixture}"
elif [[ "$1" == "pr" && "$2" == "checks" ]]; then
  if [[ -n "${TEST_PR_DIR:-}" && -f "${TEST_PR_DIR}/checks-$3.json" ]]; then
    cat "${TEST_PR_DIR}/checks-$3.json"
  else
    echo "no checks reported on the '${TEST_DEFAULT_BRANCH}' branch" >&2
    exit 1
  fi
elif [[ "$1" == "pr" && "$2" == "list" ]]; then
  if [[ -n "${TEST_OPEN_PRS:-}" && -f "${TEST_OPEN_PRS}" ]]; then cat "${TEST_OPEN_PRS}"; else echo '[]'; fi
elif [[ "$1" == "api" ]]; then
  method="GET"; path=""; prev=""
  for a in "$@"; do
    case "${prev}" in --method|-X) method="$a" ;; esac
    case "$a" in repos/*) path="$a" ;; esac
    prev="$a"
  done
  if [[ "${method}" != "GET" ]]; then
    echo "stub gh: mutating api call attempted: $*" >&2
    exit 1
  fi
  if [[ "${path}" =~ /stacks/([0-9]+)$ ]]; then
    if [[ -n "${TEST_STACK_RESOURCE:-}" && -f "${TEST_STACK_RESOURCE}" ]]; then
      cat "${TEST_STACK_RESOURCE}"
      exit 0
    fi
    echo "stub gh: no stack resource fixture" >&2
    exit 1
  fi
  if [[ "${path}" =~ /pulls/([0-9]+)$ ]]; then
    num="${BASH_REMATCH[1]}"
    if [[ -n "${TEST_STACK_MEMBERS:-}" ]]; then
      position=0; index=0
      for member in ${TEST_STACK_MEMBERS}; do
        index=$((index + 1))
        [[ "${member}" == "${num}" ]] && position="${index}"
      done
      if [[ "${position}" -gt 0 ]]; then
        printf '{"number":%s,"stack":{"number":%s,"position":%s,"size":%s}}\n' \
          "${num}" "${TEST_STACK_NUMBER:-678}" "${position}" "${index}"
        exit 0
      fi
    fi
    printf '{"number":%s}\n' "${num}"
    exit 0
  fi
  echo "stub gh: unexpected api call: $*" >&2
  exit 1
else
  echo "stub gh: unexpected call: $*" >&2
  exit 1
fi
EOF
chmod +x "${work}/bin/gh"
export PATH="${work}/bin:${PATH}"

pass=0
fail=0

reset_fixtures() {
  rm -rf "${work}/prs"
  mkdir -p "${work}/prs"
  unset TEST_OPEN_PRS TEST_STACK_MEMBERS TEST_STACK_NUMBER TEST_STACK_RESOURCE TEST_PR_DIR
  export TEST_PR_DIR="${work}/prs"
  export TEST_GH_LOG="${work}/gh.log"
  : >"${TEST_GH_LOG}"
  rm -f "${work}/open.json" "${work}/stack-resource.json"
}

# write_pr <number> <base> <labels-json> <comments-json> <reviews-json> [<head>] [<mergeable>] [<merge-state>]
write_pr() {
  local number="$1" base="$2" labels="$3" comments="$4" reviews="$5"
  local head="${6:-${TEST_HEAD}}" mergeable="${7:-MERGEABLE}" merge_state="${8:-CLEAN}"
  jq -n --argjson labels "${labels}" --argjson comments "${comments}" --argjson reviews "${reviews}" \
    --arg head "${head}" --arg number "${number}" --arg base "${base}" \
    --arg mergeable "${mergeable}" --arg merge_state "${merge_state}" \
    '{number:($number | tonumber), state:"OPEN", url:("https://example.invalid/" + $number),
      title:("Test PR " + $number), labels:$labels, headRefName:("branch-" + $number),
      headRefOid:$head, baseRefName:$base, mergeable:$mergeable,
      mergeStateStatus:$merge_state, comments:$comments, reviews:$reviews}' \
    >"${work}/prs/${number}.json"
}

# write_checks <number> <checks-json>
write_checks() {
  printf '%s' "$2" >"${work}/prs/checks-$1.json"
}

# build_open_prs <number...>: `gh pr list` fixture from the PR fixtures.
build_open_prs() {
  local list='[]' number
  for number in "$@"; do
    list="$(printf '%s' "${list}" | jq --slurpfile pr "${work}/prs/${number}.json" \
      '. + [($pr[0] | {number: .number, headRefName: .headRefName, baseRefName: .baseRefName})]')"
  done
  printf '%s' "${list}" >"${work}/open.json"
  export TEST_OPEN_PRS="${work}/open.json"
}

write_stack_resource() {
  printf '%s' "$1" >"${work}/stack-resource.json"
  export TEST_STACK_RESOURCE="${work}/stack-resource.json"
}

stack_resource_json() {
  local number="$1" size="$2" members='[]' spec
  shift 2
  for spec in "$@"; do
    members="$(printf '%s' "${members}" | jq -c --arg n "${spec%%:*}" \
      '. + [{number: ($n | tonumber), state: "open", merged_at: null}]')"
  done
  printf '{"number":%s,"size":%s,"pull_requests":%s}\n' "${number}" "${size}" "${members}"
}

OUT=""
STATUS=0
invoke() {
  STATUS=0
  OUT="$(cd "${work}" && bash "${SCRIPT_UNDER_TEST}" "$@" 2>&1)" || STATUS=$?
}

expect_ok() {
  local name="$1"
  if [[ "${STATUS}" -eq 0 ]]; then
    echo "ok: ${name}"; pass=$((pass + 1))
  else
    echo "FAIL: ${name} should exit 0 (status=${STATUS}):"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
  fi
}

expect_not_ready() {
  local name="$1"
  if [[ "${STATUS}" -ne 0 ]]; then
    echo "ok: ${name}"; pass=$((pass + 1))
  else
    echo "FAIL: ${name} should exit non-zero (status=${STATUS}):"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
  fi
}

expect_contains() {
  local name="$1" needle="$2"
  if [[ "${OUT}" == *"${needle}"* ]]; then
    echo "ok: ${name}"; pass=$((pass + 1))
  else
    echo "FAIL: ${name} — output lacks '${needle}':"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
  fi
}

expect_absent() {
  local name="$1" needle="$2"
  if [[ "${OUT}" != *"${needle}"* ]]; then
    echo "ok: ${name}"; pass=$((pass + 1))
  else
    echo "FAIL: ${name} — output unexpectedly contains '${needle}':"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
  fi
}

GREEN_CHECKS='[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"skipping","name":"go-build","state":"SKIPPED"}]'
FAIL_CHECKS='[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"fail","name":"go-build","state":"FAILED"}]'
MEDIUM_LABELS='[{"name":"chore"},{"name":"risk-medium"}]'
NO_COMMENTS='[]'
NO_REVIEWS='[]'
APPROVE_SHORT='[{"body":"APPROVE — reviewed head abcdef1: diff scoped, checks green. Role: dev-peer-review"}]'
FORMAL_APPROVE_STATE='[{"body":"Reviewed head abcdef1, looks good.","state":"APPROVED"}]'
STALE_APPROVE='[{"body":"APPROVE — reviewed head deadbee9: diff scoped. Role: dev-peer-review"}]'

# -----------------------------------------------------------------------
# Gate-mirror pin: the preflight copies the merge gate's classifier and
# green-check predicate instead of re-deriving them (issue #746 scope).
# -----------------------------------------------------------------------
if [[ ! -f "${MIRROR_SRC}" ]]; then
  echo "FAIL: mirror script not found next to the preflight: ${MIRROR_SRC}"; fail=$((fail + 1))
else
  mirror_defs="$(grep -o -- 'def refs_head:.*' "${MIRROR_SRC}" | head -n 1 || true)"
  mirror_defs="${mirror_defs%%; {approve:*}"
  if [[ -n "${mirror_defs}" ]] && grep -qF -- "${mirror_defs}" "${SCRIPT_UNDER_TEST}"; then
    echo "ok: verdict classifier is copied verbatim from the merge gate"; pass=$((pass + 1))
  else
    echo "FAIL: the verdict classifier drifted from ${MIRROR_SRC}:"
    printf '  merge gate: %s\n' "${mirror_defs:-<not found>}"
    fail=$((fail + 1))
  fi
  green_selector='select(.bucket != "pass" and .bucket != "skipping")'
  if grep -qF -- "${green_selector}" "${MIRROR_SRC}" && grep -qF -- "${green_selector}" "${SCRIPT_UNDER_TEST}"; then
    echo "ok: green-check predicate is copied verbatim from the merge gate"; pass=$((pass + 1))
  else
    echo "FAIL: the green-check predicate drifted from ${MIRROR_SRC}"
    fail=$((fail + 1))
  fi
fi

# -----------------------------------------------------------------------
# 1. Clean, head-approved PR: exit 0 and the full report block.
# -----------------------------------------------------------------------
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_ok "clean + head-approved PR exits 0"
expect_contains "block prints state" "State:     OPEN"
expect_contains "block prints the exact head SHA" "Head:      ${TEST_HEAD} (branch-674)"
expect_contains "block prints the base branch" "Base:      ${TEST_DEFAULT_BRANCH}"
expect_contains "block prints mergeable and mergeStateStatus" "Mergeable: MERGEABLE / CLEAN"
expect_contains "block prints the risk label" "Risk:      risk-medium (exactly one risk label)"
expect_contains "block reports a head-quoting verdict" "Review:    head-quoting verdict: yes"
expect_contains "block reports the CI worst conclusion" "CI:        worst conclusion: green (pass/skipping)"
expect_contains "block carries the CI hint line" "CI hint:   informational only"
expect_contains "block reports the stack hint" "Stack:     not a native .stack member"
expect_contains "block reports READY" "Status:    READY"
expect_contains "summary names the exact head SHAs checked" "Checked heads (exact SHAs this run read): #674=${TEST_HEAD}"
expect_contains "summary says READY" "Merge readiness: READY"
expect_absent "output carries no ANSI colour" $'\033'

# Formal-review APPROVE state quoting the head counts too (mirrors the
# merge gate reading BOTH verdict sources).
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${NO_COMMENTS}" "${FORMAL_APPROVE_STATE}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_ok "formal APPROVED state quoting the head exits 0"
expect_contains "formal APPROVED verdict is head-quoting" "head-quoting verdict: yes"

# The leading-token rule is the merge gate's: a PASS only later in the
# headline does not count.
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" \
  '[{"body":"Reviewed head abcdef1 — PASS, findings to follow. Role: dev-peer-review"}]' "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_not_ready "verdict word only later in the headline is not head-quoting"
expect_contains "later-token verdict is reported as not head-quoting" "head-quoting verdict: no"

# A SPEC-GATE PASS headline is a head-quoting approval.
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" \
  '[{"body":"## SPEC-GATE PASS\n\nChecked at head `abcdef1`, tier T2 is satisfied. Role: spec-reviewer"}]' "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_ok "SPEC-GATE PASS quoting the head exits 0"

# -----------------------------------------------------------------------
# 2. Conflict state: CONFLICTING and DIRTY both block.
# -----------------------------------------------------------------------
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}" \
  "${TEST_HEAD}" "CONFLICTING" "DIRTY"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_not_ready "CONFLICTING/DIRTY PR exits non-zero"
expect_contains "CONFLICTING is reported" "Mergeable: CONFLICTING / DIRTY"
expect_contains "CONFLICTING is named as a blocking reason" "mergeable CONFLICTING"
expect_contains "block reports NOT READY" "Status:    NOT READY"
expect_contains "summary says NOT READY" "Merge readiness: NOT READY"

reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}" \
  "${TEST_HEAD}" "MERGEABLE" "DIRTY"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_not_ready "mergeStateStatus DIRTY exits non-zero"
expect_contains "DIRTY is named as a blocking reason" "mergeStateStatus DIRTY"

# -----------------------------------------------------------------------
# 3. Review gate: no head-quoting verdict, and a stale verdict.
# -----------------------------------------------------------------------
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${NO_COMMENTS}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_not_ready "no verdict exits non-zero"
expect_contains "missing verdict is reported" "head-quoting verdict: no"
expect_contains "missing verdict is named as a blocking reason" "no head-quoting APPROVE/SPEC-GATE PASS verdict"

reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${STALE_APPROVE}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_not_ready "verdict on an older head exits non-zero"
expect_contains "stale verdict is reported as stale" "Stale:     verdict(s) on an older head (not head-quoting)"
expect_contains "stale verdict quotes the older head" "deadbee9"
expect_contains "stale verdict leaves the head unapproved" "head-quoting verdict: no"

# -----------------------------------------------------------------------
# 4. CI is reported, never gated: failing checks still exit 0.
# -----------------------------------------------------------------------reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${FAIL_CHECKS}"
build_open_prs 674
invoke 674
expect_ok "failing CI does not add an exit condition (#746)"
expect_contains "failing CI worst conclusion is reported" "CI:        worst conclusion: fail"
expect_contains "failing CI names the failing job" "go-build (fail/FAILED)"
expect_contains "failing CI still reports merge readiness" "Status:    READY"

# The risk gate is reported, not gated (the #746 exit conditions are
# conflict state + head-quoting verdict), and a risk-high label names the
# owner-merge rule so the report cannot imply autonomous merge.
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" '[{"name":"chore"},{"name":"risk-high"}]' "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
expect_ok "risk-high is reported without adding an exit condition (#746)"
expect_contains "risk-high names the owner-merge rule" "Owner:     risk-high needs explicit owner approval"

# -----------------------------------------------------------------------
# 5. Stack-order hint: native `.stack` position/size plus merge order.
# -----------------------------------------------------------------------
reset_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_pr 676 branch-675 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_pr 677 branch-676 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675 676 677
write_stack_resource "$(stack_resource_json 678 4 674 675 676 677)"
invoke 675
expect_ok "stack member exits 0 when clean and head-approved"
expect_contains "native stack position and size are reported" "native stack #678: position 2 of 4"
expect_contains "stack merge order is printed bottom first" "merge order (bottom first): #674 -> #675 -> #676 -> #677"
expect_contains "stack hint states the bottom-member refresh rule" "refresh the bottom member against ${TEST_DEFAULT_BRANCH}, re-verify the stack"

# A non-native stack (branch chain only) still gets a position and an
# order, derived read-only from the open-PR base chain.
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675
expect_ok "branch-chained PR exits 0 when clean and head-approved"
expect_contains "branch-chain position is reported" "branch-chain position 2"
expect_contains "branch-chain merge order is reported" "merge order (bottom first): #674 -> #675"

# -----------------------------------------------------------------------
# 6. Multiple PRs: one blocking member makes the whole run NOT READY and
#    every block still prints (report completeness).
# -----------------------------------------------------------------------
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${NO_COMMENTS}" "${NO_REVIEWS}" \
  "${TEST_HEAD}" "CONFLICTING" "DIRTY"
write_checks 674 "${GREEN_CHECKS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 674 675
expect_not_ready "a conflicting member fails the multi-PR run"
expect_contains "the clean member still prints its block" "=== PR #674:"
expect_contains "the conflicting member prints its block" "=== PR #675:"
expect_contains "summary names the failing member" "#675:"
expect_contains "summary names every head checked" "#674=${TEST_HEAD} #675=${TEST_HEAD}"

# -----------------------------------------------------------------------
# 7. Read-only contract (issue #746 AC 5).
# -----------------------------------------------------------------------
reset_fixtures
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674
if grep -qE -- '(^| )(--method (-X )?(POST|PUT|PATCH|DELETE)|pr (merge|comment|edit|review|ready)|pr label|issue comment|push)' "${TEST_GH_LOG}"; then
  echo "FAIL: the preflight issued a mutating call:"; cat "${TEST_GH_LOG}"; fail=$((fail + 1))
else
  echo "ok: the preflight issued no push/merge/comment/label/branch call"; pass=$((pass + 1))
fi
if grep -qF 'read-only' "${SCRIPT_UNDER_TEST}"; then
  echo "ok: the script documents its read-only contract"; pass=$((pass + 1))
else
  echo "FAIL: the script does not document its read-only contract"; fail=$((fail + 1))
fi

# Bad input is rejected, not guessed.
reset_fixtures
invoke not-a-number
expect_not_ready "a non-numeric PR argument is rejected"
invoke
expect_not_ready "a missing PR argument is rejected"

echo "test result: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
