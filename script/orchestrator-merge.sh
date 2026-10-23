#!/usr/bin/env bash
# orchestrator-merge.sh: the sanctioned merge path for the orchestrator —
# the only way a PR gets merged. Direct `gh pr merge` is denied for
# every session; this wrapper invokes it as a child process, which
# permission evaluation does not see (same mechanism as the spawn and
# review wrappers).
#
# Usage: script/orchestrator-merge.sh <pr-number> [--dry-run]
#
# Refuses unless all of these hold:
#   - the marker file .ao-orchestrator exists in the current worktree
#     (created only in the orchestrator worktree, never committed), AND
#     this AO session is a live orchestrator session for the project
#     (the marker alone is forgeable; this is a guardrail, not a
#     security boundary — real enforcement is GitHub-side),
#   - the PR is OPEN,
#   - the PR carries exactly one risk label and it is not
#     risk-high/risk-very-high (owner approval gate: the owner merges
#     such PRs manually, this script has no override),
#   - a reviewer APPROVE COMMENT quoting the exact PR head SHA exists
#     on the PR, and no CHANGES_REQUESTED COMMENT quotes that head
#     (review gate: reviewers quote the head they reviewed — see the
#     orchestrator skill "Review flow"; verdicts on older heads are
#     stale and do not count; a head carrying both verdicts is refused
#     — the blocking finding wins),
#   - every reported check is successful or skipped as not applicable (a
#     PR with genuinely no checks merges; fail/failed, pending, and
#     cancelled checks still block the merge; skipping/SKIPPED checks
#     are non-blocking — the path-aware CI marks jobs the change cannot
#     affect as not applicable).
# Then prints the PR state/labels/checks and squash-merges via
# `gh pr merge <n> --squash --delete-branch` as a child process, so gh
# deletes the PR head branch — unless another open PR still targets it
# as a base (stacked-PR guard), in which case it merges without
# `--delete-branch` and keeps the branch.
# --dry-run prints the exact gh command it would run without merging.
set -euo pipefail

REPO="MingChen1501/hotel-mgmt"
PROJECT="hotel-mgmt"
MARKER=".ao-orchestrator"

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

pr_out="$(gh pr view "${pr}" -R "${REPO}" --json number,state,url,title,labels,headRefName,headRefOid,baseRefName 2>&1)" || {
  if printf '%s' "${pr_out}" | grep -qiE "could not resolve|not found|no pull requests|404"; then
    echo "error: PR #${pr} not found in ${REPO}" >&2
  else
    echo "error: cannot load PR #${pr}: $(printf '%s' "${pr_out}" | head -n 1)" >&2
  fi
  exit 1
}
pr_json="${pr_out}"
state="$(printf '%s' "${pr_json}" | jq -r '.state')"
url="$(printf '%s' "${pr_json}" | jq -r '.url')"
title="$(printf '%s' "${pr_json}" | jq -r '.title')"
labels="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name] | join(", ")')"
risk_labels="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name | select(startswith("risk-"))] | join(" ")')"
risk_count="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name | select(startswith("risk-"))] | length')"
head_branch="$(printf '%s' "${pr_json}" | jq -r '.headRefName')"
head_oid="$(printf '%s' "${pr_json}" | jq -r '.headRefOid // empty')"
base_branch="$(printf '%s' "${pr_json}" | jq -r '.baseRefName')"

if [[ "${state}" != "OPEN" ]]; then
  echo "error: refusing to merge: PR #${pr} is not OPEN (state: ${state})" >&2
  exit 1
fi
if [[ "${risk_count}" -ne 1 ]]; then
  echo "error: refusing to merge: PR #${pr} must carry exactly one risk label (found ${risk_count}: ${risk_labels:-none})" >&2
  echo "risk-high, risk-very-high, or a missing label needs explicit owner approval." >&2
  exit 1
fi
if [[ "${risk_labels}" == "risk-high" || "${risk_labels}" == "risk-very-high" ]]; then
  echo "error: refusing to merge: PR #${pr} is labelled ${risk_labels}; explicit owner approval required." >&2
  echo "The owner merges such PRs manually (e.g. gh pr merge --squash --delete-branch) after approving; this script has no override." >&2
  exit 1
fi

echo "PR:      #${pr} ${title}"
echo "URL:     ${url}"
echo "State:   ${state}"
echo "Labels:  ${labels}"
echo "Head:    ${head_oid:-unknown} (${head_branch})"

# Review gate: the exact head must carry a reviewer APPROVE COMMENT.
# A verdict counts only when its comment body names the verdict
# (APPROVE / CHANGES_REQUESTED) and quotes the exact head SHA (full
# or short form): verdicts on older heads are stale and do not count.
# Any CHANGES_REQUESTED quoting the exact head refuses the merge —
# the blocking finding wins, even alongside an APPROVE. Fail closed:
# an unreadable head or comment list refuses too.
if [[ -z "${head_oid:-}" ]]; then
  echo "error: refusing to merge: cannot determine the head SHA of PR #${pr}" >&2
  exit 1
fi
comments_out="$(gh pr view "${pr}" -R "${REPO}" --json comments 2>&1 || true)"
if ! review_scan="$(printf '%s' "${comments_out}" | jq -e --arg head "${head_oid}" '(.comments // []) | map(.body // "") as $bodies | def refs_head: ascii_downcase | [scan("[0-9a-f]{7,40}")] | map(. as $tok | select($head | startswith($tok))) | length > 0; {approve: ([$bodies[] | select(test("(?i)\\bapprove\\b") and refs_head)] | length), changes: ([$bodies[] | select(test("(?i)\\bchanges_requested\\b") and refs_head)] | length)}' 2>/dev/null)"; then
  echo "error: refusing to merge: cannot determine review status for PR #${pr}: $(printf '%s' "${comments_out}" | head -n 1)" >&2
  exit 1
fi
approve_count="$(printf '%s' "${review_scan}" | jq -r '.approve')"
changes_count="$(printf '%s' "${review_scan}" | jq -r '.changes')"
if [[ "${changes_count}" -gt 0 ]]; then
  echo "error: refusing to merge: PR #${pr} head ${head_oid} carries a reviewer CHANGES_REQUESTED verdict — route the findings to the responsible worker." >&2
  exit 1
fi
if [[ "${approve_count}" -eq 0 ]]; then
  echo "error: refusing to merge: PR #${pr} head ${head_oid} has no reviewer APPROVE COMMENT quoting it (verdicts on older heads are stale)." >&2
  exit 1
fi
echo "Review:  APPROVE on head ${head_oid} (${approve_count} verdict comment(s); no CHANGES_REQUESTED on head)"

# CI gate: `gh pr checks` exits non-zero both when checks fail and when
# no checks exist, so the exit code alone proves nothing. Parse the JSON:
# a JSON array means checks were reported (buckets `pass` and `skipping`
# merge — `skipping`/`SKIPPED` is the path-aware CI marking jobs the
# change cannot affect as not applicable); the "no checks reported"
# message means genuinely no checks (mergeable); anything else
# (fail/failed, pending, cancelled, unknown) blocks the merge.
checks_out="$(gh pr checks "${pr}" -R "${REPO}" --json bucket,name,state 2>&1 || true)"
if printf '%s' "${checks_out}" | jq -e 'type == "array"' >/dev/null 2>&1; then
  check_count="$(printf '%s' "${checks_out}" | jq 'length')"
  bad_checks="$(printf '%s' "${checks_out}" | jq -r '[.[] | select(.bucket != "pass" and .bucket != "skipping") | "\(.name) (\(.bucket)/\(.state))"] | join(", ")')"
  echo "Checks:"
  printf '%s' "${checks_out}" | jq -r '.[] | "  \(.name): \(.bucket)/\(.state)"'
  if [[ "${check_count}" -eq 0 ]]; then
    echo "(no checks reported)"
  elif [[ -n "${bad_checks}" ]]; then
    echo "error: refusing to merge: PR #${pr} has non-successful checks: ${bad_checks}" >&2
    exit 1
  fi
elif printf '%s' "${checks_out}" | grep -qi "no checks reported"; then
  echo "Checks: none reported (no CI configured)"
else
  echo "error: refusing to merge: cannot determine check status for PR #${pr}: $(printf '%s' "${checks_out}" | head -n 1)" >&2
  exit 1
fi

# Stacked-PR branch guard (read-only): gh deletes the head branch itself
# via `--delete-branch`, but never delete a branch another open PR still
# targets as a base — merge those without `--delete-branch` and keep it.
# Non-deletable heads (missing, master, or equal to the base) are kept too.
keep_branch=0
keep_reason=""
if [[ -z "${head_branch}" || "${head_branch}" == "master" || "${head_branch}" == "${base_branch}" ]]; then
  keep_branch=1
  keep_reason="not a deletable head branch"
else
  open_bases=""
  if ! open_bases="$(gh pr list -R "${REPO}" --state open --json baseRefName,number -q '.[].baseRefName' 2>/dev/null)"; then
    keep_branch=1
    keep_reason="cannot list open PRs"
  elif printf '%s' "${open_bases}" | grep -qxF "${head_branch}"; then
    keep_branch=1
    keep_reason="another open PR still targets it as a base"
  fi
fi

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
