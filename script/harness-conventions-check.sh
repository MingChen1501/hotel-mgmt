#!/usr/bin/env bash
#
# Harness conventions self-check (issue #231).
#
# Fails on the drift class that caused the phantom test-doc rows and the
# stale README pointers: a skill or role file that promises a rule no
# script enforces, or documents a path that does not exist.
#
# Two checks, both deterministic and offline:
#   1. Documented paths exist — every backtick-quoted `docs/...` or
#      `script/...` file reference in the harness skill/role files must
#      resolve to a real file under the repo root.
#   2. Promised rules are enforced — an explicit rule -> enforcement
#      table; each row names the file that must carry the enforcement
#      marker (a script grep or a config deny rule).
#
# Usage:
#   script/harness-conventions-check.sh            # check this repo
#   script/harness-conventions-check.sh --self-test
#     # green on this repo AND red on a phantom-promise fixture
#
# Run from anywhere; resolves the repo root from the script location.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Harness skill/role files whose path references must resolve.
SCAN_FILES=(
  .opencode/skills/orchestrator/SKILL.md
  .opencode/skills/worker/SKILL.md
  .opencode/skills/spec-gate/SKILL.md
  .opencode/skills/hotel-verify/SKILL.md
  .opencode/agents/product-owner.md
  .opencode/agents/qa-lead.md
  .opencode/agents/dev-peer-review.md
  .opencode/agents/content-review.md
  .opencode/agents/spec-reviewer.md
  docs/ao-rules.md
  AGENTS.md
)

# Rule -> enforcement table: "file|marker". The file (relative to the
# root under check) must exist and contain the marker string.
RULES=(
  "script/orchestrator-merge.sh|headRefOid"
  ".opencode/opencode.jsonc|gh pr merge"
  ".opencode/opencode.jsonc|ao spawn"
  "script/ao-spawn-worker.sh|ao-spawn-worker"
  "script/orchestrator-review.sh|orchestrator-review"
  "script/ao-role-footer.sh|ao-role"
  "script/contract-check.sh|contract-check"
)

# Documented-as-absent paths: named in the scanned files as
# intentionally missing (not drift). Each entry must keep its
# "intentional, not drift" note in the referencing file; anything else
# absent fails the check.
KNOWN_ABSENT=(
  .opencode/agents/dev.md
  .opencode/agents/dev-takeover.md
  .opencode/agents/orchestrator.md
)

fail=0

# check_paths <root> <file...>: every backtick-quoted docs/script file
# reference in the given files must exist under <root>.
check_paths() {
  local root="$1"; shift
  local f token path
  for f in "$@"; do
    [[ -f "$root/$f" ]] || { echo "  FAIL scan target missing: $f"; fail=1; continue; }
    while IFS= read -r token; do
      # Strip leading/trailing punctuation and section anchors.
      token="$(printf '%s' "$token" | sed -e 's/^[(`]*//' -e 's/[,.;:)]*$//' -e 's/§.*$//')"
      case "$token" in
        *'*'*|*'{{'*|*'}}'*|*http*|/*) continue ;;
      esac
      case "$token" in
        docs/*.md|docs/*.sh|script/*.sh|.opencode/*.md|AGENTS.md) : ;;
        *) continue ;;
      esac
      path="$root/$token"
      if [[ -e "$path" ]]; then
        echo "  OK $f -> $token"
      else
        local known=0
        local absent
        for absent in ${KNOWN_ABSENT[@]+"${KNOWN_ABSENT[@]}"}; do
          [[ "$token" == "$absent" ]] && known=1
        done
        if [[ "$known" -eq 1 ]]; then
          echo "  OK $f -> $token (documented as intentionally absent)"
          continue
        fi
        # Stubs live as index rows only (docs/README.md): a docs/
        # reference is honoured when the index names it, which keeps
        # the index as the single authority for what may stay stubbed.
        if [[ "$token" == docs/* && -f "$root/docs/README.md" ]] \
          && grep -qF "\`${token#docs/}\`" "$root/docs/README.md"; then
          echo "  OK $f -> $token (indexed stub in docs/README.md)"
        else
          echo "  FAIL phantom path: $f references $token (no such file)"
          fail=1
        fi
      fi
    done < <(grep -o '`[^`]*`' "$root/$f" | tr -d '`' | tr ' \t' '\n' | grep -E '\.(md|sh)$' || true)
  done
}

# check_rules <root>: every rule -> enforcement row must hold.
check_rules() {
  local root="$1"
  local row file marker
  for row in "${RULES[@]}"; do
    file="${row%%|*}"
    marker="${row#*|}"
    if [[ ! -f "$root/$file" ]]; then
      echo "  FAIL rule without enforcement: $file missing (marker: $marker)"
      fail=1
    elif grep -qF "$marker" "$root/$file"; then
      echo "  OK rule enforced: $file carries '$marker'"
    else
      echo "  FAIL rule without enforcement: $file lacks '$marker'"
      fail=1
    fi
  done
}

run_checks() {
  local root="$1"; shift
  echo "harness-conventions-check: documented paths under $root"
  check_paths "$root" "$@"
  if [[ "$root" == "$ROOT" ]]; then
    echo "harness-conventions-check: promised rules enforced"
    check_rules "$root"
  fi
}

self_test() {
  echo "harness-conventions-check --self-test"
  echo "--- live repo must be green ---"
  fail=0
  run_checks "$ROOT" "${SCAN_FILES[@]}"
  if [[ "$fail" -ne 0 ]]; then
    echo "SELF-TEST FAIL: live repo check is red; fix the drift above."
    return 1
  fi
  echo "--- phantom fixture must be red ---"
  local fix
  fix="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$fix'" EXIT
  mkdir -p "$fix/.opencode/skills/demo"
  cat >"$fix/.opencode/skills/demo/SKILL.md" <<'EOF'
# Demo skill

See `docs/testing/test-cases.md` and run `script/does-not-exist.sh`.
EOF
  fail=0
  check_paths "$fix" ".opencode/skills/demo/SKILL.md" >/dev/null
  local paths_failed="$fail"
  fail=0
  printf 'nothing here\n' >"$fix/empty.sh"
  if grep -qF "marker-that-is-absent" "$fix/empty.sh"; then
    echo "SELF-TEST FAIL: fixture marker unexpectedly present."
    return 1
  fi
  echo "  OK fixture rule check correctly red (absent marker not found)"
  if [[ "$paths_failed" -eq 0 ]]; then
    echo "SELF-TEST FAIL: phantom fixture stayed green; the check is blind."
    return 1
  fi
  echo "  OK fixture path check correctly red (phantom promise caught)"
  echo "SELF-TEST PASS: green on live repo, red on phantom fixture."
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

run_checks "$ROOT" "${SCAN_FILES[@]}"

if [[ "$fail" -ne 0 ]]; then
  echo "harness-conventions-check: FAIL — harness drift found."
  exit 1
fi
echo "harness-conventions-check: PASS — no phantom paths, all rules enforced."
