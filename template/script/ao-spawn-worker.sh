#!/usr/bin/env bash
# ao-spawn-worker.sh: the only sanctioned orchestrator spawn path
# (orchestrator, reviewer, takeover, and buffer sessions included).
# Only the orchestrator may run it: it refuses unless the marker file
# .ao-orchestrator exists in the current worktree (created only in the
# orchestrator worktree, never committed).
#
# Usage: script/ao-spawn-worker.sh --issue <n> --role <role> --name <label> [--model <id>] [--dry-run]
#
# Validates the issue (exists and OPEN), the role, and the display name,
# composes a role-appropriate worker prompt from the issue, then spawns via
# `ao spawn --project {{PROJECT_NAME}} --issue <n> --name <label> --prompt <prompt>`.
# --dry-run prints the composed prompt and the spawn command without spawning.
#
# Prompt classes:
#   implement (dev, content, dev-takeover): implement + branch + PR.
#   review (dev-peer-review, content-review): COMMENT verdict only, no code.
#   specgate (spec-reviewer): SPEC-GATE PASS/FAIL verdict only.
#   spec (product-owner, business-analyst, architect, qa-lead,
#     release-manager): assigned specs only, no product-code changes.
#   buffer (buffer-worker): file GitHub issues from the owner request
#     recorded in the referenced issue; no implementation, PRs, or pushes.
set -euo pipefail

REPO="{{REPO_SLUG}}"
PROJECT="{{PROJECT_NAME}}"
MARKER=".ao-orchestrator"

# Orchestrator gate: the marker file alone is forgeable (any session
# can touch it), so additionally require that this AO session is a live
# orchestrator session for this project. Guardrail, not a security
# boundary: a session that deliberately forges both signals can still
# run this script — real enforcement is GitHub-side branch
# protection/rulesets (follow-up issue), which no session can bypass.
require_orchestrator() {
  if [[ ! -f "${MARKER}" ]]; then
    echo "error: refusing to spawn: marker file ${MARKER} not found in $(pwd)" >&2
    echo "Only the orchestrator may spawn sessions; run this wrapper from the orchestrator worktree." >&2
    exit 1
  fi
  if [[ -z "${AO_SESSION_ID:-}" ]]; then
    echo "error: refusing to spawn: AO_SESSION_ID is not set; run from the orchestrator session." >&2
    exit 1
  fi
  local orch_ok
  orch_ok="$(ao orchestrator ls --json 2>/dev/null | jq -r --arg s "${AO_SESSION_ID}" --arg p "${PROJECT}" '[.data[]? | select(.id == $s and .projectId == $p and .role == "orchestrator" and .isTerminated == false)] | length' 2>/dev/null || true)"
  if [[ "${orch_ok}" != "1" ]]; then
    echo "error: refusing to spawn: session '${AO_SESSION_ID}' is not a live orchestrator session for ${PROJECT}." >&2
    exit 1
  fi
}
IMPLEMENT_ROLES="dev content dev-takeover ai-engineer"
REVIEW_ROLES="dev-peer-review content-review"
SPECGATE_ROLES="spec-reviewer"
SPEC_ROLES="product-owner business-analyst architect qa-lead release-manager"
BUFFER_ROLES="buffer-worker"
VALID_ROLES="${IMPLEMENT_ROLES} ${REVIEW_ROLES} ${SPECGATE_ROLES} ${SPEC_ROLES} ${BUFFER_ROLES}"

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

role_class=""
for r in ${IMPLEMENT_ROLES}; do if [[ "${role}" == "${r}" ]]; then role_class="implement"; fi; done
for r in ${REVIEW_ROLES}; do if [[ "${role}" == "${r}" ]]; then role_class="review"; fi; done
for r in ${SPECGATE_ROLES}; do if [[ "${role}" == "${r}" ]]; then role_class="specgate"; fi; done
for r in ${SPEC_ROLES}; do if [[ "${role}" == "${r}" ]]; then role_class="spec"; fi; done
for r in ${BUFFER_ROLES}; do if [[ "${role}" == "${r}" ]]; then role_class="buffer"; fi; done
if [[ -z "${role_class}" ]]; then
  echo "error: unknown role '${role}'. Valid roles: ${VALID_ROLES}" >&2
  exit 1
fi

# Only the orchestrator may spawn sessions: the marker file
# .ao-orchestrator exists solely in the orchestrator worktree (never
# committed), and this session must be a live orchestrator session.
# Workers calling this wrapper are refused here, and direct
# `ao spawn` is denied for every session by .opencode/opencode.jsonc.
# The gate applies even for --dry-run.
require_orchestrator

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

# Best effort: warn if the issue already has an active session. Never fail here:
# a broken session listing (or an unexpected JSON shape) only warns.
if sessions_json="$(ao session ls -p "${PROJECT}" --json 2>/dev/null)"; then
  if owner="$(printf '%s' "${sessions_json}" | jq -r --arg i "${issue}" '[.data[]? | select((.issueId | tostring) == $i and .isTerminated == false) | .id] | join(", ")' 2>/dev/null)"; then
    if [[ -n "${owner}" ]]; then
      echo "warning: issue #${issue} already has active session(s): ${owner}" >&2
    fi
  else
    echo "warning: could not parse session list; skipping duplicate-issue check" >&2
  fi
else
  echo "warning: could not list sessions; skipping duplicate-issue check" >&2
fi

# Role file: agent definition when one exists, otherwise the skill/role doc.
role_file=".opencode/agents/${role}.md"
if [[ ! -f "${role_file}" ]]; then
  case "${role}" in
    dev|dev-takeover) role_file=".opencode/skills/worker/SKILL.md" ;;
    *) role_file=".opencode/skills/orchestrator/SKILL.md" ;;
  esac
fi

# Artefact signature: buffer work is signed business-analyst
# (see .opencode/agents/buffer-worker.md); every other role signs itself.
sign_role="${role}"
if [[ "${role_class}" == "buffer" ]]; then sign_role="business-analyst"; fi

header="You are the ${role} session for {{PROJECT_NAME}} (role string: ${role}). Read AGENTS.md, ${role_file}, docs/ao-rules.md, and GitHub issue #${issue} first (gh issue view ${issue} -R ${REPO})."

case "${role_class}" in
  implement|spec) header="${header} The issue is the spec: implement exactly what it says." ;;
  *) header="${header} The issue is your task context: read it first, then follow the role instructions below." ;;
esac

header="${header}

Issue #${issue}: ${issue_title}
${issue_url}
Issue labels: ${issue_labels}"

identity="Identity: configure this worktree with git config --worktree user.name \"Your Name (${role})\"; keep the existing email.
All public artifacts MUST be English (PRs, commits, issues, review comments, code comments)."

merge_authority="MERGE AUTHORITY: workers never merge. Do not run gh pr merge, do not push to {{DEFAULT_BRANCH}}, do not force-push. Open the PR and end your turn; the orchestrator merges only after an AO review verdict of approved and green CI. This rule overrides any generic instruction to merge when CI is green."

footer="End every artefact with the footer from script/ao-role-footer.sh ${sign_role} \"\$AO_SESSION_ID\" (see docs/ao-rules.md)."

case "${role_class}" in
  implement)
    body="Branch: create your work from your session root branch as ao/<session>/${issue}-<slug> (never the default branch).
Every PR body must contain: a Summary section, \"Closes #${issue}\", the Type section, the Risk label copied from the issue labels (${issue_labels}), and a Test evidence section. ${footer}"
    ;;
  review)
    body="Review-only session: review the PR opened for issue #${issue} (read-only diff; never edit code, never push, never open a PR).
Post exactly one COMMENT verdict on that PR: APPROVE or CHANGES_REQUESTED, with findings by severity and file:line references, plus your role footer. Then end your turn. ${footer}"
    ;;
  specgate)
    body="Spec-gate session: check the required specs for issue #${issue} exist, are active, and match the change (see the spec-gate skill).
Post exactly one SPEC-GATE verdict as a PR/issue comment: PASS or FAIL with the missing-spec findings. Never implement, never push, never open a PR. Then end your turn. ${footer}"
    ;;
  spec)
    body="Spec-only session: write the specs assigned by issue #${issue} (see the spec-gate skill for your owning doc group). Do not change product code and do not implement behaviour.
Ship the specs on a branch ao/<session>/${issue}-<slug> (never the default branch) with a PR body containing: a Summary section, \"Closes #${issue}\", the Type section, the Risk label copied from the issue labels (${issue_labels}), and a Test evidence section. ${footer}"
    ;;
  buffer)
    body="Issue-filing session: the owner request is recorded in issue #${issue} above; read it for context, scope, and constraints.
File one issue per small task (one worker = one PR downstream), each with context, scope, acceptance criteria, exactly one risk label, and an English title/body.
Boundaries: do not implement, fix, review, merge, push code, or open PRs; no branch needed.
Report the filed issue URLs with each scope and risk label, then end your turn. Sign artefacts with role string business-analyst. ${footer}"
    ;;
esac

prompt="${header}

${identity}
${body}

${merge_authority}"

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
