#!/usr/bin/env bash
#
# Thin shell loader for the shared message catalogue (NFR-I18N-1,
# issue #201). Resolves user-visible runbook wording from
# messages/en.json so the scripts print the catalogue strings:
# default-locale output is byte-identical, and behaviour never
# branches on wording (callers check exit codes, not text).
#
# Usage: msg "<key>" "<fallback>" [name=value ...]
# Prints the catalogue pattern for key with each {name} placeholder
# replaced by its value. When the catalogue is unreadable, the key
# is missing, or python3 is unavailable, prints the fallback
# unchanged so the scripts keep working. Patterns use {name}
# placeholders substituted verbatim; numbers stay ungrouped so the
# default-locale rendering matches the legacy literals exactly.
#
# Keep every msg call on one line with literal key and fallback
# strings: script/catalogue-coverage-check.sh samples them.
#
# Sourced, never executed: source "$(dirname "$0")/messages.sh".

if [[ -z "${_MSG_CATALOGUE_FILE:-}" ]]; then
  _MSG_CATALOGUE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)/messages/en.json"
fi

msg() {
  local key="$1" fallback="$2"
  shift 2
  if command -v python3 >/dev/null 2>&1 && [[ -f "$_MSG_CATALOGUE_FILE" ]]; then
    local rendered
    if rendered="$(python3 - "$_MSG_CATALOGUE_FILE" "$key" "$fallback" "$@" <<'PYEOF'
import json, sys
catalogue_path, key, fallback, assignments = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
try:
    catalogue = json.load(open(catalogue_path, encoding="utf-8"))["messages"]
except (OSError, ValueError, KeyError):
    print(fallback)
else:
    pattern = catalogue.get(key, fallback)
    for assignment in assignments:
        name, _, value = assignment.partition("=")
        pattern = pattern.replace("{" + name + "}", value)
    print(pattern)
PYEOF
)"; then
      printf '%s' "$rendered"
      return 0
    fi
  fi
  printf '%s' "$fallback"
}
