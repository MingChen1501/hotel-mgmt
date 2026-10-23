#!/usr/bin/env bash
# Regression test: orchestrator-merge.sh treats `skipping`/SKIPPED checks
# as non-blocking (path-aware CI marks inapplicable jobs as skipped),
# while fail/failed, pending, and cancelled checks still block the merge.
#
# Runs the wrapper with stubbed `gh`/`ao` on PATH plus a temporary marker
# directory, so no network, live session, or real PR is needed. Every case
# uses --dry-run: a mergeable run prints "would run", a blocked run exits
# non-zero with "refusing to merge".
#
# Usage: bash script/orchestrator-merge.test.sh [--script <path>]
#   --script defaults to the live wrapper next to this test; point it at
#   template/script/orchestrator-merge.sh to cover the template twin.
set -euo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/orchestrator-merge.sh"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --script) SCRIPT_UNDER_TEST="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--script <path>]"; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -f "${SCRIPT_UNDER_TEST}" ]] || { echo "error: script not found: ${SCRIPT_UNDER_TEST}" >&2; exit 1; }
# Absolutize: cases below run the wrapper from a temp working directory.
if [[ "${SCRIPT_UNDER_TEST}" != /* ]]; then
  SCRIPT_UNDER_TEST="$(pwd)/${SCRIPT_UNDER_TEST}"
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
touch "${work}/.ao-orchestrator"

# The wrapper reads its PROJECT constant itself; echo it back from the
# `ao` stub so this test covers live and template twins unchanged.
TEST_PROJECT="$(grep '^PROJECT=' "${SCRIPT_UNDER_TEST}" | cut -d'"' -f2)"
export TEST_PROJECT
export AO_SESSION_ID="test-session"

mkdir -p "${work}/bin"
cat >"${work}/bin/ao" <<'EOF'
#!/usr/bin/env bash
printf '{"data":[{"id":"%s","projectId":"%s","role":"orchestrator","isTerminated":false}]}\n' \
  "${AO_SESSION_ID}" "${TEST_PROJECT}"
EOF
cat >"${work}/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "pr" && "$2" == "view" ]]; then
  cat <<'JSON'
{"number":999,"state":"OPEN","url":"https://example.invalid/999","title":"Test PR","labels":[{"name":"chore"},{"name":"risk-medium"}],"headRefName":"test-branch","baseRefName":"master"}
JSON
elif [[ "$1" == "pr" && "$2" == "checks" ]]; then
  cat "${TEST_CHECKS_JSON}"
elif [[ "$1" == "pr" && "$2" == "list" ]]; then
  printf ''
else
  echo "stub gh: unexpected call (merge must not run under --dry-run): $*" >&2
  exit 1
fi
EOF
chmod +x "${work}/bin/ao" "${work}/bin/gh"
export PATH="${work}/bin:${PATH}"

pass=0
fail=0
run_case() {
  local name="$1" checks_json="$2" expect="$3" # expect: merge | refuse
  local checks_file="${work}/checks.json"
  printf '%s' "${checks_json}" >"${checks_file}"
  export TEST_CHECKS_JSON="${checks_file}"
  local out status=0
  if out="$(cd "${work}" && bash "${SCRIPT_UNDER_TEST}" 999 --dry-run 2>&1)"; then
    status=0
  else
    status=$?
  fi
  if [[ "${expect}" == "merge" ]]; then
    if [[ "${status}" -eq 0 && "${out}" == *"would run"* ]]; then
      echo "ok: ${name} merges"; pass=$((pass + 1))
    else
      echo "FAIL: ${name} should merge (status=${status}):"; printf '%s\n' "${out}"; fail=$((fail + 1))
    fi
  else
    if [[ "${status}" -ne 0 && "${out}" == *"refusing to merge"* ]]; then
      echo "ok: ${name} refuses"; pass=$((pass + 1))
    else
      echo "FAIL: ${name} should refuse (status=${status}):"; printf '%s\n' "${out}"; fail=$((fail + 1))
    fi
  fi
}

# Mirrors docs-only PR 123: 2 pass + 6 skipped -> merges.
run_case "pass+skip" \
  '[{"bucket":"pass","name":"changes","state":"SUCCESS"},{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"skipping","name":"go-build","state":"SKIPPED"},{"bucket":"skipping","name":"node-build","state":"SKIPPED"},{"bucket":"skipping","name":"billing-build","state":"SKIPPED"},{"bucket":"skipping","name":"contract-check","state":"SKIPPED"},{"bucket":"skipping","name":"migrate-check","state":"SKIPPED"},{"bucket":"skipping","name":"e2e-single-host","state":"SKIPPED"}]' \
  merge

run_case "pass+fail" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"fail","name":"go-build","state":"FAILED"}]' \
  refuse

run_case "pass+pending" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"pending","name":"go-build","state":"PENDING"}]' \
  refuse

run_case "pass+cancelled" \
  '[{"bucket":"pass","name":"ci","state":"SUCCESS"},{"bucket":"cancelled","name":"go-build","state":"CANCELLED"}]' \
  refuse

echo "test result: ${pass} passed, ${fail} failed"
[[ "${fail}" -eq 0 ]]
