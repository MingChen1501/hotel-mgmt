#!/usr/bin/env bash
# Regression test: orchestrator-merge.sh treats `skipping`/SKIPPED checks
# as non-blocking (path-aware CI marks inapplicable jobs as skipped),
# while fail/failed, pending, and cancelled checks still block the merge;
# and it enforces the review gate headline-first over BOTH verdict
# sources — PR issue comments AND formal PR reviews (`gh pr view --json
# reviews`): a reviewer APPROVE verdict whose headline — first non-empty
# line — declares PASS/APPROVE and whose body quotes the exact PR head
# SHA (or whose formal-review state is APPROVED with a head-quoting
# body), with no FAIL/CHANGES_REQUESTED headline or CHANGES_REQUESTED
# state quoting that head; verdict words mentioned elsewhere in the
# body are ignored; CHANGES_REQUESTED on the head wins (fail closed).
#
# Runs the wrapper with stubbed `gh`/`ao` on PATH plus a temporary marker
# directory, so no network, live session, or real PR is needed. Every case
# uses --dry-run: a mergeable run prints "would run", a blocked run exits
# non-zero with "refusing to merge".
#
# Usage: bash script/orchestrator-merge.test.sh [--script <path>]
#   --script defaults to the live wrapper next to this test; point it at
#   template/script/orchestrator-merge.sh to cover the template twin.
set -euo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/orchestrator-merge.sh"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --script) SCRIPT_UNDER_TEST="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--script <path>]"; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -f "${SCRIPT_UNDER_TEST}" ]] || { echo "error: script not found: ${SCRIPT_UNDER_TEST}" >&2; exit 1; }
# Absolutize: cases below run the wrapper from a temp working directory.
if [[ "${SCRIPT_UNDER_TEST}" != /* ]]; then
  SCRIPT_UNDER_TEST="$(pwd)/${SCRIPT_UNDER_TEST}"
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
touch "${work}/.ao-orchestrator"

# The wrapper reads its PROJECT constant itself; echo it back from the
# `ao` stub so this test covers live and template twins unchanged.
TEST_PROJECT="$(grep '^PROJECT=' "${SCRIPT_UNDER_TEST}" | cut -d'"' -f2)"
export TEST_PROJECT
export AO_SESSION_ID="test-session"

# Fixed head SHA for every PR fixture (40 lowercase hex). Verdict
# comments and reviews quote it in short (abcdef1) or full form; the
# stale fixtures quote an unrelated SHA instead.
TEST_HEAD="abcdef1234567890abcdef1234567890abcdef12"
export TEST_HEAD

mkdir -p "${work}/bin"
cat >"${work}/bin/ao" <<'EOF'
#!/usr/bin/env bash
printf '{"data":[{"id":"%s","projectId":"%s","role":"orchestrator","isTerminated":false}]}\n' \
  "${AO_SESSION_ID}" "${TEST_PROJECT}"
EOF
cat >"${work}/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "pr" && "$2" == "view" ]]; then
  cat "${TEST_PR_JSON}"
elif [[ "$1" == "pr" && "$2" == "checks" ]]; then
  cat "${TEST_CHECKS_JSON}"
elif [[ "$1" == "pr" && "$2" == "list" ]]; then
  printf ''
else
  echo "stub gh: unexpected call (merge must not run under --dry-run): $*" >&2
  exit 1
fi
EOF
chmod +x "${work}/bin/ao" "${work}/bin/gh"
export PATH="${work}/bin:${PATH}"

# Build the stubbed `gh pr view` payload: an OPEN risk-medium PR at
# TEST_HEAD carrying the given comments and formal reviews JSON arrays.
# The stub returns this payload for every `gh pr view` call, so it
# covers both the comments and the reviews read.
make_pr_json() {
  jq -n --argjson comments "$1" --argjson reviews "$2" --arg head "${TEST_HEAD}" \
    '{number:999,state:"OPEN",url:"https://example.invalid/999",title:"Test PR",labels:[{name:"chore"},{name:"risk-medium"}],headRefName:"test-branch",headRefOid:$head,baseRefName:"master",comments:$comments,reviews:$reviews}'
}

GREEN_CHECKS='[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"skipping","name":"go-build","state":"SKIPPED"}]'
APPROVE_SHORT='[{"body":"APPROVE — reviewed head abcdef1: diff scoped, checks green. Role: dev-peer-review"}]'
APPROVE_FULL='[{"body":"APPROVE — reviewed head abcdef1234567890abcdef1234567890abcdef12: diff scoped, checks green. Role: dev-peer-review"}]'
NO_REVIEWS='[]'
NO_COMMENTS='[]'
# Formal-review APPROVE mirroring PR #164: COMMENTED state with an
# APPROVE headline quoting the head.
FORMAL_APPROVE_COMMENTED='[{"body":"## APPROVE\n\nReviewed head `abcdef1`. All check areas pass; CI green on this exact head.\n\nRole: dev-peer-review","state":"COMMENTED"}]'
# Formal-review APPROVE via state: no verdict headline, but the
# APPROVED state plus a head-quoting body.
FORMAL_APPROVE_STATE='[{"body":"Reviewed head abcdef1, looks good.","state":"APPROVED"}]'

pass=0
fail=0
run_case() {
  local name="$1" comments_json="$2" reviews_json="$3" checks_json="$4" expect="$5" # expect: merge | refuse
  local pr_file="${work}/pr.json" checks_file="${work}/checks.json"
  make_pr_json "${comments_json}" "${reviews_json}" >"${pr_file}"
  printf '%s' "${checks_json}" >"${checks_file}"
  export TEST_PR_JSON="${pr_file}" TEST_CHECKS_JSON="${checks_file}"
  local out status=0
  if out="$(cd "${work}" && bash "${SCRIPT_UNDER_TEST}" 999 --dry-run 2>&1)"; then
    status=0
  else
    status=$?
  fi
  if [[ "${expect}" == "merge" ]]; then
    if [[ "${status}" -eq 0 && "${out}" == *"would run"* ]]; then
      echo "ok: ${name} merges"; pass=$((pass + 1))
    else
      echo "FAIL: ${name} should merge (status=${status}):"; printf '%s\n' "${out}"; fail=$((fail + 1))
    fi
  else
    if [[ "${status}" -ne 0 && "${out}" == *"refusing to merge"* ]]; then
      echo "ok: ${name} refuses"; pass=$((pass + 1))
    else
      echo "FAIL: ${name} should refuse (status=${status}):"; printf '%s\n' "${out}"; fail=$((fail + 1))
    fi
  fi
}

# Mirrors docs-only PR 123: 2 pass + 6 skipped -> merges (with an
# APPROVE on the head, so the merge decision rests on the checks).
run_case "pass+skip" \
  "${APPROVE_SHORT}" "${NO_REVIEWS}" \
  '[{"bucket":"pass","name":"changes","state":"SUCCESS"},{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"skipping","name":"go-build","state":"SKIPPED"},{"bucket":"skipping","name":"node-build","state":"SKIPPED"},{"bucket":"skipping","name":"billing-build","state":"SKIPPED"},{"bucket":"skipping","name":"contract-check","state":"SKIPPED"},{"bucket":"skipping","name":"migrate-check","state":"SKIPPED"},{"bucket":"skipping","name":"e2e-single-host","state":"SKIPPED"}]' \
  merge

run_case "pass+fail" \
  "${APPROVE_SHORT}" "${NO_REVIEWS}" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"fail","name":"go-build","state":"FAILED"}]' \
  refuse

run_case "pass+pending" \
  "${APPROVE_SHORT}" "${NO_REVIEWS}" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"pending","name":"go-build","state":"PENDING"}]' \
  refuse

run_case "pass+cancelled" \
  "${APPROVE_SHORT}" "${NO_REVIEWS}" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"cancelled","name":"go-build","state":"CANCELLED"}]' \
  refuse

# Review gate: head-with-APPROVE (short and full SHA) merges.
run_case "head-with-approve-short" "${APPROVE_SHORT}" "${NO_REVIEWS}" "${GREEN_CHECKS}" merge
run_case "head-with-approve-full" "${APPROVE_FULL}" "${NO_REVIEWS}" "${GREEN_CHECKS}" merge

# Review gate: a PASS headline whose body merely mentions an earlier
# CHANGES_REQUESTED round still merges (regression for #146: PR #145's
# SPEC-GATE PASS quoted the head while recalling a CHANGES_REQUESTED
# round, and the old whole-body matcher refused it). The leading blank
# line also proves the headline is the first NON-EMPTY line.
run_case "pass-with-mention-in-body" \
  '[{"body":"\n## SPEC-GATE PASS\n\nChecked at head `abcdef1`, scope is harness-only — after a CHANGES_REQUESTED round, all findings resolved. Role: spec-reviewer"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  merge

# Review gate: head-without-verdict refuses (headline declares no
# PASS/APPROVE/FAIL/CHANGES_REQUESTED, even though the body quotes
# the head).
run_case "head-without-verdict" \
  '[{"body":"Reviewed head abcdef1 — findings below, verdict to follow. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  refuse

# Review gate: a stale APPROVE quoting an older head refuses.
run_case "stale-approve" \
  '[{"body":"APPROVE — reviewed head deadbee9: diff scoped. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  refuse

# Review gate: head-with-CHANGES_REQUESTED-headline refuses.
run_case "head-with-changes-requested" \
  '[{"body":"CHANGES_REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  refuse

# Review gate: a CHANGES_REQUESTED headline wins over an APPROVE on
# the same head.
run_case "approve-plus-changes-requested" \
  '[{"body":"APPROVE — reviewed head abcdef1. Role: dev-peer-review"},{"body":"CHANGES_REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  refuse

# Review gate (#165): a formal-review APPROVE quoting the head merges,
# with no issue comments at all — COMMENTED state with an APPROVE
# headline (the PR #164 shape), and APPROVED state with a
# head-quoting body.
run_case "formal-approve-commented" \
  "${NO_COMMENTS}" "${FORMAL_APPROVE_COMMENTED}" \
  "${GREEN_CHECKS}" \
  merge
run_case "formal-approve-state" \
  "${NO_COMMENTS}" "${FORMAL_APPROVE_STATE}" \
  "${GREEN_CHECKS}" \
  merge

# Review gate (#165): a formal-review CHANGES_REQUESTED quoting the
# head refuses — via headline and via state alone (fail closed).
run_case "formal-changes-requested" \
  "${NO_COMMENTS}" \
  '[{"body":"CHANGES_REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review","state":"CHANGES_REQUESTED"}]' \
  "${GREEN_CHECKS}" \
  refuse
run_case "formal-changes-state-only" \
  "${NO_COMMENTS}" \
  '[{"body":"Nits at head abcdef1, see inline comments.","state":"CHANGES_REQUESTED"}]' \
  "${GREEN_CHECKS}" \
  refuse

# Review gate (#165): a COMMENTED formal review quoting the head but
# declaring no verdict refuses (no APPROVE anywhere).
run_case "formal-commented-no-verdict" \
  "${NO_COMMENTS}" \
  '[{"body":"Reviewed head abcdef1 — findings below, verdict to follow. Role: dev-peer-review","state":"COMMENTED"}]' \
  "${GREEN_CHECKS}" \
  refuse

# Review gate (#165): a stale formal APPROVE quoting an older head refuses.
run_case "formal-stale-approve" \
  "${NO_COMMENTS}" \
  '[{"body":"## APPROVE\n\nReviewed head `deadbee9`. Role: dev-peer-review","state":"COMMENTED"}]' \
  "${GREEN_CHECKS}" \
  refuse

# Review gate (#165): mixed sources — CHANGES_REQUESTED on the head
# wins over an APPROVE from the other source, either direction.
run_case "comment-approve-plus-formal-changes" \
  "${APPROVE_SHORT}" \
  '[{"body":"CHANGES_REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review","state":"COMMENTED"}]' \
  "${GREEN_CHECKS}" \
  refuse
run_case "formal-approve-plus-comment-changes" \
  '[{"body":"CHANGES_REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review"}]' \
  "${FORMAL_APPROVE_COMMENTED}" \
  "${GREEN_CHECKS}" \
  refuse

# Review gate (#165): a comment APPROVE plus a formal APPROVE on the
# head merges (both sources agree).
run_case "comment-approve-plus-formal-approve" \
  "${APPROVE_SHORT}" "${FORMAL_APPROVE_COMMENTED}" \
  "${GREEN_CHECKS}" \
  merge

echo "test result: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
