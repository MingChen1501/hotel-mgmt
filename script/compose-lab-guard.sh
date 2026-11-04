#!/usr/bin/env bash
# compose-lab-guard.sh: fail-closed guard for compose labs on a shared machine.
#
# A worker lab that reuses the shared compose project tears down the
# owner's live lab (containers + data volumes destroyed). This guard
# refuses mutating compose invocations against the shared project and
# blesses isolated (-p) labs. Run it before any lab compose command:
#   script/compose-lab-guard.sh -- <your docker compose args...>
# e.g.
#   script/compose-lab-guard.sh -- -p hotel-lab-<session> -f deploy/compose.yaml up -d --build
#
# Rules enforced:
# - The effective project (from -p/--project-name, else
#   $COMPOSE_PROJECT_NAME, else the `name:` field of the compose
#   file) must differ from the shared project for any mutating verb
#   (up, down, stop, start, restart, rm, kill, create, run, teardown)
#   or any -v/--volumes (data-destroying) flag.
# - Read-only verbs (ps, logs, config, exec, ...) against the shared
#   project pass: inspection never tears anything down.
# - When no shared name can be determined (no `name:` field, no -p,
#   no $COMPOSE_PROJECT_NAME), mutating verbs refuse: pass an
#   explicit isolated -p instead.
#
# Usage:
#   script/compose-lab-guard.sh -- <compose args...>
#   script/compose-lab-guard.sh --self-test
#     # refuses shared-project teardown, allows the isolated lab
#
# Run from anywhere; resolves the repo root from the script location.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

MUTATING="up down stop start restart rm kill pause unpause create run teardown"

fail() { echo "compose-lab-guard: REFUSED: $*" >&2; exit 1; }
pass() { echo "compose-lab-guard: ALLOWED: $*"; }

# resolve_shared <compose-file>: print the `name:` field, or empty.
resolve_shared() {
  local file="$1"
  [[ -f "${file}" ]] || { printf ''; return 0; }
  sed -n 's/^name:[[:space:]]*//p' "${file}" | head -n 1 | tr -d '[:space:]'
}

guard() {
  local args=("$@")
  local project="" file="" verb="" volumes=0
  local i a
  for (( i = 0; i < ${#args[@]}; i++ )); do
    a="${args[$i]}"
    case "${a}" in
      -p|--project-name)
        i=$((i + 1)); project="${args[$i]:-}";;
      --project-name=*) project="${a#*=}";;
      -f|--file)
        i=$((i + 1)); file="${args[$i]:-}";;
      --file=*) file="${a#*=}";;
      -v|--volumes) volumes=1;;
      --volumes=*) volumes=1;;
      -*) :;;
      *)
        # First positional token is the compose verb (ignoring
        # `docker compose` prefixes when the full command is pasted).
        if [[ -z "${verb}" ]]; then
          case "${a}" in
            docker|compose) :;;
            *) verb="${a}";;
          esac
        fi;;
    esac
  done

  if [[ -z "${file}" ]]; then
    for cand in deploy/compose.yaml compose.yaml docker-compose.yml docker-compose.yaml; do
      if [[ -f "${ROOT}/${cand}" ]]; then file="${ROOT}/${cand}"; break; fi
    done
  else
    [[ "${file}" = /* ]] || file="${ROOT}/${file}"
  fi

  local shared=""
  [[ -n "${file}" ]] && shared="$(resolve_shared "${file}")"
  if [[ -z "${project}" ]]; then
    project="${COMPOSE_PROJECT_NAME:-${shared}}"
  fi

  local mutating=0 v
  for v in ${MUTATING}; do
    if [[ "${verb}" == "${v}" ]]; then mutating=1; break; fi
  done

  if [[ "${mutating}" -eq 0 && "${volumes}" -eq 0 ]]; then
    pass "read-only '${verb:-<none>}' against '${project:-<default>}'"
    return 0
  fi
  if [[ -z "${project}" || -z "${shared}" ]]; then
    # Fail closed: no -p and no determinable shared name — the
    # invocation would land on the ambient default project.
    if [[ -z "${project}" ]]; then
      fail "mutating '${verb}' with no isolated -p (shared project '${shared:-unknown}'); rerun with -p <isolated>-<session>"
    fi
  fi
  if [[ -n "${shared}" && "${project}" == "${shared}" ]]; then
    fail "mutating '${verb}' targets the shared project '${shared}'; rerun with -p <isolated>-<session> and isolated volumes"
  fi
  pass "mutating '${verb}' against isolated project '${project}'"
}

self_test() {
  echo "compose-lab-guard --self-test"
  local pass_n=0 fail_n=0
  # Hermetic fixture: a temp compose file with a known shared name,
  # so the self-test holds in any checkout (live or installed).
  local fix
  fix="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${fix}'" EXIT
  printf 'name: labguard-shared-test\nservices:\n  db:\n    image: postgres:16-alpine\n' >"${fix}/compose.yaml"
  local shared_file="${fix}/compose.yaml"
  local shared
  shared="$(resolve_shared "${shared_file}")"
  expect_refuse() {
    local name="$1"; shift
    if bash "${BASH_SOURCE[0]}" -- "$@" >/dev/null 2>&1; then
      echo "FAIL: ${name} stayed green (should refuse)"; fail_n=$((fail_n + 1))
    else
      echo "  OK ${name} correctly refused"; pass_n=$((pass_n + 1))
    fi
  }
  expect_allow() {
    local name="$1"; shift
    if bash "${BASH_SOURCE[0]}" -- "$@" >/dev/null 2>&1; then
      echo "  OK ${name} correctly allowed"; pass_n=$((pass_n + 1))
    else
      echo "FAIL: ${name} refused (should allow)"; fail_n=$((fail_n + 1))
    fi
  }
  expect_refuse "bare-down-on-shared" -f "${shared_file}" down
  expect_refuse "shared-down-volumes" -f "${shared_file}" down -v
  expect_refuse "explicit-shared-up" -p "${shared}" -f "${shared_file}" up -d --build
  expect_refuse "shared-teardown" -f "${shared_file}" teardown
  expect_allow "isolated-up" -p hotel-lab-selftest -f "${shared_file}" up -d --build
  expect_allow "isolated-down-volumes" -p hotel-lab-selftest -f "${shared_file}" down -v
  expect_allow "shared-readonly-ps" -f "${shared_file}" ps
  echo "test result: ${pass_n} passed, ${fail_n} failed"
  [[ "${fail_n}" -eq 0 ]]
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi
if [[ "${1:-}" != "--" ]]; then
  echo "usage: $0 -- <compose args...> | $0 --self-test" >&2
  exit 1
fi
shift
guard "$@"
