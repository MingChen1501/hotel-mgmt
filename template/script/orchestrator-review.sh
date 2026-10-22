#!/usr/bin/env bash
# orchestrator-review.sh: the sanctioned review-trigger path for the orchestrator.
#
# Usage: script/orchestrator-review.sh <worker-session-id> [--pr <url>] [--model <id>] [--rerun] [--dry-run]
#
# Only the orchestrator may trigger reviews: refuses unless the marker
# file .ao-orchestrator exists in the current worktree (created only in
# the orchestrator worktree, never committed), mirroring
# script/orchestrator-merge.sh. Direct `ao review trigger` is denied for
# every session by .opencode/opencode.jsonc.
# --dry-run prints what it would do without triggering (marker still required).
set -euo pipefail

PROJECT="{{PROJECT_NAME}}"
MARKER=".ao-orchestrator"

# Orchestrator gate: the marker file alone is forgeable (any session
# can touch it), so additionally require that this AO session is a live
# orchestrator session for this project. Guardrail, not a security
# boundary — real enforcement is GitHub-side (follow-up issue).
require_orchestrator() {
  if [[ ! -f "${MARKER}" ]]; then
    echo "error: refusing to trigger review: marker file ${MARKER} not found in $(pwd)" >&2
    echo "Only the orchestrator may trigger reviews; run this wrapper from the orchestrator worktree." >&2
    exit 1
  fi
  if [[ -z "${AO_SESSION_ID:-}" ]]; then
    echo "error: refusing to trigger review: AO_SESSION_ID is not set; run from the orchestrator session." >&2
    exit 1
  fi
  local orch_ok
  orch_ok="$(ao orchestrator ls --json 2>/dev/null | jq -r --arg s "${AO_SESSION_ID}" --arg p "${PROJECT}" '[.data[]? | select(.id == $s and .projectId == $p and .role == "orchestrator" and .isTerminated == false)] | length' 2>/dev/null || true)"
  if [[ "${orch_ok}" != "1" ]]; then
    echo "error: refusing to trigger review: session '${AO_SESSION_ID}' is not a live orchestrator session for ${PROJECT}." >&2
    exit 1
  fi
}

usage() {
  echo "Usage: $0 <worker-session-id> [--pr <url>] [--model <id>] [--rerun] [--dry-run]" >&2
}

session=""
pr=""
model=""
rerun=0
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) pr="${2:-}"; shift 2 ;;
    --model) model="${2:-}"; shift 2 ;;
    --rerun) rerun=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "error: unknown argument: $1" >&2; usage; exit 1 ;;
    *) [[ -z "${session}" ]] || { echo "error: unexpected argument: $1" >&2; usage; exit 1; }; session="$1"; shift ;;
  esac
done

[[ -n "${session}" ]] || { echo "error: a worker session id is required" >&2; usage; exit 1; }

require_orchestrator

review_cmd=(ao review trigger "${session}")
if [[ -n "${pr}" ]]; then
  review_cmd+=(--pr "${pr}")
fi
if [[ -n "${model}" ]]; then
  review_cmd+=(--model "${model}")
fi
if [[ "${rerun}" -eq 1 ]]; then
  review_cmd+=(--rerun)
fi

if [[ "${dry_run}" -eq 1 ]]; then
  echo "--- dry-run: would run: ${review_cmd[*]} (not triggered) ---"
  exit 0
fi

"${review_cmd[@]}"
