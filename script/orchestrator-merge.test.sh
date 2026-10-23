#!/usr/bin/env bash
# Regression test: orchestrator-merge.sh treats `skipping`/SKIPPED checks
# as non-blocking (path-aware CI marks inapplicable jobs as skipped),
# while fail/failed, pending, and cancelled checks still block the merge;
# and it enforces the review gate headline-first (a reviewer APPROVE
# COMMENT whose headline — first non-empty line — declares PASS/APPROVE
# and whose body quotes the exact PR head SHA, with no
# FAIL/CHANGES_REQUESTED headline quoting that head; verdict words
# mentioned elsewhere in the body are ignored).
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
# comments quote it in short (abcdef1) or full form; the stale
# fixture quotes an unrelated SHA instead.
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
# TEST_HEAD carrying the given comments JSON array.
make_pr_json() {
  jq -n --argjson comments "$1" --arg head "${TEST_HEAD}" \
    '{number:999,state:"OPEN",url:"https://example.invalid/999",title:"Test PR",labels:[{name:"chore"},{name:"risk-medium"}],headRefName:"test-branch",headRefOid:$head,baseRefName:"master",comments:$comments}'
}

GREEN_CHECKS='[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"skipping","name":"go-build","state":"SKIPPED"}]'
APPROVE_SHORT='[{"body":"APPROVE — reviewed head abcdef1: diff scoped, checks green. Role: dev-peer-review"}]'
APPROVE_FULL='[{"body":"APPROVE — reviewed head abcdef1234567890abcdef1234567890abcdef12: diff scoped, checks green. Role: dev-peer-review"}]'

pass=0
fail=0
run_case() {
  local name="$1" comments_json="$2" checks_json="$3" expect="$4" # expect: merge | refuse
  local pr_file="${work}/pr.json" checks_file="${work}/checks.json"
  make_pr_json "${comments_json}" >"${pr_file}"
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
  "${APPROVE_SHORT}" \
  '[{"bucket":"pass","name":"changes","state":"SUCCESS"},{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"skipping","name":"go-build","state":"SKIPPED"},{"bucket":"skipping","name":"node-build","state":"SKIPPED"},{"bucket":"skipping","name":"billing-build","state":"SKIPPED"},{"bucket":"skipping","name":"contract-check","state":"SKIPPED"},{"bucket":"skipping","name":"migrate-check","state":"SKIPPED"},{"bucket":"skipping","name":"e2e-single-host","state":"SKIPPED"}]' \
  merge

run_case "pass+fail" \
  "${APPROVE_SHORT}" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"fail","name":"go-build","state":"FAILED"}]' \
  refuse

run_case "pass+pending" \
  "${APPROVE_SHORT}" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"pending","name":"go-build","state":"PENDING"}]' \
  refuse

run_case "pass+cancelled" \
  "${APPROVE_SHORT}" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"cancelled","name":"go-build","state":"CANCELLED"}]' \
  refuse

# Review gate: head-with-APPROVE (short and full SHA) merges.
run_case "head-with-approve-short" "${APPROVE_SHORT}" "${GREEN_CHECKS}" merge
run_case "head-with-approve-full" "${APPROVE_FULL}" "${GREEN_CHECKS}" merge

# Review gate: a PASS headline whose body merely mentions an earlier
# CHANGES_REQUESTED round still merges (regression for #146: PR #145's
# SPEC-GATE PASS quoted the head while recalling a CHANGES_REQUESTED
# round, and the old whole-body matcher refused it). The leading blank
# line also proves the headline is the first NON-EMPTY line.
run_case "pass-with-mention-in-body" \
  '[{"body":"\n## SPEC-GATE PASS\n\nChecked at head `abcdef1`, scope is harness-only — after a CHANGES_REQUESTED round, all findings resolved. Role: spec-reviewer"}]' \
  "${GREEN_CHECKS}" \
  merge

# Review gate: head-without-verdict refuses (headline declares no
# PASS/APPROVE/FAIL/CHANGES_REQUESTED, even though the body quotes
# the head).
run_case "head-without-verdict" \
  '[{"body":"Reviewed head abcdef1 — findings below, verdict to follow. Role: dev-peer-review"}]' \
  "${GREEN_CHECKS}" \
  refuse

# Review gate: a stale APPROVE quoting an older head refuses.
run_case "stale-approve" \
  '[{"body":"APPROVE — reviewed head deadbee9: diff scoped. Role: dev-peer-review"}]' \
  "${GREEN_CHECKS}" \
  refuse

# Review gate: head-with-CHANGES_REQUESTED-headline refuses.
run_case "head-with-changes-requested" \
  '[{"body":"CHANGES_REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review"}]' \
  "${GREEN_CHECKS}" \
  refuse

# Review gate: a CHANGES_REQUESTED headline wins over an APPROVE on
# the same head.
run_case "approve-plus-changes-requested" \
  '[{"body":"APPROVE — reviewed head abcdef1. Role: dev-peer-review"},{"body":"CHANGES_REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review"}]' \
  "${GREEN_CHECKS}" \
  refuse

echo "test result: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
