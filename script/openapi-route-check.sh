#!/usr/bin/env bash
#
# OpenAPI route-drift gate (issues #228, #241).
#
# Fails closed when the curated desk-loop spec drifts:
# 1. frontend/docs/openapi.yaml (served at /docs) must be
#    byte-identical to contracts/openapi.yaml (single source).
# 2. Every spec path+method must resolve to a contracts/http/*.json
#    operation whose transport method and path match exactly
#    (the transport entries are the route source of truth the
#    services and the proxy implement).
# 3. The spec operationId set must equal the curated 14-op set
#    pinned below (issue #241): an added op or a silently
#    deleted op fails the gate with a named cause.
# 4. A served mirror without its contracts/openapi.yaml source
#    fails instead of SKIP-passing (issue #241).
# 5. Neither file may carry a duplicate mapping key (issue #768): a
#    last-key-wins loader silently discards the earlier sibling, so
#    every duplicate is reported with its key path and both
#    file:line positions before the route assertions run.
#
# Static only (no docker): live reachability stays covered by
# script/e2e-desk-loop.sh. Called from script/contract-check.sh and
# therefore from the CI contract-check job. The duplicate-key
# detector's own proof lives in script/openapi-route-check.test.sh.
#
# Usage: script/openapi-route-check.sh [--root <dir>]
#   --root defaults to the repo root around this script; the self-test
#   points it at a throwaway fixture tree.

set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$SCRIPT_ROOT"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 && -d "$2" ]] || { echo "openapi-route-check: --root needs an existing directory" >&2; exit 2; }
      ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    -h|--help)
      echo "Usage: script/openapi-route-check.sh [--root <dir>]"
      exit 0
      ;;
    *)
      echo "openapi-route-check: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done
SOURCE="$ROOT/contracts/openapi.yaml"
MIRROR="$ROOT/frontend/docs/openapi.yaml"
fail=0

if [[ ! -f "$SOURCE" ]]; then
  if [[ -f "$MIRROR" ]]; then
    echo "openapi-route-check: FAIL — orphaned served mirror $MIRROR exists without its source $SOURCE."
    echo "  (restore contracts/openapi.yaml; the mirror must never outlive its single source)"
    exit 1
  fi
  echo "openapi-route-check: SKIP — no contracts/openapi.yaml yet. Nothing to check."
  exit 0
fi
if [[ ! -f "$MIRROR" ]]; then
  echo "openapi-route-check: FAIL — served mirror $MIRROR missing (expected at /docs)."
  exit 1
fi

echo "openapi-route-check: asserting the served mirror is byte-identical..."
if cmp -s "$SOURCE" "$MIRROR"; then
  echo "  OK contracts/openapi.yaml == frontend/docs/openapi.yaml"
else
  echo "  FAIL served mirror differs from contracts/openapi.yaml:"
  cmp "$SOURCE" "$MIRROR" | head -n 20 || true
  echo "  (edit contracts/openapi.yaml, then copy it to frontend/docs/openapi.yaml)"
  fail=1
fi

echo "openapi-route-check: asserting every spec route resolves to a contract route..."
if ! python3 -c 'import yaml' 2>/dev/null; then
  echo "  (pyyaml missing — installing for this check...)"
  if ! python3 -m pip install --quiet pyyaml; then
    echo "  FAIL cannot parse YAML: pyyaml unavailable and pip install failed."
    exit 1
  fi
fi
echo "openapi-route-check: asserting neither spec copy carries a duplicate mapping key..."
if python3 - "$SOURCE" "$MIRROR" <<'PYEOF'
import sys

import yaml


def walk(node, path, findings):
    """Report duplicate mapping keys with both positions and the key path.

    yaml.compose keeps every key/value pair from the source (unlike
    yaml.safe_load, which silently keeps the last duplicate), so the
    composed node tree is enough to find them without a custom loader.
    """
    if isinstance(node, yaml.MappingNode):
        seen = {}
        for key_node, value_node in node.value:
            if isinstance(key_node, yaml.ScalarNode):
                key = key_node.value
                line = key_node.start_mark.line + 1
                if key in seen:
                    findings.append((key, line, seen[key], ".".join(path + [str(key)])))
                else:
                    seen[key] = line
                child_path = path + [str(key)]
            else:
                child_path = path + ["<complex key>"]
            walk(value_node, child_path, findings)
    elif isinstance(node, yaml.SequenceNode):
        for index, child in enumerate(node.value):
            walk(child, path + [str(index)], findings)


failures = []
for filename in sys.argv[1:]:
    with open(filename, encoding="utf-8") as fh:
        root = yaml.compose(fh, Loader=yaml.SafeLoader)
    findings = []
    walk(root, [], findings)
    for key, line, first_line, key_path in findings:
        failures.append(
            f"duplicate mapping key {key!r} at {filename}:{line} "
            f"(first defined at {filename}:{first_line}); key path: {key_path}"
        )

if failures:
    for finding in failures:
        print(f"  FAIL {finding}")
    sys.exit(1)
print("  OK no duplicate mapping keys in either spec copy")
PYEOF
then
  :
else
  fail=1
fi

if python3 - "$ROOT" <<'PYEOF'
import json
import sys

import yaml

root = sys.argv[1]
with open(f"{root}/contracts/openapi.yaml", encoding="utf-8") as fh:
    spec = yaml.safe_load(fh)

# Curated desk-loop op set (issue #241): the gate pins these 14
# operationIds and fails on any added or removed op by name.
expected = frozenset({
    "SignIn",
    "QuotePrice",
    "CreateReservation",
    "GetReservation",
    "AssignRoom",
    "CheckIn",
    "CheckInReservation",
    "PostCharge",
    "RecordPayment",
    "GetFolioBalance",
    "ProduceInvoice",
    "RecordOpenBalanceApproval",
    "CheckOut",
    "ProduceReceipt",
})

assert isinstance(spec, dict) and str(spec.get("openapi", "")).startswith("3.0."), "spec must be OpenAPI 3.0.x"
paths = spec.get("paths", {})
assert paths, "spec defines no paths"

known = {}
for name_path in __import__("glob").glob(f"{root}/contracts/http/*.json"):
    with open(name_path, encoding="utf-8") as fh:
        c = json.load(fh)
    known[c["operation"]] = c["transport"]

failures = []
seen_ops = set()
for path, item in sorted(paths.items()):
    for method, entry in sorted(item.items()):
        if method.lower() != "post":
            failures.append(f"{method.upper()} {path}: only POST desk-loop routes are curated, want POST")
            continue
        op = (entry or {}).get("operationId", "")
        if not op:
            failures.append(f"{method.upper()} {path}: missing operationId")
            continue
        if op in seen_ops:
            failures.append(f"{method.upper()} {path}: duplicate operationId '{op}'")
        seen_ops.add(op)
        if op not in known:
            failures.append(f"{method.upper()} {path}: operationId '{op}' names no contracts/http/{op}.json")
            continue
        t = known[op]
        if t.get("method", "").upper() != "POST" or t.get("path") != path:
            failures.append(
                f"POST {path}: drift — contracts/http/{op}.json declares "
                f"{t.get('method')} {t.get('path')}"
            )

for op in sorted(seen_ops - set(expected)):
    failures.append(f"unexpected operationId '{op}': not in the curated 14-op set (issue #241)")
for op in sorted(set(expected) - seen_ops):
    failures.append(f"missing curated operation '{op}': removed from the spec but still expected (issue #241)")

if failures:
    for f in failures:
        print(f"  FAIL {f}")
    sys.exit(1)
print(f"  OK {len(seen_ops)} spec operation(s) match the curated 14-op set and resolve to contract routes")
PYEOF
then
  :
else
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "openapi-route-check: FAILED."
  exit 1
fi
echo "openapi-route-check: PASSED."
