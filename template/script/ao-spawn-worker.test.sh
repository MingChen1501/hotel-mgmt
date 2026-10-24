#!/usr/bin/env bash
# Regression test: ao-spawn-worker.sh bootstrap (--seed) mode (issue #184).
#
# Covers: a --seed dry-run composes a buffer prompt carrying the owner
# request verbatim with the same buffer boundaries as the issue-anchored
# path (shape parity); the gate (marker file plus live-orchestrator
# session check) applies identically to bootstrap spawns; --seed is
# buffer-only and mutually exclusive with --issue; and the refusal paths
# (no marker, non-orchestrator session) are unchanged.
#
# Runs the wrapper with stubbed `gh`/`ao` on PATH plus a temporary marker
# directory, so no network, live session, or real spawn is needed. Every
# case uses --dry-run: a composed run exits 0 and prints the prompt, a
# refused run exits non-zero with "error: ...".
#
# Usage: bash script/ao-spawn-worker.test.sh [--script <path>]
#   --script defaults to the live wrapper next to this test; point it at
#   template/script/ao-spawn-worker.sh to cover the template twin.
set -euo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ao-spawn-worker.sh"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --script) SCRIPT_UNDER_TEST="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--script <path>]"; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -f "${SCRIPT_UNDER_TEST}" ]] || { echo "error: script not found: ${SCRIPT_UNDER_TEST}" >&2; exit 1; }
# Absolutize: cases below run the wrapper from temp working directories.
if [[ "${SCRIPT_UNDER_TEST}" != /* ]]; then
  SCRIPT_UNDER_TEST="$(pwd)/${SCRIPT_UNDER_TEST}"
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
mkdir -p "${work}/marked"
touch "${work}/marked/.ao-orchestrator"
mkdir -p "${work}/unmarked"

# The wrapper reads its PROJECT constant itself; echo it back from the
# `ao` stub so this test covers live and template twins unchanged.
TEST_PROJECT="$(grep '^PROJECT=' "${SCRIPT_UNDER_TEST}" | cut -d'"' -f2)"
export TEST_PROJECT
export AO_SESSION_ID="test-orchestrator-session"

mkdir -p "${work}/bin"
cat >"${work}/bin/ao" <<'EOF'
#!/usr/bin/env bash
# TEST_ORCH=1: this session is a live orchestrator session; otherwise not.
if [[ "$1" == "orchestrator" ]]; then
  if [[ "${TEST_ORCH:-1}" == "1" ]]; then
    printf '{"data":[{"id":"%s","projectId":"%s","role":"orchestrator","isTerminated":false}]}\n' \
      "${AO_SESSION_ID}" "${TEST_PROJECT}"
  else
    printf '{"data":[]}\n'
  fi
elif [[ "$1" == "session" ]]; then
  printf '{"data":[]}\n'
else
  echo "stub ao: unexpected call: $*" >&2
  exit 1
fi
EOF
cat >"${work}/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "issue" && "$2" == "view" ]]; then
  cat "${TEST_ISSUE_JSON}"
else
  echo "stub gh: unexpected call: $*" >&2
  exit 1
fi
EOF
chmod +x "${work}/bin/ao" "${work}/bin/gh"
export PATH="${work}/bin:${PATH}"

# Stubbed `gh issue view` payload; TEST_ISSUE_STATE selects OPEN/CLOSED.
make_issue_json() {
  jq -n --arg state "$1" \
    '{number:184,state:$state,url:"https://example.invalid/184",title:"Example task",labels:[{name:"chore"},{name:"risk-high"}]}'
}
export TEST_ISSUE_JSON="${work}/issue.json"

SEED_TEXT="Add a checkout retry button for failed payments"
export SEED_TEXT

pass=0
fail=0

# Shared buffer boundary lines: identical in both prompt paths.
BOUNDARY_LINES=(
  "File one issue per small task (one worker = one PR downstream)"
  "Boundaries: do not implement, fix, review, merge, push code, or open PRs; no branch needed."
  "never business-analyst by default"
)

check_boundaries() {
  local out="$1" name="$2" i line
  for i in "${!BOUNDARY_LINES[@]}"; do
    line="${BOUNDARY_LINES[$i]}"
    if [[ "${out}" != *"${line}"* ]]; then
      echo "FAIL: ${name} prompt missing boundary line: ${line}"
      return 1
    fi
  done
  return 0
}

ok() { echo "ok: $1"; pass=$((pass + 1)); }
notok() { echo "FAIL: $1"; printf '%s\n' "$2"; fail=$((fail + 1)); }

# 1. Bootstrap dry-run: verbatim seed + buffer boundaries, no --issue.
export TEST_ORCH=1
if out="$(cd "${work}/marked" && bash "${SCRIPT_UNDER_TEST}" --seed "${SEED_TEXT}" --role buffer-worker --name "bootstrap-seed" --dry-run 2>&1)"; then
  if [[ "${out}" == *"${SEED_TEXT}"* ]] && [[ "${out}" == *"Owner request (verbatim)"* ]] \
    && check_boundaries "${out}" "seed-bootstrap" \
    && [[ "${out}" != *"--issue"* ]]; then
    ok "seed-bootstrap-buffer-prompt"
  else
    notok "seed-bootstrap-buffer-prompt (prompt shape wrong)" "${out}"
  fi
else
  notok "seed-bootstrap-buffer-prompt (should succeed)" "${out:-}"
fi

# 2. Shape parity: issue-anchored buffer prompt carries the same
# boundary lines as the bootstrap prompt.
make_issue_json "OPEN" >"${TEST_ISSUE_JSON}"
seed_out="$(cd "${work}/marked" && bash "${SCRIPT_UNDER_TEST}" --seed "${SEED_TEXT}" --role buffer-worker --name "bootstrap-seed" --dry-run 2>/dev/null)"
if issue_out="$(cd "${work}/marked" && bash "${SCRIPT_UNDER_TEST}" --issue 184 --role buffer-worker --name "issue-anchored" --dry-run 2>&1)"; then
  if check_boundaries "${issue_out}" "issue-anchored" \
    && [[ "${issue_out}" == *"issue #184"* ]]; then
    # Every shared boundary line present in one prompt is present in
    # the other: extract, sort, and diff them.
    if diff <(printf '%s\n' "${seed_out}" | grep -F -f <(printf '%s\n' "${BOUNDARY_LINES[@]}")) \
            <(printf '%s\n' "${issue_out}" | grep -F -f <(printf '%s\n' "${BOUNDARY_LINES[@]}")) >/dev/null; then
      ok "issue-buffer-prompt-shape-parity"
    else
      notok "issue-buffer-prompt-shape-parity (boundary lines differ)" ""
    fi
  else
    notok "issue-buffer-prompt-shape-parity (issue prompt shape wrong)" "${issue_out}"
  fi
else
  notok "issue-buffer-prompt-shape-parity (issue path should succeed)" "${issue_out:-}"
fi

# Refusal helper: expect non-zero exit with "error:" on stderr/stdout.
expect_refuse() {
  local name="$1" dir="$2"; shift 2
  local out status=0
  if out="$(cd "${dir}" && bash "${SCRIPT_UNDER_TEST}" "$@" --dry-run 2>&1)"; then
    status=0
  else
    status=$?
  fi
  if [[ "${status}" -ne 0 && "${out}" == *"error:"* ]]; then
    ok "${name}"
  else
    notok "${name} (should refuse, status=${status})" "${out}"
  fi
}

# 3. No marker refuses, even for bootstrap dry-run.
expect_refuse "refuse-no-marker-seed" "${work}/unmarked" \
  --seed "${SEED_TEXT}" --role buffer-worker --name "bootstrap-seed"
expect_refuse "refuse-no-marker-issue" "${work}/unmarked" \
  --issue 184 --role buffer-worker --name "issue-anchored"

# 4. Non-orchestrator session refuses bootstrap and issue paths.
export TEST_ORCH=0
expect_refuse "refuse-non-orchestrator-seed" "${work}/marked" \
  --seed "${SEED_TEXT}" --role buffer-worker --name "bootstrap-seed"
expect_refuse "refuse-non-orchestrator-issue" "${work}/marked" \
  --issue 184 --role buffer-worker --name "issue-anchored"
export TEST_ORCH=1

# 5. --seed is buffer-only.
expect_refuse "refuse-seed-non-buffer-role" "${work}/marked" \
  --seed "${SEED_TEXT}" --role dev --name "not-buffer"

# 6. --seed and --issue are mutually exclusive.
expect_refuse "refuse-seed-plus-issue" "${work}/marked" \
  --seed "${SEED_TEXT}" --issue 184 --role buffer-worker --name "both"

# 7. Empty/blank --seed refuses.
expect_refuse "refuse-empty-seed" "${work}/marked" \
  --seed "   " --role buffer-worker --name "empty"

# 8. Neither --seed nor --issue refuses.
if out="$(cd "${work}/marked" && bash "${SCRIPT_UNDER_TEST}" --role buffer-worker --name "neither" --dry-run 2>&1)"; then
  notok "refuse-missing-source (should refuse)" "${out}"
else
  if [[ "${out}" == *"error:"* ]]; then ok "refuse-missing-source"; else notok "refuse-missing-source (no error:)" "${out}"; fi
fi

# 9. Closed issues still refuse on the issue-anchored path (unchanged).
make_issue_json "CLOSED" >"${TEST_ISSUE_JSON}"
expect_refuse "refuse-closed-issue" "${work}/marked" \
  --issue 184 --role buffer-worker --name "closed"

echo "test result: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
