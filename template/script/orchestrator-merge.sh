#!/usr/bin/env bash
# orchestrator-merge.sh: the sanctioned merge path for the orchestrator —
# the only way a PR gets merged. Direct `gh pr merge` is denied for
# every session; this wrapper invokes gh (and, for stacked PRs, GitHub's
# asynchronous merge REST API) as a child process, which permission
# evaluation does not see (same mechanism as the spawn and review
# wrappers).
#
# Usage: script/orchestrator-merge.sh <pr-number> [--dry-run]
#
# Refuses unless all of these hold for the requested PR:
#   - the marker file .ao-orchestrator exists in the current worktree
#     (created only in the orchestrator worktree, never committed), AND
#     this AO session is a live orchestrator session for the project
#     (the marker alone is forgeable; this is a guardrail, not a
#     security boundary — real enforcement is GitHub-side),
#   - the PR is OPEN,
#   - the PR carries exactly one risk label and it is not
#     risk-high/risk-very-high (owner approval gate: the owner merges
#     such PRs manually, this script has no override),
#   - a reviewer APPROVE verdict quoting the exact PR head SHA exists
#     on the PR, and no CHANGES_REQUESTED verdict quotes that head
#     (review gate: reviewers quote the head they reviewed — see the
#     orchestrator skill "Review flow"; the gate reads BOTH PR issue
#     comments AND formal PR reviews; verdicts on older heads are
#     stale and do not count; a head carrying both verdicts is refused
#     — the blocking finding wins),
#   - every reported check is successful or skipped as not applicable (a
#     PR with genuinely no checks merges; fail/failed, pending, and
#     cancelled checks still block the merge; skipping/SKIPPED checks
#     are non-blocking — the path-aware CI marks jobs the change cannot
#     affect as not applicable).
#
# Merge call:
#   - unstacked PR: squash-merges via `gh pr merge <n> --squash
#     [--delete-branch]` as a child process, so gh deletes the PR head
#     branch — unless another open PR still targets it as a base
#     (stacked-PR guard), in which case it merges without
#     `--delete-branch` and keeps the branch.
#   - native stack member (the PR's REST resource carries a `stack`
#     object): GitHub refuses the synchronous endpoint for stack
#     members, and one async request merges EVERY open PR at or below
#     the requested position atomically. The wrapper therefore runs the
#     same gates individually over every open stack member at or below
#     the requested position before submitting anything (fail closed:
#     any failing or unreadable member aborts the call; a lower member
#     already merged by an earlier stack merge is skipped, never
#     re-gated), then issues one
#     `PUT /repos/{owner}/{repo}/pulls/<n>/merge-async` request pinned to
#     the exact head SHA the gate observed, and polls the returned uuid
#     to a terminal status (`merged` / `enqueued` / `failed`) — a
#     `pending` result is never reported as landed. The async API never
#     deletes branches, so branch cleanup stays a separate, guarded step.
# --dry-run prints the exact merge request it would issue without
# merging (and never submits a request).
set -euo pipefail

REPO="{{REPO_SLUG}}"
PROJECT="{{PROJECT_NAME}}"
MARKER=".ao-orchestrator"
DEFAULT_BRANCH="{{DEFAULT_BRANCH}}"
API_VERSION="2026-03-10"
POLL_ATTEMPTS="${MERGE_ASYNC_POLL_ATTEMPTS:-10}"
POLL_INTERVAL="${MERGE_ASYNC_POLL_INTERVAL:-3}"
[[ "${POLL_ATTEMPTS}" =~ ^[0-9]+$ ]] || POLL_ATTEMPTS=10
[[ "${POLL_INTERVAL}" =~ ^[0-9]+$ ]] || POLL_INTERVAL=3

# Orchestrator gate: the marker file alone is forgeable (any session
# can touch it), so additionally require that this AO session is a live
# orchestrator session for this project. Guardrail, not a security
# boundary: a session that deliberately forges both signals can still
# run this script — real enforcement is GitHub-side branch
# protection/rulesets (follow-up issue), which no session can bypass.
require_orchestrator() {
  local action="$1"
  if [[ ! -f "${MARKER}" ]]; then
    echo "error: refusing to ${action}: marker file ${MARKER} not found in $(pwd)" >&2
    echo "Merges run only from the orchestrator worktree holding that marker (never committed)." >&2
    exit 1
  fi
  if [[ -z "${AO_SESSION_ID:-}" ]]; then
    echo "error: refusing to ${action}: AO_SESSION_ID is not set; run from the orchestrator session." >&2
    exit 1
  fi
  local orch_ok
  orch_ok="$(ao orchestrator ls --json 2>/dev/null | jq -r --arg s "${AO_SESSION_ID}" --arg p "${PROJECT}" '[.data[]? | select(.id == $s and .projectId == $p and .role == "orchestrator" and .isTerminated == false)] | length' 2>/dev/null || true)"
  if [[ "${orch_ok}" != "1" ]]; then
    echo "error: refusing to ${action}: session '${AO_SESSION_ID}' is not a live orchestrator session for ${PROJECT}." >&2
    exit 1
  fi
}

usage() {
  echo "Usage: $0 <pr-number> [--dry-run]" >&2
}

refuse() {
  echo "error: refusing to merge: $*" >&2
  exit 1
}

pr=""
dry_run=0
for arg in "$@"; do
  case "${arg}" in
    --dry-run) dry_run=1 ;;
    -h|--help) usage; exit 0 ;;
    *) [[ -z "${pr}" ]] || { echo "error: unexpected argument: ${arg}" >&2; usage; exit 1; }; pr="${arg}" ;;
  esac
done

[[ -n "${pr}" ]] || { echo "error: a PR number is required" >&2; usage; exit 1; }
[[ "${pr}" =~ ^[0-9]+$ ]] || { echo "error: PR number must be numeric, got '${pr}'" >&2; exit 1; }

require_orchestrator "merge"

# --- Per-PR metadata and gates ------------------------------------------
# The gate helpers work on the globals loaded by load_pr, so the same
# code gates the requested PR and every lower stack member.

pr_state=""
pr_url=""
pr_title=""
pr_labels=""
risk_labels=""
risk_count=""
head_branch=""
head_oid=""
base_branch=""

load_pr() {
  local num="$1" out
  out="$(gh pr view "${num}" -R "${REPO}" --json number,state,url,title,labels,headRefName,headRefOid,baseRefName 2>&1)" || {
    if printf '%s' "${out}" | grep -qiE "could not resolve|not found|no pull requests|404"; then
      refuse "PR #${num} not found in ${REPO}"
    fi
    refuse "cannot load PR #${num}: $(printf '%s' "${out}" | head -n 1)"
  }
  if ! printf '%s' "${out}" | jq -e 'type == "object"' >/dev/null 2>&1; then
    refuse "cannot parse the metadata of PR #${num} (fail closed)"
  fi
  pr_state="$(printf '%s' "${out}" | jq -r '.state')"
  pr_url="$(printf '%s' "${out}" | jq -r '.url')"
  pr_title="$(printf '%s' "${out}" | jq -r '.title')"
  pr_labels="$(printf '%s' "${out}" | jq -r '[.labels[].name] | join(", ")')"
  risk_labels="$(printf '%s' "${out}" | jq -r '[.labels[].name | select(startswith("risk-"))] | join(" ")')"
  risk_count="$(printf '%s' "${out}" | jq -r '[.labels[].name | select(startswith("risk-"))] | length')"
  head_branch="$(printf '%s' "${out}" | jq -r '.headRefName')"
  head_oid="$(printf '%s' "${out}" | jq -r '.headRefOid // empty')"
  base_branch="$(printf '%s' "${out}" | jq -r '.baseRefName')"
}

print_pr_header() {
  local num="$1"
  echo "PR:      #${num} ${pr_title}"
  echo "URL:     ${pr_url}"
  echo "State:   ${pr_state}"
  echo "Labels:  ${pr_labels}"
  echo "Head:    ${head_oid:-unknown} (${head_branch})"
}

# Risk gate: exactly one risk label, never risk-high/risk-very-high (no
# override — the owner merges such PRs manually).
check_risk_gate() {
  local num="$1"
  if [[ "${risk_count}" -ne 1 ]]; then
    echo "error: refusing to merge: PR #${num} must carry exactly one risk label (found ${risk_count}: ${risk_labels:-none})" >&2
    echo "risk-high, risk-very-high, or a missing label needs explicit owner approval." >&2
    exit 1
  fi
  if [[ "${risk_labels}" == "risk-high" || "${risk_labels}" == "risk-very-high" ]]; then
    echo "error: refusing to merge: PR #${num} is labelled ${risk_labels}; explicit owner approval required." >&2
    echo "The owner merges such PRs manually (e.g. gh pr merge --squash --delete-branch) after approving; this script has no override." >&2
    exit 1
  fi
}

# Review gate: the exact head must carry a reviewer APPROVE verdict.
# The gate reads BOTH verdict sources — PR issue comments AND formal
# PR reviews (`gh pr view --json reviews`). A verdict counts only
# when its HEADLINE (first non-empty line of the body) LEADS with it:
# after stripping leading markdown markers (e.g. `## `, `**`) and an
# optional `SPEC-GATE` / `Verdict:` prefix, the headline must START
# with the verdict word — PASS or APPROVE counts as APPROVE, FAIL or
# CHANGES_REQUESTED (or `CHANGES REQUESTED` with a space) counts as
# CHANGES_REQUESTED — or when a formal review carries the APPROVED /
# CHANGES_REQUESTED state itself — AND the body quotes the exact head
# SHA (full or short form): verdicts on older heads are stale and do
# not count. Verdict words mentioned elsewhere — including later in
# the headline itself (e.g. an APPROVE headline recalling an earlier
# FAIL round or citing a `fail-closed` proof) — are ignored. Any
# CHANGES_REQUESTED verdict quoting the exact head refuses the merge
# — the blocking finding wins, even alongside an APPROVE. Fail closed:
# an unreadable head, comment list, or review list refuses too.
check_review_gate() {
  local num="$1" verdicts_out review_scan approve_count changes_count
  if [[ -z "${head_oid:-}" ]]; then
    refuse "cannot determine the head SHA of PR #${num}"
  fi
  verdicts_out="$(gh pr view "${num}" -R "${REPO}" --json comments,reviews 2>&1 || true)"
  if ! review_scan="$(printf '%s' "${verdicts_out}" | jq -e --arg head "${head_oid}" '([(.comments // [])[] | {body: (.body // ""), state: "COMMENT"}] + [(.reviews // [])[] | {body: (.body // ""), state: (.state // "")}]) as $verdicts | def refs_head: ascii_downcase | [scan("[0-9a-f]{7,40}")] | map(. as $tok | select($head | startswith($tok))) | length > 0; def headline: split("\n") | map(select(test("\\S"))) | .[0] // ""; def verdict_headline: headline | ascii_downcase | sub("^[\\s#>*+\\-`\"(\\[]+"; "") | sub("^spec[-\\s]?gate\\s*:?\\s*"; "") | sub("^verdict\\s*:?\\s*"; "") | sub("^[\\s#>*+\\-`\"(\\[]+"; ""); def is_approve: test("^(pass|approve)\\b"); def is_changes: test("^fail\\b") or test("^changes(_requested|\\s+requested)\\b"); {approve: ([$verdicts[] | .body as $b | select(($b | refs_head) and ((($b | verdict_headline) | is_approve) or .state == "APPROVED"))] | length), changes: ([$verdicts[] | .body as $b | select(($b | refs_head) and ((($b | verdict_headline) | is_changes) or .state == "CHANGES_REQUESTED"))] | length)}' 2>/dev/null)"; then
    refuse "cannot determine review status for PR #${num}: $(printf '%s' "${verdicts_out}" | head -n 1)"
  fi
  approve_count="$(printf '%s' "${review_scan}" | jq -r '.approve')"
  changes_count="$(printf '%s' "${review_scan}" | jq -r '.changes')"
  if [[ "${changes_count}" -gt 0 ]]; then
    refuse "PR #${num} head ${head_oid} carries a reviewer CHANGES_REQUESTED verdict — route the findings to the responsible worker."
  fi
  if [[ "${approve_count}" -eq 0 ]]; then
    refuse "PR #${num} head ${head_oid} has no reviewer APPROVE verdict quoting it (in PR comments or formal reviews; verdicts on older heads are stale)."
  fi
  echo "Review:  APPROVE on head ${head_oid} (${approve_count} verdict(s) across comments and formal reviews; no CHANGES_REQUESTED on head)"
}

# CI gate: `gh pr checks` exits non-zero both when checks fail and when
# no checks exist, so the exit code alone proves nothing. Parse the JSON:
# a JSON array means checks were reported (buckets `pass` and `skipping`
# merge — `skipping`/`SKIPPED` is the path-aware CI marking jobs the
# change cannot affect as not applicable); the "no checks reported"
# message means genuinely no checks (mergeable); anything else
# (fail/failed, pending, cancelled, unknown) blocks the merge.
check_checks_gate() {
  local num="$1" checks_out check_count bad_checks
  checks_out="$(gh pr checks "${num}" -R "${REPO}" --json bucket,name,state 2>&1 || true)"
  if printf '%s' "${checks_out}" | jq -e 'type == "array"' >/dev/null 2>&1; then
    check_count="$(printf '%s' "${checks_out}" | jq 'length')"
    bad_checks="$(printf '%s' "${checks_out}" | jq -r '[.[] | select(.bucket != "pass" and .bucket != "skipping") | "\(.name) (\(.bucket)/\(.state))"] | join(", ")')"
    echo "Checks:"
    printf '%s' "${checks_out}" | jq -r '.[] | "  \(.name): \(.bucket)/\(.state)"'
    if [[ "${check_count}" -eq 0 ]]; then
      echo "(no checks reported)"
    elif [[ -n "${bad_checks}" ]]; then
      refuse "PR #${num} has non-successful checks: ${bad_checks}"
    fi
  elif printf '%s' "${checks_out}" | grep -qi "no checks reported"; then
    echo "Checks: none reported (no CI configured)"
  else
    refuse "cannot determine check status for PR #${num}: $(printf '%s' "${checks_out}" | head -n 1)"
  fi
}

# Full gate sweep for one PR (requested PR or a lower stack member).
gate_pr() {
  local num="$1"
  load_pr "${num}"
  if [[ "${pr_state}" != "OPEN" ]]; then
    refuse "PR #${num} is not OPEN (state: ${pr_state})"
  fi
  check_risk_gate "${num}"
  print_pr_header "${num}"
  check_review_gate "${num}"
  check_checks_gate "${num}"
}

# --- Stack detection and the per-member sweep ---------------------------

# Print the PR's REST `.stack` object (compact JSON), or nothing when the
# PR is not a native stack member. Returns non-zero when the resource
# cannot be read or parsed: callers refuse (fail closed), because an
# unreadable PR might be a stack member whose one async request would
# land several PRs.
read_stack() {
  local num="$1" out
  if ! out="$(gh api -H "Accept: application/vnd.github+json" "repos/${REPO}/pulls/${num}" 2>&1)"; then
    return 1
  fi
  if ! printf '%s' "${out}" | jq -e 'type == "object"' >/dev/null 2>&1; then
    return 1
  fi
  printf '%s' "${out}" | jq -c 'if (.stack | type) == "object" then .stack else empty end'
}

stack_member_number() {
  printf '%s' "$1" | jq -r '.number // empty' 2>/dev/null || true
}

stack_member_position() {
  printf '%s' "$1" | jq -r '.position // empty' 2>/dev/null || true
}

stack_member_size() {
  printf '%s' "$1" | jq -r '.size // empty' 2>/dev/null || true
}

# Branch-deletion guard (read-only): never delete a head branch another
# open PR still targets as a base, and never delete a non-deletable head
# (missing, the default branch, or equal to the base).
compute_keep_branch() {
  keep_branch=0
  keep_reason=""
  if [[ -z "${head_branch}" || "${head_branch}" == "${DEFAULT_BRANCH}" || "${head_branch}" == "${base_branch}" ]]; then
    keep_branch=1
    keep_reason="not a deletable head branch"
    return 0
  fi
  local open_bases=""
  if ! open_bases="$(gh pr list -R "${REPO}" --state open --json baseRefName,number -q '.[].baseRefName' 2>/dev/null)"; then
    keep_branch=1
    keep_reason="cannot list open PRs"
  elif printf '%s' "${open_bases}" | grep -qxF -- "${head_branch}"; then
    keep_branch=1
    keep_reason="another open PR still targets it as a base"
  fi
}

# Async branch cleanup: the async merge API never deletes branches, so
# deletion is a separate step that re-checks open-PR bases after the
# merge. A failed deletion is reported without failing a successful
# merge.
delete_merged_head_branch() {
  local branch="$1" fresh
  if ! fresh="$(gh pr list -R "${REPO}" --state open --json baseRefName --limit 100 2>/dev/null)"; then
    echo "warning: could not re-check open PR bases after the merge; kept branch ${branch} (not deleted)." >&2
    return 0
  fi
  if printf '%s' "${fresh}" | jq -r '.[].baseRefName' 2>/dev/null | grep -qxF -- "${branch}"; then
    echo "Kept branch ${branch}: another open PR still targets it as a base."
    return 0
  fi
  if gh api --method DELETE "repos/${REPO}/git/refs/heads/${branch}" >/dev/null 2>&1; then
    echo "Deleted branch ${branch}."
  else
    echo "warning: PR merged, but branch cleanup failed for ${branch}; delete it manually if it still exists." >&2
  fi
  return 0
}

# Poll the async merge request to a terminal status. Prints the outcome
# and returns 0 for `merged`, 2 for `enqueued`, and 1 for `failed` or an
# unproven (still pending / unreadable) result.
poll_async_merge() {
  local num="$1" request_uuid="$2" attempt status out last_status=""
  for ((attempt = 1; attempt <= POLL_ATTEMPTS; attempt++)); do
    if out="$(gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: ${API_VERSION}" "repos/${REPO}/pulls/${num}/merge-async/${request_uuid}" 2>&1)"; then
      status="$(printf '%s' "${out}" | jq -r '.status // empty' 2>/dev/null || true)"
    else
      status=""
    fi
    case "${status}" in
      merged) echo "merged"; return 0 ;;
      enqueued) echo "enqueued"; return 2 ;;
      failed) echo "failed"; return 1 ;;
      pending) last_status="pending" ;;
      *) last_status="unreadable" ;;
    esac
    if [[ "${attempt}" -lt "${POLL_ATTEMPTS}" ]]; then
      sleep "${POLL_INTERVAL}"
    fi
  done
  echo "${last_status:-pending}"
  return 1
}

gate_pr "${pr}"
compute_keep_branch

# --- Stack detection ----------------------------------------------------

if ! stack_json="$(read_stack "${pr}")"; then
  refuse "cannot read the stack membership of PR #${pr} (fail closed)"
fi

if [[ -n "${stack_json}" ]]; then
  # --- Native stack: per-member gate sweep, then one atomic async request
  stack_number="$(stack_member_number "${stack_json}")"
  stack_position="$(stack_member_position "${stack_json}")"
  stack_size="$(stack_member_size "${stack_json}")"
  if [[ ! "${stack_number}" =~ ^[0-9]+$ || ! "${stack_position}" =~ ^[0-9]+$ || ! "${stack_size}" =~ ^[0-9]+$ ]]; then
    refuse "cannot read the stack membership of PR #${pr} (fail closed)"
  fi
  if [[ "${stack_position}" -lt 1 || "${stack_position}" -gt "${stack_size}" ]]; then
    refuse "PR #${pr} reports an impossible stack position (${stack_position} of ${stack_size}) — refusing, not repairing"
  fi

  if ! open_prs="$(gh pr list -R "${REPO}" --state open --json number,headRefName,baseRefName --limit 100 2>/dev/null)"; then
    refuse "cannot list open PRs while resolving stack #${stack_number} (fail closed)"
  fi

  # Walk the base chain down from the requested PR to the default branch.
  # Each step is one stack member: an OPEN ancestor is gated below, while
  # an ancestor already MERGED by an earlier stack merge is skipped (it is
  # not open, so the request cannot land it again). The chain must reach
  # the default branch with exactly `position` members, be free of loops,
  # and agree with every readable `.stack` position; a broken or
  # non-linear stack is refused, never repaired.
  stack_prs=("${pr}")
  visited=" ${pr} "
  expected_position="${stack_position}"
  current_base="${base_branch}"
  while [[ "${current_base}" != "${DEFAULT_BRANCH}" ]]; do
    if [[ "${expected_position}" -le 1 ]]; then
      refuse "stack #${stack_number}: PR #${pr} reports position ${stack_position} but the branch chain is longer — non-linear stack; refusing, not repairing"
    fi
    next_position=$((expected_position - 1))
    open_parent="$(printf '%s' "${open_prs}" | jq -r --arg b "${current_base}" '[.[] | select(.headRefName == $b)][0].number // empty')"
    if [[ -n "${open_parent}" ]]; then
      parent="${open_parent}"
      parent_base="$(printf '%s' "${open_prs}" | jq -r --arg n "${parent}" '.[] | select((.number | tostring) == $n) | .baseRefName' | head -n 1)"
      if ! parent_stack="$(read_stack "${parent}")"; then
        refuse "cannot read the stack membership of PR #${parent} (fail closed)"
      fi
      if [[ -z "${parent_stack}" ]]; then
        refuse "PR #${parent} is linked by branch but is not a native stack member — stack #${stack_number} is non-linear; refusing, not repairing"
      fi
      parent_number="$(stack_member_number "${parent_stack}")"
      parent_position="$(stack_member_position "${parent_stack}")"
      parent_size="$(stack_member_size "${parent_stack}")"
      if [[ "${parent_number}" != "${stack_number}" || "${parent_size}" != "${stack_size}" || "${parent_position}" != "${next_position}" ]]; then
        refuse "PR #${parent} does not sit at position ${next_position} of stack #${stack_number} (reports #${parent_number} position ${parent_position:-unknown} of ${parent_size:-unknown}) — non-linear stack; refusing, not repairing"
      fi
      stack_prs=("${parent}" "${stack_prs[@]}")
    else
      # The ancestor is not open: it may be a member already merged by an
      # earlier stack merge — then the chain continues through it. Any
      # other state (closed unmerged, missing) is a broken chain.
      if ! all_parent_out="$(gh pr list -R "${REPO}" --state all --head "${current_base}" --json number,state,headRefName,baseRefName --limit 10 2>&1)"; then
        refuse "cannot resolve the stack #${stack_number} member with head branch '${current_base}' (fail closed)"
      fi
      parent="$(printf '%s' "${all_parent_out}" | jq -r --arg b "${current_base}" '[.[] | select(.headRefName == $b)][0].number // empty')"
      if [[ -z "${parent}" ]]; then
        refuse "stack #${stack_number} is not linear: no open PR (or merged stack member) has head branch '${current_base}' as its base — refusing, not repairing"
      fi
      parent_state="$(printf '%s' "${all_parent_out}" | jq -r --arg b "${current_base}" '[.[] | select(.headRefName == $b)][0].state // empty')"
      if [[ "${parent_state}" != "MERGED" ]]; then
        refuse "stack #${stack_number} chain reaches PR #${parent} in state ${parent_state:-unknown}; only an already-merged lower member may be skipped — refusing, not repairing"
      fi
      parent_base="$(printf '%s' "${all_parent_out}" | jq -r --arg b "${current_base}" '[.[] | select(.headRefName == $b)][0].baseRefName // empty')"
      echo "--- stack #${stack_number}: skipping already-merged lower member PR #${parent} (not open; not re-gated) ---"
    fi
    if [[ "${visited}" == *" ${parent} "* ]]; then
      refuse "stack #${stack_number} chain loops back to PR #${parent} — refusing, not repairing"
    fi
    visited="${visited}${parent} "
    if [[ -z "${parent_base}" || "${parent_base}" == "null" ]]; then
      refuse "cannot read the base branch of stack member PR #${parent} (fail closed)"
    fi
    current_base="${parent_base}"
    expected_position="${next_position}"
  done
  if [[ "${expected_position}" -ne 1 ]]; then
    refuse "stack #${stack_number} reports position ${stack_position} but the branch chain reaches ${DEFAULT_BRANCH} at position ${expected_position} — non-linear stack; refusing, not repairing"
  fi

  # Per-member gate sweep: one async request merges every member at or
  # below the requested position, so each of them must carry the full
  # gate set individually before any request is submitted.
  for member in "${stack_prs[@]}"; do
    if [[ "${member}" == "${pr}" ]]; then
      continue
    fi
    echo "--- stack #${stack_number}: gating member PR #${member} ---"
    gate_pr "${member}"
  done
  stack_members_display="$(printf '#%s ' "${stack_prs[@]}")"
  stack_members_display="${stack_members_display% }"
  echo "--- stack #${stack_number}: every open member at or below position ${stack_position} passed its gates (${stack_members_display}) ---"

  # The request is pinned to the exact head SHA this run observed.
  async_api_path="repos/${REPO}/pulls/${pr}/merge-async"
  async_body="$(jq -nc --arg sha "${head_oid}" '{sha:$sha,merge_method:"squash"}')"

  if [[ "${dry_run}" -eq 1 ]]; then
    echo "--- dry-run: stack #${stack_number} member #${pr} at position ${stack_position}/${stack_size}: one atomic async request lands every open member at or below that position (${stack_members_display}) ---"
    echo "--- dry-run: would issue: PUT /${async_api_path} (merge_method=squash, sha=${head_oid}) (not merged) ---"
    echo "--- dry-run: request body: ${async_body} ---"
    echo "--- dry-run: would run: gh api --method PUT -H 'X-GitHub-Api-Version: ${API_VERSION}' ${async_api_path} --input '${async_body}' ---"
    if [[ "${keep_branch}" -eq 1 ]]; then
      echo "--- dry-run: would keep branch ${head_branch:-unknown} (${keep_reason}; not deleted) ---"
    else
      echo "--- dry-run: would delete branch ${head_branch} after a terminal merged result, only if no open PR still targets it ---"
    fi
    echo "--- dry-run: would poll GET /${async_api_path}/<uuid> to a terminal status ---"
    exit 0
  fi

  # Submit exactly one request. A 409 means a request already exists and
  # returns its uuid: reuse it instead of issuing a second request.
  http_out="$(gh api --method PUT --include \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: ${API_VERSION}" \
    --input - "${async_api_path}" <<<"${async_body}" 2>&1)" || true
  http_code="$(printf '%s\n' "${http_out}" | grep -m1 -oE 'HTTP/[0-9.]+ [0-9]{3}' | awk '{print $2}')"
  if [[ -z "${http_code}" ]]; then
    http_code="$(printf '%s\n' "${http_out}" | grep -m1 -oE '\(HTTP [0-9]{3}\)' | grep -oE '[0-9]{3}')"
  fi
  response_body="$(printf '%s\n' "${http_out}" | sed -e '1,/^[[:space:]]*$/d')"
  if [[ -z "${response_body}" ]]; then
    # No header block (a bare body, e.g. from a non-`gh` transport):
    # parse the whole payload instead of discarding it.
    response_body="${http_out}"
  fi
  request_uuid=""
  if [[ -n "${response_body}" ]]; then
    request_uuid="$(printf '%s' "${response_body}" | jq -r '.uuid // empty' 2>/dev/null || true)"
  fi
  if [[ -z "${request_uuid}" ]]; then
    request_uuid="$(printf '%s\n' "${http_out}" | grep -oE '"uuid"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n 1 | sed -E 's/.*"([^"]+)"$/\1/')"
  fi

  case "${http_code}" in
    200|202|409)
      ;;
    *)
      echo "error: async merge request for stack #${stack_number} failed (HTTP ${http_code:-unknown}): $(printf '%s' "${response_body:-${http_out}}" | head -n 1)" >&2
      exit 1
      ;;
  esac
  if [[ -z "${request_uuid}" ]]; then
    echo "error: async merge request for stack #${stack_number} returned HTTP ${http_code} without a request uuid; cannot verify the result (fail closed)." >&2
    exit 1
  fi
  if [[ "${http_code}" == "409" ]]; then
    echo "Merge request already exists for stack #${stack_number}; reusing uuid ${request_uuid} (no second request)."
  else
    echo "Async merge request accepted for stack #${stack_number} (HTTP ${http_code}, uuid ${request_uuid}); polling to a terminal status."
  fi

  poll_rc=0
  if poll_result="$(poll_async_merge "${pr}" "${request_uuid}")"; then
    poll_rc=0
  else
    poll_rc=$?
  fi

  if [[ "${poll_rc}" -eq 0 ]]; then
    echo "Merged stack #${stack_number} up to position ${stack_position} (squash, atomic async request uuid ${request_uuid})."
    for member in "${stack_prs[@]}"; do
      member_state="$(gh pr view "${member}" -R "${REPO}" --json state -q '.state' 2>/dev/null || true)"
      echo "  #${member}: ${member_state:-unknown}"
      if [[ "${member_state}" != "MERGED" ]]; then
        echo "warning: PR #${member} does not read back as MERGED after a terminal 'merged' result; check stack #${stack_number} manually." >&2
      fi
    done
    if [[ "${keep_branch}" -eq 1 ]]; then
      echo "Kept branch ${head_branch:-unknown}: ${keep_reason}."
    else
      delete_merged_head_branch "${head_branch}"
    fi
    exit 0
  fi

  if [[ "${poll_result}" == "enqueued" ]]; then
    echo "Async merge request uuid ${request_uuid} is enqueued (merge queued, not yet landed); branch ${head_branch:-unknown} was not deleted."
    exit 0
  fi
  if [[ "${poll_result}" == "failed" ]]; then
    echo "error: async merge request uuid ${request_uuid} for stack #${stack_number} failed; no PR was reported as merged." >&2
    exit 1
  fi
  echo "error: async merge request uuid ${request_uuid} for stack #${stack_number} is still ${poll_result:-pending} after polling; not reported as merged — re-check the stack before retrying." >&2
  exit 1
fi

# --- Unstacked PR: unchanged synchronous path ---------------------------

merge_cmd=(gh pr merge "${pr}" --squash)
if [[ "${keep_branch}" -eq 0 ]]; then
  merge_cmd+=(--delete-branch)
fi

if [[ "${dry_run}" -eq 1 ]]; then
  echo "--- dry-run: would run: ${merge_cmd[*]} (not merged) ---"
  if [[ "${keep_branch}" -eq 1 ]]; then
    echo "--- dry-run: would keep branch ${head_branch:-unknown} (${keep_reason}; not deleted) ---"
  fi
  exit 0
fi

# The sanctioned merge: the only merge path. Direct `gh pr merge` stays
# denied for every session; this wrapper invokes it as a child process,
# which permission evaluation does not see. Squash-only, so `--merge`
# (merge commit) and `--rebase` are unreachable.
merge_failed=0
"${merge_cmd[@]}" || merge_failed=1
if [[ "${merge_failed}" -ne 0 ]]; then
  # Fail-safe: if the PR is MERGED anyway (e.g. the merge succeeded but
  # branch deletion failed), a successful merge never exits non-zero.
  if [[ "$(gh pr view "${pr}" -R "${REPO}" --json state -q '.state' 2>/dev/null)" == "MERGED" ]]; then
    echo "warning: PR #${pr} is MERGED but branch cleanup may have failed; delete ${head_branch} manually if it still exists." >&2
  else
    echo "error: merge failed for PR #${pr}." >&2
    exit 1
  fi
elif [[ "${keep_branch}" -eq 1 ]]; then
  echo "Kept branch ${head_branch:-unknown}: ${keep_reason}."
else
  echo "Merged PR #${pr} (squash) and deleted branch ${head_branch}."
fi
exit 0
