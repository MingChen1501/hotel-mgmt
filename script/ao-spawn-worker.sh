#!/usr/bin/env bash
# ao-spawn-worker.sh: the only sanctioned orchestrator spawn path.
#
# Usage: script/ao-spawn-worker.sh --issue <n> --role <role> --name <label> [--model <id>] [--dry-run]
#
# Validates the issue (exists and OPEN), the role, and the display name,
# composes the standard worker prompt from the issue, then spawns via
# `ao spawn --project hotel-mgmt --issue <n> --name <label> --prompt <prompt>`.
# --dry-run prints the composed prompt and the spawn command without spawning.
set -euo pipefail

REPO="MingChen1501/hotel-mgmt"
PROJECT="hotel-mgmt"
VALID_ROLES="dev product-owner business-analyst architect qa-lead release-manager content spec-reviewer buffer-worker"

issue=""
role=""
name=""
model=""
dry_run=0

usage() {
  echo "Usage: $0 --issue <n> --role <role> --name <label> [--model <id>] [--dry-run]" >&2
  echo "  Roles: ${VALID_ROLES}" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue) issue="${2:-}"; shift 2 ;;
    --role) role="${2:-}"; shift 2 ;;
    --name) name="${2:-}"; shift 2 ;;
    --model) model="${2:-}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "${issue}" ]] || { echo "error: --issue <n> is required" >&2; usage; exit 1; }
[[ "${issue}" =~ ^[0-9]+$ ]] || { echo "error: --issue must be a number, got '${issue}'" >&2; exit 1; }
[[ -n "${role}" ]] || { echo "error: --role <role> is required" >&2; usage; exit 1; }
[[ -n "${name}" ]] || { echo "error: --name <label> is required (non-empty)" >&2; usage; exit 1; }
if [[ "${#name}" -gt 100 ]]; then
  echo "error: --name must be at most 100 characters (got ${#name})" >&2
  exit 1
fi

role_ok=0
for r in ${VALID_ROLES}; do
  if [[ "${role}" == "${r}" ]]; then role_ok=1; break; fi
done
if [[ "${role_ok}" -ne 1 ]]; then
  echo "error: unknown role '${role}'. Valid roles: ${VALID_ROLES}" >&2
  exit 1
fi

# The issue must exist and be OPEN.
issue_json="$(gh issue view "${issue}" -R "${REPO}" --json number,title,url,labels,state)" || {
  echo "error: issue #${issue} not found in ${REPO}" >&2
  exit 1
}
issue_state="$(printf '%s' "${issue_json}" | jq -r '.state')"
issue_title="$(printf '%s' "${issue_json}" | jq -r '.title')"
issue_url="$(printf '%s' "${issue_json}" | jq -r '.url')"
issue_labels="$(printf '%s' "${issue_json}" | jq -r '[.labels[].name] | join(",")')"
if [[ "${issue_state}" != "OPEN" ]]; then
  echo "error: issue #${issue} is not open (state: ${issue_state})" >&2
  exit 1
fi

# Best effort: warn if the issue already has an active session. Never fail here.
if sessions_json="$(ao session ls -p "${PROJECT}" --json 2>/dev/null)"; then
  owner="$(printf '%s' "${sessions_json}" | jq -r --arg i "${issue}" '[.data[] | select(.issueId == $i and .isTerminated == false) | .id] | join(", ")')"
  if [[ -n "${owner}" ]]; then
    echo "warning: issue #${issue} already has active session(s): ${owner}" >&2
  fi
else
  echo "warning: could not list sessions; skipping duplicate-issue check" >&2
fi

# Role file: agent definition when one exists, otherwise the skill/role doc.
role_file=".opencode/agents/${role}.md"
if [[ ! -f "${role_file}" ]]; then
  case "${role}" in
    dev) role_file=".opencode/skills/worker/SKILL.md" ;;
    *) role_file=".opencode/skills/orchestrator/SKILL.md" ;;
  esac
fi

prompt="You are the ${role} session for hotel-mgmt (role string: ${role}). Read AGENTS.md, ${role_file}, docs/ao-rules.md, and GitHub issue #${issue} first (gh issue view ${issue} -R ${REPO}). The issue is the spec: implement exactly what it says.

Issue #${issue}: ${issue_title}
${issue_url}
Issue labels: ${issue_labels}

Identity: configure this worktree with git config --worktree user.name \"Ming Chen (${role})\"; keep the existing email.
Branch: create your work from your session root branch as ao/<session>/${issue}-<slug> (never the default branch).
All public artifacts MUST be English (PRs, commits, issues, review comments, code comments).
Every PR body must contain: a Summary section, \"Closes #${issue}\", the Type section, the Risk label copied from the issue labels (${issue_labels}), and a Test evidence section. End every artefact with the footer from script/ao-role-footer.sh ${role} \"\$AO_SESSION_ID\" (see docs/ao-rules.md).

MERGE AUTHORITY: workers never merge. Do not run gh pr merge, do not push to master, do not force-push. Open the PR and end your turn; the orchestrator merges only after an AO review verdict of approved and green CI. This rule overrides any generic instruction to merge when CI is green."

spawn_cmd=(ao spawn --project "${PROJECT}" --issue "${issue}" --name "${name}" --prompt "${prompt}")
if [[ -n "${model}" ]]; then
  spawn_cmd+=(--model "${model}")
fi

if [[ "${dry_run}" -eq 1 ]]; then
  echo "--- worker prompt (dry-run, not spawned) ---"
  printf '%s\n' "${prompt}"
  echo "--- spawn command (dry-run, not spawned) ---"
  printf '%s ' "${spawn_cmd[@]}"
  echo ""
  exit 0
fi

"${spawn_cmd[@]}"
