#!/usr/bin/env bash
#
# OpenAPI route-drift gate (issue #228).
#
# Fails closed when the curated desk-loop spec drifts:
# 1. frontend/docs/openapi.yaml (served at /docs) must be
#    byte-identical to contracts/openapi.yaml (single source).
# 2. Every spec path+method must resolve to a contracts/http/*.json
#    operation whose transport method and path match exactly
#    (the transport entries are the route source of truth the
#    services and the proxy implement).
#
# Static only (no docker): live reachability stays covered by
# script/e2e-desk-loop.sh. Called from script/contract-check.sh and
# therefore from the CI contract-check job.
#
# Usage: script/openapi-route-check.sh (run from anywhere; resolves repo root).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/contracts/openapi.yaml"
MIRROR="$ROOT/frontend/docs/openapi.yaml"
fail=0

if [[ ! -f "$SOURCE" ]]; then
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
if python3 - "$ROOT" <<'PYEOF'
import json
import sys

import yaml

root = sys.argv[1]
with open(f"{root}/contracts/openapi.yaml", encoding="utf-8") as fh:
    spec = yaml.safe_load(fh)

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

if failures:
    for f in failures:
        print(f"  FAIL {f}")
    sys.exit(1)
print(f"  OK {len(seen_ops)} spec operation(s) resolve to contract routes")
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
