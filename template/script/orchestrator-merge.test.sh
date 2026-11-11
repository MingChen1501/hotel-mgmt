#!/usr/bin/env bash
# Regression test: orchestrator-merge.sh treats `skipping`/SKIPPED checks
# as non-blocking (path-aware CI marks inapplicable jobs as skipped),
# while fail/failed, pending, and cancelled checks still block the merge;
# and it enforces the review gate leading-token rule over BOTH verdict
# sources — PR issue comments AND formal PR reviews (`gh pr view --json
# reviews`): a reviewer APPROVE verdict counts only when its headline —
# first non-empty line — LEADS with the verdict word (after stripping
# leading markdown markers and an optional SPEC-GATE / Verdict: prefix):
# it must START with PASS/APPROVE; STARTING with FAIL/CHANGES_REQUESTED
# (or CHANGES REQUESTED with a space) counts as blocking — plus a body
# quoting the exact PR head SHA (or a formal-review APPROVED /
# CHANGES_REQUESTED state with a head-quoting body). Verdict words
# mentioned elsewhere — including later in the headline itself (e.g. a
# `fail-closed` proof cited in an APPROVE headline) — are ignored.
# CHANGES_REQUESTED on the head wins (fail closed).
#
# Stack coverage (issue #684): a native stack member (the PR's REST
# resource carries a `stack` object) must be merged through one atomic
# asynchronous merge request, and every open member at or below the
# requested position must pass the same gates individually before that
# request is submitted (fail closed on any failing or unreadable
# member). Unstacked PRs keep the synchronous `gh pr merge` path.
#
# Runs the wrapper with stubbed `gh`/`ao` on PATH plus a temporary marker
# directory, so no network, live session, or real PR is needed. Dry-run
# cases submit nothing; async cases answer the stubbed PUT/GET calls so
# the polling, 409-reuse, and branch-cleanup paths are exercised without
# a real merge.
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
TEST_REPO="$(grep '^REPO=' "${SCRIPT_UNDER_TEST}" | cut -d'"' -f2)"
export TEST_REPO
TEST_DEFAULT_BRANCH="$(grep '^DEFAULT_BRANCH=' "${SCRIPT_UNDER_TEST}" | cut -d'"' -f2)"
export TEST_DEFAULT_BRANCH
export AO_SESSION_ID="test-session"
# Poll without waiting; async cases set their own attempt budget.
export MERGE_ASYNC_POLL_INTERVAL=0

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
# Stub gh: every call is logged so a case can prove what was (not) sent.
if [[ -n "${TEST_GH_LOG:-}" ]]; then printf '%s\n' "$*" >>"${TEST_GH_LOG}"; fi

# Honour an explicit -q / --jq query the way the real CLI would.
QUERY=""; prev=""
for a in "$@"; do
  case "${prev}" in
    -q|--jq) QUERY="$a" ;;
  esac
  prev="$a"
done

emit() {
  if [[ -n "${QUERY}" ]]; then jq -r "${QUERY}" <<<"$1"; else printf '%s\n' "$1"; fi
}

pr_fixture() {
  if [[ -n "${TEST_PR_DIR:-}" && -f "${TEST_PR_DIR}/$1.json" ]]; then
    printf '%s' "${TEST_PR_DIR}/$1.json"
  elif [[ -n "${TEST_PR_JSON:-}" ]]; then
    printf '%s' "${TEST_PR_JSON}"
  fi
}

if [[ "$1" == "pr" && "$2" == "view" ]]; then
  fixture="$(pr_fixture "$3")"
  [[ -n "${fixture}" ]] || { echo "stub gh: no PR fixture for #$3" >&2; exit 1; }
  # After the async request, read-backs report the merged state.
  if [[ -n "${TEST_MERGED_FLAG:-}" && -f "${TEST_MERGED_FLAG}" ]]; then
    payload="$(jq '.state = "MERGED"' "${fixture}")"
  else
    payload="$(cat "${fixture}")"
  fi
  emit "${payload}"
elif [[ "$1" == "pr" && "$2" == "checks" ]]; then
  fixture=""
  if [[ -n "${TEST_PR_DIR:-}" && -f "${TEST_PR_DIR}/checks-$3.json" ]]; then
    fixture="${TEST_PR_DIR}/checks-$3.json"
  elif [[ -n "${TEST_CHECKS_JSON:-}" ]]; then
    fixture="${TEST_CHECKS_JSON}"
  fi
  [[ -n "${fixture}" ]] || { echo "stub gh: no checks fixture for #$3" >&2; exit 1; }
  emit "$(cat "${fixture}")"
elif [[ "$1" == "pr" && "$2" == "list" ]]; then
  list_state="open"; list_head=""; prev=""
  for a in "$@"; do
    case "${prev}" in
      --state) list_state="$a" ;;
      --head) list_head="$a" ;;
    esac
    prev="$a"
  done
  if [[ "${list_state}" == "all" || -n "${list_head}" ]]; then
    payload='[]'
    if [[ -n "${TEST_ALL_PRS:-}" ]]; then payload="$(cat "${TEST_ALL_PRS}")"; fi
    if [[ -n "${list_head}" ]]; then
      payload="$(printf '%s' "${payload}" | jq -c --arg h "${list_head}" '[.[] | select(.headRefName == $h)]')"
    fi
    emit "${payload}"
  elif [[ -n "${TEST_MERGED_FLAG:-}" && -f "${TEST_MERGED_FLAG}" && -n "${TEST_OPEN_PRS_AFTER:-}" ]]; then
    emit "$(cat "${TEST_OPEN_PRS_AFTER}")"
  elif [[ -n "${TEST_OPEN_PRS:-}" ]]; then
    emit "$(cat "${TEST_OPEN_PRS}")"
  else
    emit '[]'
  fi
elif [[ "$1" == "api" ]]; then
  method="GET"; prev=""; path=""
  for a in "$@"; do
    case "${prev}" in
      --method|-X) method="$a" ;;
    esac
    case "$a" in
      repos/*) path="$a" ;;
    esac
    prev="$a"
  done
  if [[ "${method}" == "GET" && "${path}" =~ /stacks/([0-9]+)$ ]]; then
    stack_num="${BASH_REMATCH[1]}"
    if [[ -n "${TEST_STACK_RESOURCE_UNREADABLE:-}" ]]; then
      echo "stub gh: cannot read stack #${stack_num}" >&2
      exit 1
    fi
    if [[ -n "${TEST_STACK_RESOURCE:-}" && -f "${TEST_STACK_RESOURCE}" ]]; then
      cat "${TEST_STACK_RESOURCE}"
      exit 0
    fi
    echo "stub gh: no stack resource fixture for #${stack_num}" >&2
    exit 1
  fi
  if [[ "${method}" == "GET" && "${path}" =~ /pulls/([0-9]+)$ ]]; then
    num="${BASH_REMATCH[1]}"
    if [[ -n "${TEST_STACK_UNREADABLE:-}" && ",${TEST_STACK_UNREADABLE}," == *",${num},"* ]]; then
      echo "stub gh: cannot read PR #${num}" >&2
      exit 1
    fi
    if [[ -n "${TEST_STACK_NONMEMBERS:-}" && ",${TEST_STACK_NONMEMBERS}," == *",${num},"* ]]; then
      printf '{"number":%s}\n' "${num}"
      exit 0
    fi
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
  if [[ "${method}" == "PUT" && "${path}" == */merge-async ]]; then
    [[ -n "${TEST_MERGED_FLAG:-}" ]] && : >"${TEST_MERGED_FLAG}"
    printf '%s\n' "${TEST_ASYNC_PUT_RESPONSE:-HTTP/2.0 202 Accepted
content-type: application/json

{\"status\":\"pending\",\"uuid\":\"test-uuid\"}}"
    exit 0
  fi
  if [[ "${method}" == "GET" && "${path}" == */merge-async/* ]]; then
    counter="${TEST_POLL_COUNTER:-${TMPDIR:-/tmp}/orchestrator-merge-poll.count}"
    count="$(cat "${counter}" 2>/dev/null || printf '0')"
    read -r -a statuses <<<"${TEST_POLL_STATUSES:-merged}"
    index="${count}"
    if [[ "${index}" -ge "${#statuses[@]}" ]]; then index=$(( ${#statuses[@]} - 1 )); fi
    printf '%s' "$((count + 1))" >"${counter}"
    printf '{"status":"%s"}\n' "${statuses[${index}]}"
    exit 0
  fi
  if [[ "${method}" == "DELETE" ]]; then
    if [[ "${TEST_DELETE_FAIL:-0}" == "1" ]]; then
      echo "stub gh: cannot delete ref" >&2
      exit 1
    fi
    exit 0
  fi
  echo "stub gh: unexpected api call: $*" >&2
  exit 1
else
  echo "stub gh: unexpected call: $*" >&2
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

# Review gate (#179 leading-token): an APPROVE headline citing the
# `fail-closed` proof merges — the live PR #178 false positive, where
# the old anywhere-in-headline matcher counted `fail` inside
# `fail-closed` as CHANGES_REQUESTED and refused a genuine APPROVE.
run_case "approve-with-fail-closed-in-headline" \
  '[{"body":"APPROVE — reviewed head abcdef1: all 13 checks green including e2e-single-host and the new fail-closed proof. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  merge

# Review gate (#179 leading-token): a PASS headline recalling an
# earlier CHANGES_REQUESTED round merges — the mention later in the
# headline is ignored.
run_case "pass-headline-with-changes-requested-later" \
  '[{"body":"PASS — head abcdef1 verified after an earlier CHANGES_REQUESTED round, all findings resolved. Role: spec-reviewer"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  merge

# Review gate (#179 leading-token): a `Verdict:`-prefixed APPROVE
# headline merges.
run_case "verdict-prefix-approve" \
  '[{"body":"Verdict: APPROVE — head abcdef1: diff scoped, checks green. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  merge

# Review gate (#179 leading-token): `SPEC-GATE FAIL` refuses — the
# SPEC-GATE prefix is stripped, FAIL leads.
run_case "spec-gate-fail" \
  '[{"body":"SPEC-GATE FAIL — head abcdef1: tier mismatch at docs/README.md:12. Role: spec-reviewer"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  refuse

# Review gate (#179 leading-token): `CHANGES REQUESTED` with a space
# refuses.
run_case "changes-requested-with-space" \
  '[{"body":"CHANGES REQUESTED — head abcdef1: blocker at demo:12. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  refuse

# Review gate (#179 leading-token): a verdict word appearing only
# LATER in the headline does not count — `Reviewed head abcdef1 —
# PASS` leads with `Reviewed`, so there is no APPROVE and the merge
# is refused (the old anywhere-in-headline matcher merged this).
run_case "verdict-word-only-later-in-headline" \
  '[{"body":"Reviewed head abcdef1 — PASS, findings to follow. Role: dev-peer-review"}]' \
  "${NO_REVIEWS}" \
  "${GREEN_CHECKS}" \
  refuse

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

# -----------------------------------------------------------------------
# Stacked-PR coverage (issue #684)
# -----------------------------------------------------------------------
# Fixtures use native stack #678: PR 674 at position 1 (base: the default
# branch), 675 at position 2, 676 at position 3. Every member carries its
# own gates, so the sweep is only as strong as the per-member fixtures
# below.

reset_stack_fixtures() {
  rm -rf "${work}/prs"
  mkdir -p "${work}/prs"
  unset TEST_STACK_MEMBERS TEST_STACK_NONMEMBERS TEST_STACK_UNREADABLE TEST_OPEN_PRS TEST_OPEN_PRS_AFTER \
    TEST_ALL_PRS TEST_ASYNC_PUT_RESPONSE TEST_POLL_STATUSES TEST_MERGED_FLAG TEST_DELETE_FAIL \
    TEST_STACK_RESOURCE TEST_STACK_RESOURCE_UNREADABLE
  export MERGE_ASYNC_POLL_ATTEMPTS=10
  export TEST_PR_DIR="${work}/prs"
  export TEST_GH_LOG="${work}/gh.log"
  export TEST_POLL_COUNTER="${work}/poll.count"
  export TEST_MERGED_FLAG="${work}/merged.flag"
  : >"${TEST_GH_LOG}"
  rm -f "${TEST_POLL_COUNTER}" "${TEST_MERGED_FLAG}" "${work}/stack-resource.json"
  unset TEST_PR_JSON TEST_CHECKS_JSON
}

# write_stack_resource <json>: `GET /repos/{repo}/stacks/<n>` fixture.
# The native stack resource lists members in position order and carries
# each member's state and merged_at (the PR `.stack` objects do not).
write_stack_resource() {
  printf '%s' "$1" >"${work}/stack-resource.json"
  export TEST_STACK_RESOURCE="${work}/stack-resource.json"
}

# stack_resource_json <number> <size> <member-spec...>: build a stack
# resource payload. Each member spec is "<number>:<state>[:<merged_at>]".
stack_resource_json() {
  local number="$1" size="$2" members='[]'
  shift 2
  local spec member_number member_state member_merged
  for spec in "$@"; do
    member_number="${spec%%:*}"
    member_state="${spec#*:}"
    member_state="${member_state%%:*}"
    member_merged=""
    case "${spec}" in
      *:*:*) member_merged="${spec#*:*:}" ;;
    esac
    members="$(printf '%s' "${members}" | jq -c --arg n "${member_number}" --arg s "${member_state}" --arg m "${member_merged}" \
      '. + [{number: ($n | tonumber), state: $s, merged_at: (if $m == "" then null else $m end)}]')"
  done
  printf '{"number":%s,"open":true,"size":%s,"pull_requests":%s}\n' "${number}" "${size}" "${members}"
}

# write_pr <number> <base> <labels-json> <comments-json> <reviews-json> [<head>]
write_pr() {
  local number="$1" base="$2" labels="$3" comments="$4" reviews="$5" head="${6:-${TEST_HEAD}}"
  jq -n --argjson labels "${labels}" --argjson comments "${comments}" --argjson reviews "${reviews}" \
    --arg head "${head}" --arg number "${number}" --arg base "${base}" \
    '{number:($number | tonumber), state:"OPEN", url:("https://example.invalid/" + $number),
      title:("Test PR " + $number), labels:$labels, headRefName:("branch-" + $number),
      headRefOid:$head, baseRefName:$base, comments:$comments, reviews:$reviews}' \
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
    echo "FAIL: ${name} should succeed (status=${STATUS}):"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
  fi
}

expect_refusal() {
  local name="$1"
  if [[ "${STATUS}" -ne 0 && "${OUT}" == *"refusing to merge"* ]]; then
    echo "ok: ${name} refuses"; pass=$((pass + 1))
  else
    echo "FAIL: ${name} should refuse (status=${STATUS}):"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
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

MEDIUM_LABELS='[{"name":"chore"},{"name":"risk-medium"}]'
HIGH_LABELS='[{"name":"chore"},{"name":"risk-high"}]'
DUPLICATE_LABELS='[{"name":"risk-medium"},{"name":"risk-low"}]'
BAD_CHECKS='[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"fail","name":"go-build","state":"FAILED"}]'

# Distinct heads and per-head APPROVEs for the multi-member stack cases:
# a sweep that leaves the last-gated member's state in the shared globals
# pins the request to that member's head and cleans up its branch, so the
# two members must NOT share a head or a head-quoting verdict.
HEAD_674="1111111111111111111111111111111111111111"
HEAD_675="2222222222222222222222222222222222222222"
APPROVE_674='[{"body":"APPROVE — reviewed head 1111111: diff scoped, checks green. Role: dev-peer-review"}]'
APPROVE_675='[{"body":"APPROVE — reviewed head 2222222: diff scoped, checks green. Role: dev-peer-review"}]'

# (a) Stack member -> async dry-run, pinned to the observed head.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674 --dry-run
expect_ok "stack position 1 dry-run exits clean"
expect_contains "stack position 1 dry-run issues the async merge request" "PUT /repos/${TEST_REPO}/pulls/674/merge-async"
expect_contains "stack position 1 dry-run pins the observed head" "sha=${TEST_HEAD}"
expect_contains "stack position 1 dry-run keeps squash" "merge_method=squash"
expect_absent "stack position 1 dry-run never prints the synchronous command" "gh pr merge"

# (a) A position-2 member sweeps its lower member, then issues the async
# request for itself; the lower member's gates are independently read.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_ok "stack position 2 dry-run exits clean"
expect_contains "stack position 2 gates the lower member" "gating member PR #674"
expect_contains "stack position 2 issues the async request for itself" "pulls/675/merge-async"
expect_contains "stack position 2 names every member the request lands" "#674 #675"
expect_absent "stack position 2 never prints the synchronous command" "gh pr merge"
if [[ -z "$(cat "${TEST_GH_LOG}")" ]] || ! grep -q 'pr merge' "${TEST_GH_LOG}"; then
  echo "ok: stack dry-run submitted no merge call"; pass=$((pass + 1))
else
  echo "FAIL: stack dry-run issued a merge call:"; cat "${TEST_GH_LOG}"; fail=$((fail + 1))
fi

# (a) A position-2 member pins the request to ITS OWN head and branch, not
# to the lower member gated last: the members carry different heads and
# head-quoting verdicts, so a stale-global regression is visible here.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_674}" "${NO_REVIEWS}" "${HEAD_674}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_675}" "${NO_REVIEWS}" "${HEAD_675}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_ok "distinct-head position 2 dry-run exits clean"
expect_contains "distinct-head position 2 gates the lower member" "gating member PR #674"
expect_contains "distinct-head position 2 pins the requested head" "sha=${HEAD_675}"
expect_absent "distinct-head position 2 never pins the lower member's head" "sha=${HEAD_674}"
expect_contains "distinct-head position 2 cleans up the requested branch" "would delete branch branch-675 after a terminal merged result"
expect_absent "distinct-head position 2 never cleans up the lower member's branch" "branch-674 after a terminal merged result"

# (b) A lower open member failing a gate aborts the call and names it.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${NO_COMMENTS}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_refusal "lower member without an APPROVE on its head aborts the stack merge"
expect_contains "lower-member refusal names the offending member" "PR #674"
expect_absent "lower-member refusal submits no async request" "merge-async"

# (b) A lower member's failing check aborts the call.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${BAD_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_refusal "lower member with a failing check aborts the stack merge"
expect_contains "failing-check refusal names the offending member" "PR #674 has non-successful checks"

# (b) A lower member carrying risk-high aborts the call (no override).
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${HIGH_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_refusal "lower member labelled risk-high aborts the stack merge"
expect_contains "risk-high refusal names the offending member" "PR #674 is labelled risk-high"
expect_contains "risk-high refusal keeps the owner-only message" "explicit owner approval required"

# (b) A lower member with duplicate risk labels aborts the call.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${DUPLICATE_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_refusal "lower member with duplicate risk labels aborts the stack merge"
expect_contains "duplicate-label refusal names the offending member" "PR #674 must carry exactly one risk label"

# (4) Fail closed: an unreadable lower member aborts before any request.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
export TEST_STACK_UNREADABLE="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_refusal "unreadable lower member aborts the stack merge (fail closed)"
expect_contains "fail-closed refusal names the unreadable member" "cannot read the stack membership of PR #674"

# (4) Fail closed: an unreadable requested PR membership aborts too.
reset_stack_fixtures
export TEST_STACK_UNREADABLE="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674 --dry-run
expect_refusal "unreadable stack membership of the requested PR aborts (fail closed)"
expect_contains "membership refusal names the requested PR" "cannot read the stack membership of PR #674"

# Non-linear: a branch-linked PR that is not in the native stack refuses.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
export TEST_STACK_NONMEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
invoke 675 --dry-run
expect_refusal "branch-linked PR outside the native stack refuses"
expect_contains "non-linear refusal names the member" "is linked by branch but is not a native stack member"

# Non-linear: a missing lower link refuses rather than repairing.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 675
invoke 675 --dry-run
expect_refusal "broken stack chain refuses"
expect_contains "broken-chain refusal explains the missing link" "no open PR (or merged stack member) has head branch 'branch-674' as its base"

# A lower member already MERGED by an earlier stack merge is skipped (it
# is not open, so the request cannot land it again) and is not re-gated.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 675
jq -n --arg base "${TEST_DEFAULT_BRANCH}" \
  '[{number:674,state:"MERGED",headRefName:"branch-674",baseRefName:$base}]' >"${work}/all.json"
export TEST_ALL_PRS="${work}/all.json"
# The skipped member must be proven merged by the stack resource, not just
# by the open-PR list (AC 4).
write_stack_resource "$(stack_resource_json 678 2 674:closed:2026-11-11T18:03:20Z 675:open)"
invoke 675 --dry-run
expect_ok "same-stack merged lower member no longer blocks the next merge"
expect_contains "merged lower member is reported as skipped" "skipping already-merged lower member PR #674"
expect_absent "merged lower member is not re-gated" "gating member PR #674"
expect_contains "next stack member still issues the async request" "pulls/675/merge-async"

# -----------------------------------------------------------------------
# Post-stack-merge retarget (issue #686)
# -----------------------------------------------------------------------
# After a lower stack member merges, GitHub retargets the surviving members
# onto the new default-branch head but leaves the native stack metadata
# (frozen positions) untouched. The branch chain is then SHORTER than
# `.stack.position`. The wrapper accepts that shape only when the stack
# resource proves every missing lower position is a merged member of the
# same stack; every other short chain, and every longer chain, still
# refuses.

# (AC 1) The live #675 shape: base master, chain master -> #675 only,
# `.stack` position 2 of 4, position 1 (#674) merged. The dry-run prints
# the async request pinned to the observed head and never the refusal.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 675 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 675
write_stack_resource "$(stack_resource_json 678 4 674:closed:2026-11-11T18:03:20Z 675:open 676:open 677:open)"
invoke 675 --dry-run
expect_ok "stale stack metadata: retargeted position-2 member dry-run exits clean"
expect_contains "stale stack metadata: async request is still issued" "PUT /repos/${TEST_REPO}/pulls/675/merge-async"
expect_contains "stale stack metadata: request pins the observed head" "sha=${TEST_HEAD}"
expect_contains "stale stack metadata: request keeps squash" "merge_method=squash"
expect_absent "stale stack metadata: never prints the non-linear refusal" "non-linear stack; refusing, not repairing"
expect_absent "stale stack metadata: never prints the synchronous command" "gh pr merge"
expect_contains "stale stack metadata: names the merged lower position" "position 1 (PR #674) is merged"
expect_contains "stale stack metadata: reports the chain start" "accepting the short branch chain that starts at position 2 for PR #675"
if grep -q 'stacks/678' "${TEST_GH_LOG}"; then
  echo "ok: stale stack metadata: membership came from the stack resource"; pass=$((pass + 1))
else
  echo "FAIL: the stack resource was never read:"; cat "${TEST_GH_LOG}"; fail=$((fail + 1))
fi

# (AC 6) The #676 shape: chain master -> #675 -> #676, position 3 of 4,
# positions 1 (#674) merged. The open lower chain member is still gated
# individually; only the proven-merged prefix is skipped.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 675 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
write_pr 676 branch-675 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 676 "${GREEN_CHECKS}"
build_open_prs 675 676
write_stack_resource "$(stack_resource_json 678 4 674:closed:2026-11-11T18:03:20Z 675:open 676:open 677:open)"
invoke 676 --dry-run
expect_ok "retargeted position-3 member dry-run exits clean"
expect_contains "retargeted position-3 member still gates its open lower member" "gating member PR #675"
expect_contains "retargeted position-3 member issues the async request for itself" "pulls/676/merge-async"
expect_contains "retargeted position-3 member names every member the request lands" "#675 #676"
expect_absent "retargeted position-3 member never re-gates the merged prefix" "gating member PR #674"

# (AC 6, review finding 1) The #677 shape right after #675 and #676 merge:
# #677 sits at position 4 with base branch-676, #676 is already MERGED (its
# branch is therefore absent from the open-PR walk), and the resource proves
# positions 1-3 merged. The accepted chain is one link deep and starts at
# #677's own position, so the walk's skipped ancestor must not shift the
# position mapping: `first position + index` would put #677 at position 3
# and refuse it. This is the case the issue calls out as "#677 afterwards".
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 677 branch-676 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 677 "${GREEN_CHECKS}"
build_open_prs 677
jq -n --arg base "${TEST_DEFAULT_BRANCH}" \
  '[{number:676,state:"MERGED",headRefName:"branch-676",baseRefName:$base}]' >"${work}/all.json"
export TEST_ALL_PRS="${work}/all.json"
write_stack_resource "$(stack_resource_json 678 4 \
  674:closed:2026-11-11T18:03:20Z 675:closed:2026-11-11T18:03:20Z \
  676:closed:2026-11-11T18:03:20Z 677:open)"
invoke 677 --dry-run
expect_ok "skipped merged ancestor: short chain is accepted"
expect_contains "skipped merged ancestor: the merged gap is reported as skipped" "skipping already-merged lower member PR #676"
expect_contains "skipped merged ancestor: names the merged position it skipped" "position 3 (PR #676) is merged"
expect_contains "skipped merged ancestor: maps the member to its recorded position" "accepting the short branch chain that starts at position 4 for PR #677"
expect_absent "skipped merged ancestor: never shifts the member onto a neighbour" "not chain member PR #677"
expect_absent "skipped merged ancestor: never re-gates the merged gap" "gating member PR #676"
expect_contains "skipped merged ancestor: issues the async request for itself" "pulls/677/merge-async"
expect_absent "skipped merged ancestor: never prints the synchronous command" "gh pr merge"

# (AC 4) The position mapping is per member, not contiguous: #677's base is
# the merged #676 (position 3), whose own base is the open #675 (position 2),
# so the walk skips position 3 and still gates position 2. The skipped
# position sits ABOVE the chain's lowest member, and only the stack resource
# proves it merged; the async request still lands both open members.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 675 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
write_pr 677 branch-676 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 677 "${GREEN_CHECKS}"
build_open_prs 675 677
jq -n \
  '[{number:676,state:"MERGED",headRefName:"branch-676",baseRefName:"branch-675"}]' >"${work}/all.json"
export TEST_ALL_PRS="${work}/all.json"
write_stack_resource "$(stack_resource_json 678 4 \
  674:closed:2026-11-11T18:03:20Z 675:open \
  676:closed:2026-11-11T18:03:20Z 677:open)"
invoke 677 --dry-run
expect_ok "non-contiguous chain: accepted when every non-chain position is proven merged"
expect_contains "non-contiguous chain: proves the merged position above the chain start" "position 3 (PR #676) is merged"
expect_contains "non-contiguous chain: still gates the open member the chain contains" "gating member PR #675"
expect_contains "non-contiguous chain: issues the async request for the requested member" "pulls/677/merge-async"
expect_contains "non-contiguous chain: names every member the request lands" "#675 #677"

# (AC 2, AC 4) The same skipped-ancestor shape refuses when the skipped
# position is not proven merged in the stack resource: the walk saw a merged
# PR, but the stack resource still reports it open, so it cannot be shown to
# be a merged member of this stack.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 677 branch-676 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 677 "${GREEN_CHECKS}"
build_open_prs 677
jq -n --arg base "${TEST_DEFAULT_BRANCH}" \
  '[{number:676,state:"MERGED",headRefName:"branch-676",baseRefName:$base}]' >"${work}/all.json"
export TEST_ALL_PRS="${work}/all.json"
write_stack_resource "$(stack_resource_json 678 4 \
  674:closed:2026-11-11T18:03:20Z 675:open 676:open 677:open)"
invoke 677 --dry-run
expect_refusal "skipped ancestor unproven in the stack resource refuses"
expect_contains "skipped-ancestor refusal names the offending position" "position 2 (PR #675) is not proven merged"
expect_absent "skipped-ancestor refusal submits no async request" "merge-async"

# (AC 2) An OPEN member at a lower position that the branch chain does not
# contain refuses: the async request would land it without gating it.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 675 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 675
write_stack_resource "$(stack_resource_json 678 4 674:open 675:open 676:open 677:open)"
invoke 675 --dry-run
expect_refusal "open lower member absent from the short chain refuses"
expect_contains "open-but-absent refusal names the offending member" "position 1 (PR #674) is not proven merged"
expect_absent "open-but-absent refusal submits no async request" "merge-async"

# (AC 2) A closed-but-unmerged lower member is not "proven merged" either.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 675 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 675
write_stack_resource "$(stack_resource_json 678 2 674:closed 675:open)"
invoke 675 --dry-run
expect_refusal "closed-but-unmerged lower member refuses"
expect_contains "closed-but-unmerged refusal reports merged_at none" "merged_at none"

# (AC 2) A chain member that does not sit at its reported position in the
# stack resource refuses (a branch-linked PR outside the stack).
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675 676 677"
write_pr 675 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
write_pr 676 branch-675 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 676 "${GREEN_CHECKS}"
build_open_prs 675 676
write_stack_resource "$(stack_resource_json 678 4 674:closed:2026-11-11T18:03:20Z 680:open 676:open 677:open)"
invoke 676 --dry-run
expect_refusal "chain member replaced in the stack resource refuses"
expect_contains "outside-the-stack refusal names the position and member" "position 2 is PR #680, not chain member PR #675"
expect_absent "outside-the-stack refusal submits no async request" "merge-async"

# (AC 2) An unreadable stack resource refuses (fail closed).
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
export TEST_STACK_RESOURCE_UNREADABLE=1
write_pr 675 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 675
invoke 675 --dry-run
expect_refusal "unreadable stack resource refuses the short chain (fail closed)"
expect_contains "unreadable-stack refusal names the stack" "cannot read stack #678"
expect_absent "unreadable-stack refusal submits no async request" "merge-async"

# (AC 2) A chain LONGER than the recorded position still refuses.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 branch-681 "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674 --dry-run
expect_refusal "chain longer than the recorded position refuses"
expect_contains "longer-chain refusal explains the shape" "the branch chain is longer"
expect_absent "longer-chain refusal submits no async request" "merge-async"


# (c) Unstacked PR: exactly today's synchronous command, no async call.
reset_stack_fixtures
write_pr 999 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 999 "${GREEN_CHECKS}"
build_open_prs 999
invoke 999 --dry-run
expect_ok "unstacked dry-run exits clean"
expect_contains "unstacked dry-run keeps the synchronous squash command" "would run: gh pr merge 999 --squash --delete-branch"
expect_absent "unstacked dry-run never issues an async request" "merge-async"

# (c) Unstacked PR whose head is another open PR's base: keep the branch.
reset_stack_fixtures
write_pr 999 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 999 "${GREEN_CHECKS}"
build_open_prs 999
jq -n --arg base "${TEST_DEFAULT_BRANCH}" \
  '[{number:999,headRefName:"branch-999",baseRefName:$base},{number:998,headRefName:"branch-998",baseRefName:"branch-999"}]' \
  >"${work}/open.json"
export TEST_OPEN_PRS="${work}/open.json"
invoke 999 --dry-run
expect_contains "unstacked dry-run drops --delete-branch when another PR targets the head" "would run: gh pr merge 999 --squash (not merged)"

# (5) Async result: a 409 reuses the returned uuid (no second request)
# and only a terminal `merged` is reported as landed.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
export TEST_ASYNC_PUT_RESPONSE='HTTP/2.0 409 Conflict
content-type: application/json

{"message":"A merge request already exists","status":"pending","uuid":"existing-uuid"}'
export TEST_POLL_STATUSES="pending merged"
invoke 674
expect_ok "async 409 result resolves to merged"
expect_contains "async 409 reuses the returned uuid" "reusing uuid existing-uuid"
expect_contains "async terminal merged is reported as merged" "Merged stack #678"
if [[ "$(grep -c 'api --method PUT' "${TEST_GH_LOG}")" -eq 1 ]]; then
  echo "ok: async 409 issued exactly one merge request"; pass=$((pass + 1))
else
  echo "FAIL: async 409 issued an unexpected number of merge requests:"; cat "${TEST_GH_LOG}"; fail=$((fail + 1))
fi

# (3) A PUT response with no header block is not fatal: the uuid is still
# parsed out of the bare body and polled, instead of the run dying on an
# unguarded pipeline under `set -euo pipefail` after the request was sent.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
export TEST_ASYNC_PUT_RESPONSE='{"status":"pending","uuid":"bare-uuid"}'
export TEST_POLL_STATUSES="merged"
invoke 674
expect_ok "header-less PUT response still reaches a verified result"
expect_contains "header-less PUT response reports the unreadable status" "returned no readable HTTP status"
expect_contains "header-less PUT response polls the parsed uuid" "Merged stack #678"
if grep -q 'merge-async/bare-uuid' "${TEST_GH_LOG}"; then
  echo "ok: header-less PUT response uuid was parsed and polled"; pass=$((pass + 1))
else
  echo "FAIL: header-less PUT response uuid was not used:"; cat "${TEST_GH_LOG}"; fail=$((fail + 1))
fi

# (5) Pending is never reported as landed; polling exhaustion fails.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
export MERGE_ASYNC_POLL_ATTEMPTS=2
export TEST_POLL_STATUSES="pending"
invoke 674
if [[ "${STATUS}" -ne 0 ]]; then
  echo "ok: still-pending async result exits non-zero"; pass=$((pass + 1))
else
  echo "FAIL: still-pending async result should exit non-zero:"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
fi
expect_contains "still-pending result is reported as pending" "still pending after polling"
expect_absent "still-pending result is never reported as merged" "Merged stack"

# (5) A failed async result is reported as failed, not merged.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
export MERGE_ASYNC_POLL_ATTEMPTS=2
export TEST_POLL_STATUSES="failed"
invoke 674
if [[ "${STATUS}" -ne 0 ]]; then
  echo "ok: failed async result exits non-zero"; pass=$((pass + 1))
else
  echo "FAIL: failed async result should exit non-zero:"; printf '%s\n' "${OUT}"; fail=$((fail + 1))
fi
expect_contains "failed async result is reported as failed" "failed"
expect_absent "failed async result is never reported as merged" "Merged stack"

# (7) After a terminal merged result: delete the head branch only when no
# open PR still targets it (a fresh read-back), and a failed deletion is
# a warning, not a failure.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
export TEST_POLL_STATUSES="merged"
invoke 674
expect_ok "merged async result exits clean"
expect_contains "merged async result deletes the freed head branch" "Deleted branch branch-674"
if grep -q 'git/refs/heads/branch-674' "${TEST_GH_LOG}"; then
  echo "ok: branch deletion went through the guarded ref API"; pass=$((pass + 1))
else
  echo "FAIL: no branch deletion call was recorded:"; cat "${TEST_GH_LOG}"; fail=$((fail + 1))
fi

# (7) A position-2 stack merge deletes the REQUESTED member's head branch
# (branch-675), never the lower member's branch the sweep gated last.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674 675"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_674}" "${NO_REVIEWS}" "${HEAD_674}"
write_checks 674 "${GREEN_CHECKS}"
write_pr 675 branch-674 "${MEDIUM_LABELS}" "${APPROVE_675}" "${NO_REVIEWS}" "${HEAD_675}"
write_checks 675 "${GREEN_CHECKS}"
build_open_prs 674 675
export TEST_POLL_STATUSES="merged"
invoke 675
expect_ok "distinct-head position 2 merge exits clean"
expect_contains "distinct-head position 2 deletes the requested branch" "Deleted branch branch-675"
if grep -q 'git/refs/heads/branch-675' "${TEST_GH_LOG}" && ! grep -q 'git/refs/heads/branch-674' "${TEST_GH_LOG}"; then
  echo "ok: position-2 branch deletion targeted the requested branch ref"; pass=$((pass + 1))
else
  echo "FAIL: position-2 branch deletion targeted the wrong ref:"; cat "${TEST_GH_LOG}"; fail=$((fail + 1))
fi

reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
jq -n --arg base "${TEST_DEFAULT_BRANCH}" \
  '[{number:674,headRefName:"branch-674",baseRefName:$base},{number:675,headRefName:"branch-675",baseRefName:"branch-674"}]' \
  >"${work}/open-after.json"
export TEST_OPEN_PRS_AFTER="${work}/open-after.json"
export TEST_POLL_STATUSES="merged"
invoke 674
expect_ok "merged async result with a dependent PR exits clean"
expect_contains "dependent PR keeps the merged head branch" "another open PR still targets it as a base"
if grep -q 'git/refs/heads/branch-674' "${TEST_GH_LOG}"; then
  echo "FAIL: branch deletion ran while an open PR still targeted it"; fail=$((fail + 1))
else
  echo "ok: guarded branch deletion skipped the still-targeted branch"; pass=$((pass + 1))
fi

reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${MEDIUM_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
export TEST_POLL_STATUSES="merged"
export TEST_DELETE_FAIL=1
invoke 674
expect_ok "failed branch cleanup does not fail a successful merge"
expect_contains "failed branch cleanup is reported as a warning" "branch cleanup failed"

# (6) risk-high on the requested stack member still refuses with the
# owner-only message and submits nothing.
reset_stack_fixtures
export TEST_STACK_MEMBERS="674"
write_pr 674 "${TEST_DEFAULT_BRANCH}" "${HIGH_LABELS}" "${APPROVE_SHORT}" "${NO_REVIEWS}"
write_checks 674 "${GREEN_CHECKS}"
build_open_prs 674
invoke 674 --dry-run
expect_refusal "stack member labelled risk-high refuses"
expect_contains "stack risk-high refusal keeps the owner-only message" "explicit owner approval required"
expect_absent "stack risk-high refusal submits no async request" "merge-async"

echo "test result: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
