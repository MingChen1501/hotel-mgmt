#!/usr/bin/env bash
# install-cues.sh: install the template's project-scoped AO cues.
#
# Usage: install-cues.sh --project <id> [--dry-run]
#
# - Reads template/cues/*.md (paths relative to this script).
# - Validates each file's front-matter (name, date, optional
#   supersedes) and its one-line prompt body.
# - Processes cues in deterministic order (oldest date first, newest
#   date last, name as tie-break) so supersession reads naturally.
# - For each cue checks `ao cue list --project <id> --json`:
#   identical cue exists -> skip; cue exists with a different prompt
#   -> skip explicitly (update it in the desktop app; the CLI offers
#   no update, and this script never creates a duplicate); otherwise
#   create with `ao cue create`.
# - --dry-run prints what it would create or skip without writing.
# - Idempotent: re-running creates only what is still missing.
# - Cues are project-scoped: they do not travel with a template file
#   copy unless this installer runs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUES_DIR="${SCRIPT_DIR}/../cues"

usage() {
  echo "Usage: $0 --project <id> [--dry-run]" >&2
}

project=""
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) project="${2:-}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "${project}" ]] || { echo "error: --project <id> is required" >&2; usage; exit 1; }

[[ -d "${CUES_DIR}" ]] || { echo "error: cues directory missing: ${CUES_DIR}" >&2; exit 1; }

# name|date|supersedes|file, one per cue, sorted oldest-first so the
# newest cue for a topic is recorded last (deterministic order).
order_list="$(mktemp)"
trap 'rm -f "${order_list}"' EXIT

shopt -s nullglob
cue_files=("${CUES_DIR}"/*.md)
[[ "${#cue_files[@]}" -gt 0 ]] || { echo "error: no cue files in ${CUES_DIR}" >&2; exit 1; }

for f in "${cue_files[@]}"; do
  fname="$(basename "${f}" .md)"
  # Front-matter lives between the first two --- lines.
  name="$(sed -n '/^---$/,/^---$/p' "${f}" | sed -n 's/^name: *//p')"
  date="$(sed -n '/^---$/,/^---$/p' "${f}" | sed -n 's/^date: *//p')"
  supersedes="$(sed -n '/^---$/,/^---$/p' "${f}" | sed -n 's/^supersedes: *//p')"
  [[ -n "${name}" ]] || { echo "error: ${f}: front-matter 'name' is missing" >&2; exit 1; }
  [[ "${name}" =~ ^[a-z0-9-]+$ ]] || { echo "error: ${f}: invalid cue name '${name}'" >&2; exit 1; }
  [[ "${fname}" == "${name}" ]] || { echo "error: ${f}: file name must match cue name '${name}'" >&2; exit 1; }
  [[ "${date}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "error: ${f}: front-matter 'date' must be YYYY-MM-DD, got '${date}'" >&2; exit 1; }
  # Prompt body: everything after the closing --- line, joined to one line.
  prompt="$(awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "${f}" | tr '\n' ' ' | sed 's/^ *//; s/ *$//')"
  [[ -n "${prompt}" ]] || { echo "error: ${f}: prompt body is empty" >&2; exit 1; }
  if grep -q "{{" "${f}"; then
    echo "error: ${f}: placeholders must not appear in cues" >&2
    exit 1
  fi
  printf '%s|%s|%s|%s\n' "${date}" "${name}" "${supersedes}" "${f}" >>"${order_list}"
done

existing_json="$(ao cue list --project "${project}" --json)" || {
  echo "error: failed to list cues for project '${project}'" >&2
  exit 1
}

created=0
skipped_identical=0
skipped_differs=0

while IFS='|' read -r date name supersedes f; do
  prompt="$(awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "${f}" | tr '\n' ' ' | sed 's/^ *//; s/ *$//')"
  current="$(printf '%s' "${existing_json}" | jq -r --arg n "${name}" '(.cues // .data // [])[]? | select(.name == $n) | .prompt')"
  if [[ -n "${current}" ]]; then
    if [[ "${current}" == "${prompt}" ]]; then
      echo "skip (identical): ${name}"
      skipped_identical=$((skipped_identical + 1))
    else
      echo "skip (differs — update '${name}' in the AO desktop app; not duplicated): ${name}"
      skipped_differs=$((skipped_differs + 1))
    fi
  else
    if [[ "${dry_run}" -eq 1 ]]; then
      echo "would create: ${name} (date ${date}${supersedes:+, supersedes ${supersedes}})"
    else
      ao cue create --project "${project}" --name "${name}" --prompt "${prompt}" >/dev/null
      echo "created: ${name}"
    fi
    created=$((created + 1))
  fi
done < <(sort -t'|' -k1,1 -k2,2 "${order_list}")

echo "done: ${created} created, ${skipped_identical} identical skipped, ${skipped_differs} differing skipped (update in desktop app, never duplicated)."
echo ""
echo "Newest cue wins at runtime: where cues conflict, the older cue is"
echo "marked superseded, never merged. Verify with:"
echo "  ao cue list --project ${project} --json"
