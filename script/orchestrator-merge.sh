#!/usr/bin/env bash
# orchestrator-merge.sh: the sanctioned merge path for the orchestrator.
#
# Usage: script/orchestrator-merge.sh <pr-number> [--dry-run]
#
# Refuses unless all of these hold:
#   - the marker file .ao-orchestrator exists in the current worktree
#     (created only in the orchestrator worktree, never committed),
#   - the PR is OPEN,
#   - the PR carries exactly one risk label and it is not
#     risk-high/risk-very-high (owner approval gate),
#   - every reported check is successful (a PR with genuinely no checks
#     merges; pending/failed/cancelled checks block the merge).
# Then prints the PR state/labels/checks, squash-merges via `ao pr merge`
# (AO's squash-only merge; `gh pr merge` is denied for every session, so
# no other merge method is reachable), and deletes the PR head branch
# unless another open PR still targets it as a base (stacked-PR guard).
# Branch deletion uses the GitHub API because `git push <remote> :<branch>`
# is denied for every session.
# --dry-run prints what it would do without merging.
set -euo pipefail

REPO="MingChen1501/hotel-mgmt"
MARKER=".ao-orchestrator"

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

if [[ ! -f "${MARKER}" ]]; then
  echo "error: refusing to merge: marker file ${MARKER} not found in $(pwd)" >&2
  echo "Merges run only from the orchestrator worktree holding that marker (never committed)." >&2
  exit 1
fi

pr_out="$(gh pr view "${pr}" -R "${REPO}" --json number,state,url,title,labels,headRefName,baseRefName 2>&1)" || {
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
  echo "error: refusing to merge: PR #${pr} is labelled ${risk_labels}; owner approval required." >&2
  exit 1
fi

echo "PR:      #${pr} ${title}"
echo "URL:     ${url}"
echo "State:   ${state}"
echo "Labels:  ${labels}"

# CI gate: `gh pr checks` exits non-zero both when checks fail and when
# no checks exist, so the exit code alone proves nothing. Parse the JSON:
# a JSON array means checks were reported (every entry must be `pass`);
# the "no checks reported" message means genuinely no checks (mergeable);
# anything else is an unknown state and blocks the merge.
checks_out="$(gh pr checks "${pr}" -R "${REPO}" --json bucket,name,state 2>&1 || true)"
if printf '%s' "${checks_out}" | jq -e 'type == "array"' >/dev/null 2>&1; then
  check_count="$(printf '%s' "${checks_out}" | jq 'length')"
  bad_checks="$(printf '%s' "${checks_out}" | jq -r '[.[] | select(.bucket != "pass") | "\(.name) (\(.bucket)/\(.state))"] | join(", ")')"
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

if [[ "${dry_run}" -eq 1 ]]; then
  echo "--- dry-run: would run: ao pr merge ${pr} (not merged) ---"
  if [[ -n "${head_branch}" && "${head_branch}" != "master" ]]; then
    echo "--- dry-run: would delete branch ${head_branch} unless another open PR targets it (not deleted) ---"
  fi
  exit 0
fi

ao pr merge "${pr}"

# Preserve the old `--delete-branch` behaviour: remove the head branch
# unless another open PR still targets it as a base (stacked-PR guard).
# Deletion goes through the GitHub API because pushing a `:branch`
# refspec deletion is denied for every session.
if [[ -z "${head_branch}" || "${head_branch}" == "master" || "${head_branch}" == "${base_branch}" ]]; then
  echo "Kept branch ${head_branch:-unknown}: not a deletable head branch."
  exit 0
fi
open_bases="$(gh pr list -R "${REPO}" --state open --json baseRefName,number -q '.[].baseRefName' 2>/dev/null || true)"
if printf '%s' "${open_bases}" | grep -qxF "${head_branch}"; then
  echo "Kept branch ${head_branch}: another open PR still targets it as a base."
  exit 0
fi
gh api -X DELETE "repos/${REPO}/git/refs/heads/${head_branch}" >/dev/null && echo "Deleted branch ${head_branch}."
