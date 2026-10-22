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
#     risk-high/risk-very-high (owner approval gate).
# Then prints the PR state/labels/checks and runs `ao pr merge <n>`.
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

pr_json="$(gh pr view "${pr}" -R "${REPO}" --json number,state,url,title,labels 2>/dev/null)" || {
  echo "error: PR #${pr} not found in ${REPO}" >&2
  exit 1
}
state="$(printf '%s' "${pr_json}" | jq -r '.state')"
url="$(printf '%s' "${pr_json}" | jq -r '.url')"
title="$(printf '%s' "${pr_json}" | jq -r '.title')"
labels="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name] | join(", ")')"
risk_labels="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name | select(startswith("risk-"))] | join(" ")')"
risk_count="$(printf '%s' "${pr_json}" | jq -r '[.labels[].name | select(startswith("risk-"))] | length')"

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
echo "Checks:"
if ! gh pr checks "${pr}" -R "${REPO}" 2>&1; then
  echo "(no check results available)"
fi

if [[ "${dry_run}" -eq 1 ]]; then
  echo "--- dry-run: would run: ao pr merge ${pr} (not merged) ---"
  exit 0
fi

ao pr merge "${pr}"
