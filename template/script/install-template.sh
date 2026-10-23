#!/usr/bin/env bash
# install-template.sh: install the AO + OpenCode agentic workflow template
# into a target git repository.
#
# Usage:
#   install-template.sh --target <dir> --project-name <name> \
#       --repo-slug <owner/repo> --default-branch <branch> --domain <domain> \
#       [--force] [--dry-run]
#
# - Copies the template tree (AGENTS.md, config/, cues/, .opencode/,
#   .github/, docs/, sanctioned scripts) into the target;
#   README.md/ONBOARDING.md and this installer are documentation and
#   are never installed.
# - Never overwrites an existing file unless --force is passed.
# - Replaces the {{PROJECT_NAME}}, {{REPO_SLUG}}, {{DEFAULT_BRANCH}} and
#   {{DOMAIN}} placeholders from the flags.
# - --dry-run prints what it would do without writing anything.
# - Idempotent: re-running copies only what is still missing (or, with
#   --force, refreshes files whose content would change).
# - Refuses a target that is not inside a git work tree.
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo "Usage: $0 --target <dir> --project-name <name> --repo-slug <owner/repo> --default-branch <branch> --domain <domain> [--force] [--dry-run]" >&2
}

target=""
project_name=""
repo_slug=""
default_branch=""
domain=""
force=0
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) target="${2:-}"; shift 2 ;;
    --project-name) project_name="${2:-}"; shift 2 ;;
    --repo-slug) repo_slug="${2:-}"; shift 2 ;;
    --default-branch) default_branch="${2:-}"; shift 2 ;;
    --domain) domain="${2:-}"; shift 2 ;;
    --force) force=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "${target}" ]] || { echo "error: --target <dir> is required" >&2; usage; exit 1; }
[[ -n "${project_name}" ]] || { echo "error: --project-name <name> is required" >&2; usage; exit 1; }
[[ -n "${repo_slug}" ]] || { echo "error: --repo-slug <owner/repo> is required" >&2; usage; exit 1; }
[[ -n "${default_branch}" ]] || { echo "error: --default-branch <branch> is required" >&2; usage; exit 1; }
[[ -n "${domain}" ]] || { echo "error: --domain <domain> is required" >&2; usage; exit 1; }

[[ -d "${target}" ]] || { echo "error: target '${target}' is not a directory" >&2; exit 1; }
git -C "${target}" rev-parse --git-dir >/dev/null 2>&1 || {
  echo "error: refusing to install: target '${target}' is not inside a git work tree" >&2
  exit 1
}

# Template payload: everything the new project needs. Template-only docs
# (README.md, ONBOARDING.md) and this installer stay behind.
# config/ao-project.jsonc carries {{REPO_SLUG}}/{{DEFAULT_BRANCH}}
# placeholders and is substituted like any other payload file; cues carry
# no placeholders.
PAYLOAD=(
  "AGENTS.md"
  "config/ao-project.jsonc"
  "cues/single-worker-pool.md"
  "cues/buffer-worker-issue-first.md"
  "cues/enforce-pool-before-spawn.md"
  "cues/one-task-one-pr.md"
  "cues/worker-report-and-ping.md"
  "cues/verify-before-report.md"
  "cues/no-kill-with-unpushed-work.md"
  "cues/git-push-guardrails.md"
  "cues/deny-destructive-ops.md"
  "cues/merge-squash-always.md"
  "cues/english-artifacts.md"
  "cues/cron-wake-backoff.md"
  "cues/native-review-broken-manual.md"
  "cues/publish-scope.md"
  "cues/reviewer-worker-flow.md"
  "cues/harness-engineering.md"
  "cues/review-repo-verdict.md"
  "cues/stop-state-until-resume.md"
  ".opencode/agents/orchestrator.md"
  ".opencode/agents/product-owner.md"
  ".opencode/agents/business-analyst.md"
  ".opencode/agents/architect.md"
  ".opencode/agents/ai-engineer.md"
  ".opencode/agents/qa-lead.md"
  ".opencode/agents/release-manager.md"
  ".opencode/agents/spec-reviewer.md"
  ".opencode/agents/dev-peer-review.md"
  ".opencode/agents/content.md"
  ".opencode/agents/content-review.md"
  ".opencode/agents/buffer-worker.md"
  ".opencode/skills/orchestrator/SKILL.md"
  ".opencode/skills/worker/SKILL.md"
  ".opencode/skills/go-module/SKILL.md"
  ".opencode/skills/node-module/SKILL.md"
  ".opencode/skills/spring-module/SKILL.md"
  ".opencode/skills/spec-gate/SKILL.md"
  ".opencode/skills/architecture/SKILL.md"
  ".opencode/skills/project-verify/SKILL.md"
  ".opencode/commands/review.md"
  ".opencode/commands/verify.md"
  ".opencode/opencode.jsonc"
  ".opencode/plugins/project-guard.ts"
  ".github/ISSUE_TEMPLATE/task.yml"
  ".github/ISSUE_TEMPLATE/config.yml"
  ".github/PULL_REQUEST_TEMPLATE.md"
  "docs/README.md"
  "docs/ao-rules.md"
  "docs/project/issue-conventions.md"
  "docs/agentic-template/README.md"
  "docs/agentic-template/bootstrap.md"
  "docs/agentic-template/conventions.md"
  "docs/agentic-template/gate.md"
  "docs/agentic-template/roles.md"
  "docs/agentic-template/extraction-plan.md"
  "script/ao-role-footer.sh"
  "script/contract-check.sh"
  "script/ao-spawn-worker.sh"
  "script/orchestrator-merge.sh"
  "script/orchestrator-review.sh"
  "script/install-cues.sh"
)

for rel in "${PAYLOAD[@]}"; do
  [[ -f "${TEMPLATE_DIR}/${rel}" ]] || { echo "error: template file missing: ${rel}" >&2; exit 1; }
done

substitute() {
  perl -pe 's/\{\{PROJECT_NAME\}\}/$ENV{INST_PROJECT_NAME}/g; s/\{\{REPO_SLUG\}\}/$ENV{INST_REPO_SLUG}/g; s/\{\{DEFAULT_BRANCH\}\}/$ENV{INST_DEFAULT_BRANCH}/g; s/\{\{DOMAIN\}\}/$ENV{INST_DOMAIN}/g' "$1"
}
export INST_PROJECT_NAME="${project_name}" INST_REPO_SLUG="${repo_slug}" INST_DEFAULT_BRANCH="${default_branch}" INST_DOMAIN="${domain}"

copied=0
refreshed=0
unchanged=0
skipped=0
installed_list="$(mktemp)"
trap 'rm -f "${installed_list}"' EXIT

for rel in "${PAYLOAD[@]}"; do
  src="${TEMPLATE_DIR}/${rel}"
  dest="${target}/${rel}"
  rendered="$(substitute "${src}")"
  # Command substitution strips trailing newlines; restore the one the
  # template file carries so installed files differ only by placeholder
  # substitution (every payload file ends with exactly one newline).
  if [[ -z "$(tail -c 1 "${src}")" ]]; then
    rendered="${rendered}"$'\n'
  fi
  if [[ ! -e "${dest}" ]]; then
    if [[ "${dry_run}" -eq 1 ]]; then
      echo "would copy: ${rel}"
    else
      mkdir -p "$(dirname "${dest}")"
      printf '%s' "${rendered}" >"${dest}"
      if [[ -x "${src}" ]]; then chmod +x "${dest}"; fi
      echo "copied: ${rel}"
    fi
    copied=$((copied + 1))
  elif [[ "$(cat "${dest}")" == "$(printf '%s' "${rendered}")" ]]; then
    echo "unchanged: ${rel}"
    unchanged=$((unchanged + 1))
  elif [[ "${force}" -eq 1 ]]; then
    if [[ "${dry_run}" -eq 1 ]]; then
      echo "would refresh (--force): ${rel}"
    else
      printf '%s' "${rendered}" >"${dest}"
      echo "refreshed (--force): ${rel}"
    fi
    refreshed=$((refreshed + 1))
  else
    echo "skipped (exists, use --force to overwrite): ${rel}"
    skipped=$((skipped + 1))
  fi
  printf '%s\n' "${dest}" >>"${installed_list}"
done

# Fail closed: no template placeholder may survive in the files we installed.
# Match the four documented tokens (a bare "{{" check would false-positive
# on scripts that legitimately quote braces, e.g. install-cues.sh).
leftover=""
if [[ "${dry_run}" -eq 0 ]]; then
  while IFS= read -r f; do
    if grep -qE "{{(PROJECT_NAME|REPO_SLUG|DEFAULT_BRANCH|DOMAIN)}}" "${f}" 2>/dev/null; then leftover="${leftover}${f}"$'\n'; fi
  done <"${installed_list}"
fi
if [[ -n "${leftover}" ]]; then
  echo "error: placeholders remain after substitution in:" >&2
  printf '%s\n' "${leftover}" >&2
  exit 1
fi

echo "done: ${copied} copied, ${refreshed} refreshed, ${unchanged} unchanged, ${skipped} skipped."
echo ""
echo "Next steps:"
echo "  1. Review the new files (git -C '${target}' status), then commit them."
echo "  2. Create the risk/type labels: gh label create risk-low ... (see ONBOARDING in the template checkout, Step 2)."
echo "  3. Install the project cues: script/install-cues.sh --project <id> (see ONBOARDING, Step 3). Cues are project-scoped and do not travel with a file copy unless this runs."
echo "  4. Register the AO project with the FULL config object: ao project set-config <id> --config-json '<object from config/ao-project.jsonc>' (see ONBOARDING, Step 4). A single-field flag replaces the whole object, so never set fields one flag at a time."
echo "  5. Protect the default branch (require PRs, green CI, no direct pushes) and set up minimal CI."
echo "  6. Fill in the project-verify skill for your stack, then run the first guarded PR (T0 docs-only)."
