#!/usr/bin/env bash
# merge-readiness.sh: read-only merge-readiness preflight for the
# orchestrator's owner-facing "ready to merge" reports (issue #746).
#
# Usage: script/merge-readiness.sh <pr-number> [<pr-number>...]
#
# Prints one plain-text block per PR (no ANSI colour, no prompts, so the
# output is pasteable straight into an owner report) with:
#   - state, headRefOid, base branch,
#   - mergeable + mergeStateStatus (GitHub's conflict state),
#   - the risk label(s),
#   - whether an APPROVE (or SPEC-GATE PASS) verdict quotes the CURRENT
#     head SHA (verdicts on older heads are reported as stale),
#   - the CI worst conclusion,
#   - a stack-order hint: native `.stack` position/size when the PR is a
#     stack member, otherwise the branch-chain position, plus the order
#     the stack must be merged in (bottom first).
# The final lines summarise every head SHA the run actually read, so a
# report can name them.
#
# Exit status:
#   0  every listed PR is clean (mergeable is neither CONFLICTING nor
#      DIRTY) AND carries an APPROVE / SPEC-GATE PASS verdict quoting
#      its current head.
#   1  any listed PR is CONFLICTING or DIRTY, or lacks a head-quoting
#      APPROVE verdict, or cannot be read (fail closed: an unreadable PR
#      cannot be reported as ready).
#
# CI is reported, never gated: issue #746 fixes the exit conditions at
# conflict state + head-quoting verdict, so failing CI still exits 0
# here. The merge gate refuses such a PR, and the block says so.
#
# Read-only by contract (issue #746 acceptance criterion 5): this script
# never pushes, merges, comments, labels, or changes a branch. It only
# reads PR metadata, verdicts, checks, and the stack resource.
#
# Mirrored gate rules (issue #746): the merge gate in
# script/orchestrator-merge.sh is the authority. Three rules are copied
# from it verbatim instead of being re-derived, so the preflight and the
# gate cannot disagree:
#   - the leading-verdict-token classifier and the head-quoting rule
#     (`check_review_gate`: the `def refs_head: ... def is_changes: ...`
#     clause, reading BOTH PR comments and formal reviews),
#   - the green check predicate (`check_checks_gate`:
#     `select(.bucket != "pass" and .bucket != "skipping")`),
#   - the one-risk-label rule (`check_risk_gate`), reported here rather
#     than gated (the owner's exit conditions do not include it).
# script/merge-readiness.test.sh pins the copied classifier/predicate
# text against script/orchestrator-merge.sh, so a change to the gate
# without the matching change here fails the test.
set -euo pipefail

REPO="MingChen1501/hotel-mgmt"
DEFAULT_BRANCH="master"
API_VERSION="2026-03-10"
MAX_CHAIN=20

usage() {
  echo "Usage: $0 <pr-number> [<pr-number>...]" >&2
}

pr_numbers=()
for arg in "$@"; do
  case "${arg}" in
    -h|--help) usage; exit 0 ;;
    -*) echo "error: unknown argument: ${arg}" >&2; usage; exit 1 ;;
    *)
      [[ "${arg}" =~ ^[0-9]+$ ]] || { echo "error: PR number must be numeric, got '${arg}'" >&2; exit 1; }
      pr_numbers+=("${arg}")
      ;;
  esac
done
if [[ "${#pr_numbers[@]}" -eq 0 ]]; then
  echo "error: at least one PR number is required" >&2
  usage
  exit 1
fi

# --- Per-PR state (populated by load_pr / the scan helpers) -------------
pr_json=""
pr_number=""
pr_state=""
pr_url=""
pr_title=""
risk_labels=""
risk_count=""
head_branch=""
head_oid=""
base_branch=""
mergeable="UNKNOWN"
merge_state="UNKNOWN"
approve_count="0"
changes_count="0"
stale_approve=""
ci_worst=""
ci_counts=""
stack_hint=""

load_pr() {
  local num="$1" out
  out="$(gh pr view "${num}" -R "${REPO}" --json number,state,url,title,labels,headRefName,headRefOid,baseRefName,mergeable,mergeStateStatus,comments,reviews 2>&1)" || {
    echo "error: cannot read PR #${num}, so readiness cannot be verified (fail closed): $(printf '%s' "${out}" | head -n 1)" >&2
    return 1
  }
  if ! printf '%s' "${out}" | jq -e 'type == "object"' >/dev/null 2>&1; then
    echo "error: cannot parse the metadata of PR #${num} (fail closed)" >&2
    return 1
  fi
  pr_json="${out}"
  pr_number="$(printf '%s' "${pr_json}" | jq -r '.number // empty')"
  pr_state="$(printf '%s' "${pr_json}" | jq -r '.state // empty')"
  pr_url="$(printf '%s' "${pr_json}" | jq -r '.url // empty')"
  pr_title="$(printf '%s' "${pr_json}" | jq -r '.title // empty')"
  risk_labels="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name | select(startswith("risk-"))] | join(", ")')"
  risk_count="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name | select(startswith("risk-"))] | length')"
  head_branch="$(printf '%s' "${pr_json}" | jq -r '.headRefName // empty')"
  head_oid="$(printf '%s' "${pr_json}" | jq -r '.headRefOid // empty')"
  base_branch="$(printf '%s' "${pr_json}" | jq -r '.baseRefName // empty')"
  mergeable="$(printf '%s' "${pr_json}" | jq -r '.mergeable // "UNKNOWN"')"
  merge_state="$(printf '%s' "${pr_json}" | jq -r '.mergeStateStatus // "UNKNOWN"')"
  if [[ -z "${pr_number}" || -z "${head_oid}" ]]; then
    echo "error: PR #${num} returned no number/head SHA, so readiness cannot be verified (fail closed)" >&2
    return 1
  fi
}

# Review scan: the leading-verdict-token classifier and the head-quoting
# rule are copied VERBATIM from check_review_gate in
# script/orchestrator-merge.sh; only the extra `approve_stale` output is
# added (reporting). The classifier reads BOTH PR issue comments and
# formal PR reviews, counts only verdicts whose headline (first non-empty
# line) LEADS with PASS/APPROVE (or whose formal state is APPROVED) AND
# whose body quotes the exact head SHA, and treats a headline LEADING
# with FAIL/CHANGES_REQUESTED (or a formal CHANGES_REQUESTED state) as a
# blocking finding.
scan_review() {
  local review_scan
  if ! review_scan="$(printf '%s' "${pr_json}" | jq -e --arg head "${head_oid}" '([(.comments // [])[] | {body: (.body // ""), state: "COMMENT"}] + [(.reviews // [])[] | {body: (.body // ""), state: (.state // "")}]) as $verdicts | def refs_head: ascii_downcase | [scan("[0-9a-f]{7,40}")] | map(. as $tok | select($head | startswith($tok))) | length > 0; def headline: split("\n") | map(select(test("\\S"))) | .[0] // ""; def verdict_headline: headline | ascii_downcase | sub("^[\\s#>*+\\-`\"(\\[]+"; "") | sub("^spec[-\\s]?gate\\s*:?\\s*"; "") | sub("^verdict\\s*:?\\s*"; "") | sub("^[\\s#>*+\\-`\"(\\[]+"; ""); def is_approve: test("^(pass|approve)\\b"); def is_changes: test("^fail\\b") or test("^changes(_requested|\\s+requested)\\b"); def approve_stale: [$verdicts[] | .body as $b | select(((((($b | verdict_headline) | is_approve) or .state == "APPROVED"))) and ((($b | refs_head) | not))) | ($b | headline)]; {approve: ([$verdicts[] | .body as $b | select(($b | refs_head) and ((($b | verdict_headline) | is_approve) or .state == "APPROVED"))] | length), changes: ([$verdicts[] | .body as $b | select(($b | refs_head) and ((($b | verdict_headline) | is_changes) or .state == "CHANGES_REQUESTED"))] | length), stale_approve: approve_stale}' 2>/dev/null)"; then
    echo "error: cannot determine the review status of PR #${pr_number} (fail closed)" >&2
    return 1
  fi
  approve_count="$(printf '%s' "${review_scan}" | jq -r '.approve')"
  changes_count="$(printf '%s' "${review_scan}" | jq -r '.changes')"
  stale_approve="$(printf '%s' "${review_scan}" | jq -r '.stale_approve | join(" | ")')"
}

# CI scan: reported, never gated. The green predicate is copied VERBATIM
# from check_checks_gate in script/orchestrator-merge.sh: `pass` and
# `skipping`/`SKIPPED` count as green (path-aware CI marks jobs the
# change cannot affect as not applicable).
scan_checks() {
  local checks_out check_total bad_checks pass_count skip_count
  checks_out="$(gh pr checks "${pr_number}" -R "${REPO}" --json bucket,name,state 2>&1 || true)"
  if printf '%s' "${checks_out}" | jq -e 'type == "array"' >/dev/null 2>&1; then
    check_total="$(printf '%s' "${checks_out}" | jq 'length')"
    pass_count="$(printf '%s' "${checks_out}" | jq '[.[] | select(.bucket == "pass")] | length')"
    skip_count="$(printf '%s' "${checks_out}" | jq '[.[] | select(.bucket == "skipping")] | length')"
    bad_checks="$(printf '%s' "${checks_out}" | jq -r '[.[] | select(.bucket != "pass" and .bucket != "skipping") | "\(.name) (\(.bucket)/\(.state))"] | join(", ")')"
    ci_counts="${check_total} check(s): ${pass_count} pass, ${skip_count} skipping, $((check_total - pass_count - skip_count)) other"
    if [[ "${check_total}" -eq 0 ]]; then
      ci_worst="none reported"
    elif [[ -z "${bad_checks}" ]]; then
      ci_worst="green (pass/skipping)"
    elif [[ "$(printf '%s' "${checks_out}" | jq -r 'any(.[]; .bucket == "fail" or .bucket == "failed")')" == "true" ]]; then
      ci_worst="fail (${bad_checks})"
    elif [[ "$(printf '%s' "${checks_out}" | jq -r 'any(.[]; .bucket == "cancelled")')" == "true" ]]; then
      ci_worst="cancelled (${bad_checks})"
    elif [[ "$(printf '%s' "${checks_out}" | jq -r 'any(.[]; .bucket == "pending")')" == "true" ]]; then
      ci_worst="pending (${bad_checks})"
    else
      ci_worst="unknown bucket (${bad_checks})"
    fi
  elif printf '%s' "${checks_out}" | grep -qi "no checks reported"; then
    ci_worst="none reported (no CI configured)"
    ci_counts="0 checks"
  else
    ci_worst="unreadable: $(printf '%s' "${checks_out}" | head -n 1)"
    ci_counts="check status unreadable"
  fi
}

# Print the PR's REST `.stack` object (compact JSON), or nothing when the
# PR is not a native stack member. Returns non-zero when the resource
# cannot be read or parsed; the caller reports it rather than failing
# (stack order is a hint, not one of the #746 exit conditions).
read_stack() {
  local num="$1" out
  if ! out="$(gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: ${API_VERSION}" "repos/${REPO}/pulls/${num}" 2>&1)"; then
    return 1
  fi
  if ! printf '%s' "${out}" | jq -e 'type == "object"' >/dev/null 2>&1; then
    return 1
  fi
  printf '%s' "${out}" | jq -c 'if (.stack | type) == "object" then .stack else empty end'
}

# Print the native stack resource (`GET /repos/{owner}/{repo}/stacks/<n>`)
# as compact JSON. It lists members in position order, which is the order
# they must be merged in.
read_stack_resource() {
  local number="$1" out
  if ! out="$(gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: ${API_VERSION}" "repos/${REPO}/stacks/${number}" 2>&1)"; then
    return 1
  fi
  if ! printf '%s' "${out}" | jq -e 'type == "object" and (.pull_requests | type) == "array"' >/dev/null 2>&1; then
    return 1
  fi
  printf '%s' "${out}" | jq -c '.'
}

join_order() {
  local out="" item
  for item in "$@"; do
    out="${out:+${out} -> }${item}"
  done
  printf '%s' "${out}"
}

# Stack-order hint: native `.stack` position/size plus the merge order
# from the stack resource, otherwise the branch-chain position plus the
# chain order (bottom first). Read-only and never gating.
compute_stack_hint() {
  local stack_json="" number="" position="" size="" resource="" order=""
  local open_prs="" cur_base="" parent="" guard=0 chain=("#${pr_number}") note=""

  if ! stack_json="$(read_stack "${pr_number}")"; then
    stack_hint="unreadable stack membership (cannot tell whether this PR is a native stack member); merge order unknown"
    return 0
  fi

  if [[ -n "${stack_json}" ]]; then
    number="$(printf '%s' "${stack_json}" | jq -r '.number // empty')"
    position="$(printf '%s' "${stack_json}" | jq -r '.position // empty')"
    size="$(printf '%s' "${stack_json}" | jq -r '.size // empty')"
    if resource="$(read_stack_resource "${number}")"; then
      order="$(printf '%s' "${resource}" | jq -r '[.pull_requests[].number | "#" + tostring] | join(" -> ")')"
    fi
    stack_hint="native stack #${number}: position ${position:-?} of ${size:-?}"
    if [[ -n "${order}" ]]; then
      stack_hint="${stack_hint}; merge order (bottom first): ${order}"
    else
      stack_hint="${stack_hint}; merge order (bottom first): positions 1..${size:-?} (member list unreadable)"
    fi
    if [[ "${position}" =~ ^[0-9]+$ && "${position}" -eq 1 ]]; then
      stack_hint="${stack_hint}; this PR is the bottom member"
    fi
    stack_hint="${stack_hint}; refresh the bottom member against ${DEFAULT_BRANCH}, re-verify the stack, only then ask the owner to merge"
    return 0
  fi

  open_prs="$(gh pr list -R "${REPO}" --state open --json number,headRefName,baseRefName --limit 100 2>/dev/null || true)"
  if ! printf '%s' "${open_prs}" | jq -e 'type == "array"' >/dev/null 2>&1; then
    stack_hint="not a native .stack member; branch-chain position unknown (cannot list open PRs)"
    return 0
  fi
  cur_base="${base_branch}"
  while [[ "${cur_base}" != "${DEFAULT_BRANCH}" ]]; do
    guard=$((guard + 1))
    if [[ "${guard}" -gt "${MAX_CHAIN}" ]]; then
      note=" (chain walk stopped after ${MAX_CHAIN} links: possible loop)"
      break
    fi
    parent="$(printf '%s' "${open_prs}" | jq -r --arg b "${cur_base}" '[.[] | select(.headRefName == $b)][0].number // empty')"
    if [[ -z "${parent}" ]]; then
      note=" (base '${cur_base}' has no open PR: chain position unverified)"
      break
    fi
    chain=("#${parent}" "${chain[@]}")
    cur_base="$(printf '%s' "${open_prs}" | jq -r --arg n "${parent}" '.[] | select((.number | tostring) == $n) | .baseRefName' | head -n 1)"
    if [[ -z "${cur_base}" ]]; then
      note=" (cannot read the base branch of PR #${parent})"
      break
    fi
  done

  local position_count="${#chain[@]}"
  if [[ "${position_count}" -eq 1 ]]; then
    stack_hint="not a native .stack member; base ${base_branch} — not stacked${note}; merge order: only #${pr_number}"
  else
    stack_hint="not a native .stack member; branch-chain position ${position_count}; merge order (bottom first): $(join_order "${chain[@]}")${note}"
    stack_hint="${stack_hint}; refresh the bottom member (#${chain[0]#\#}) against ${DEFAULT_BRANCH}, re-verify the stack, only then ask the owner to merge"
  fi
}

# --- One PR block plus its readiness verdict ---------------------------
failures=()
heads_checked=()

check_pr() {
  local num="$1"
  local conflict_note="clean"
  local head_approved="no"
  local changes_note="no"
  local risk_note=""
  local reasons=()

  if ! load_pr "${num}"; then
    failures+=("#${num}: metadata unreadable (fail closed)")
    return 0
  fi

  case "${mergeable}" in
    CONFLICTING) conflict_note="CONFLICTING"; reasons+=("mergeable CONFLICTING") ;;
  esac
  case "${merge_state}" in
    DIRTY) conflict_note="${conflict_note} mergeStateStatus DIRTY"; reasons+=("mergeStateStatus DIRTY") ;;
  esac

  if ! scan_review; then
    failures+=("#${num}: verdict state unreadable (fail closed)")
    return 0
  fi
  if [[ "${approve_count}" -gt 0 ]]; then
    head_approved="yes"
  else
    reasons+=("no head-quoting APPROVE/SPEC-GATE PASS verdict")
  fi
  [[ "${changes_count}" -gt 0 ]] && changes_note="yes (${changes_count}) — the merge gate will refuse"

  scan_checks
  compute_stack_hint

  if [[ "${risk_count}" -eq 1 ]]; then
    risk_note="${risk_labels} (exactly one risk label)"
  else
    risk_note="${risk_labels:-none} (${risk_count} risk label(s); exactly one required — missing/duplicate needs explicit owner approval)"
  fi

  echo "=== PR #${pr_number}: ${pr_title} ==="
  echo "URL:       ${pr_url}"
  echo "State:     ${pr_state}"
  echo "Head:      ${head_oid} (${head_branch})"
  echo "Base:      ${base_branch}"
  echo "Mergeable: ${mergeable} / ${merge_state}"
  echo "Risk:      ${risk_note}"
  if [[ "${risk_labels}" == "risk-high" || "${risk_labels}" == "risk-very-high" ]]; then
    echo "Owner:     ${risk_labels} needs explicit owner approval — the owner merges manually (the merge gate has no override)."
  fi
  if [[ "${head_approved}" == "yes" ]]; then
    echo "Review:    head-quoting verdict: yes (${approve_count} APPROVE/SPEC-GATE PASS verdict(s) quote head ${head_oid})"
  else
    echo "Review:    head-quoting verdict: no (no APPROVE/SPEC-GATE PASS verdict quotes head ${head_oid})"
    if [[ -n "${stale_approve}" ]]; then
      echo "Stale:     verdict(s) on an older head (not head-quoting): ${stale_approve}"
    fi
  fi
  echo "Changes:   CHANGES_REQUESTED on head: ${changes_note}"
  echo "CI:        worst conclusion: ${ci_worst} [${ci_counts}]"
  echo "CI hint:   informational only — the #746 exit conditions are conflict state and a head-quoting verdict, not CI."
  echo "Stack:     ${stack_hint}"
  if [[ "${pr_state}" != "OPEN" ]]; then
    echo "Note:      state is ${pr_state}, not OPEN — the merge gate refuses non-open PRs."
  elif [[ "${mergeable}" == "UNKNOWN" || "${merge_state}" == "UNKNOWN" ]]; then
    echo "Note:      GitHub has not computed the conflict state yet (UNKNOWN) — re-run this preflight before reporting."
  fi
  if [[ "${#reasons[@]}" -eq 0 ]]; then
    echo "Status:    READY"
  else
    echo "Status:    NOT READY ($(printf '%s; ' "${reasons[@]}" | sed 's/; $//'))"
    failures+=("#${num}: $(printf '%s; ' "${reasons[@]}" | sed 's/; $//')")
  fi
  echo

  heads_checked+=("#${pr_number}=${head_oid}")
}

for pr in "${pr_numbers[@]}"; do
  check_pr "${pr}"
done

echo "Checked heads (exact SHAs this run read): $(printf '%s ' "${heads_checked[@]}" | sed 's/ $//')"
if [[ "${#failures[@]}" -gt 0 ]]; then
  echo "Merge readiness: NOT READY — ${#pr_numbers[@]} PR(s) checked, ${#failures[@]} blocking issue(s):"
  printf '  - %s\n' "${failures[@]}"
  exit 1
fi
echo "Merge readiness: READY — ${#pr_numbers[@]} PR(s) clean (not CONFLICTING/DIRTY) and head-approved."
echo "Paste this output into the owner report; re-run the preflight immediately before reporting (a stack drifts as ${DEFAULT_BRANCH} moves)."
exit 0
