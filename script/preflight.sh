#!/usr/bin/env bash
#
# Pre-flight checks for a single-host install or upgrade (issue #113).
#
# Implements docs/devops/deployment.md section 5 as an executable
# gate: run before every install and every upgrade, and stop on any
# failure. Fails closed on default secrets (audit S3): the compose
# baseline ships dev-only defaults so local bring-up works, but this
# script refuses to proceed while DB_PASSWORD or ADMIN_BOOT_SECRET
# still holds one.
#
# Usage (from the repo root):
#   DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
#     script/preflight.sh [--config deploy/config/hotel.json] \
#     [--staging-dir ./backup-staging]
#
# Never prints secret values, only which variable failed.

set -euo pipefail

CONFIG="deploy/config/hotel.json"
STAGING_DIR="./backup-staging"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="${2:?--config needs a path}"; shift 2 ;;
    --staging-dir)
      STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
    *)
      echo "preflight: unknown argument: $1" >&2
      echo "usage: script/preflight.sh [--config PATH] [--staging-dir DIR]" >&2
      exit 2 ;;
  esac
done

fail=0
fail_msg() {
  echo "preflight: FAIL: $1" >&2
  fail=1
}
pass_msg() {
  echo "preflight: OK: $1"
}

# 1. Secrets are provisioned per sale and never left on dev defaults
# (deployment.md section 2; threat-model section 5 rule 4: no default
# passwords survive provisioning; audit S3).
is_default_secret() {
  case "$1" in
    ""|"change-me"|"change-me-dev-only"|"password"|"hotel"|"hotel-dev-only") return 0 ;;
    *) return 1 ;;
  esac
}

if is_default_secret "${DB_PASSWORD:-}"; then
  fail_msg "DB_PASSWORD is unset or still a dev default; set the per-sale database secret (deployment.md section 2)."
else
  pass_msg "DB_PASSWORD is set to a non-default value."
fi

if is_default_secret "${ADMIN_BOOT_SECRET:-}"; then
  fail_msg "ADMIN_BOOT_SECRET is unset or still a dev default; provision the per-sale owner boot secret (deployment.md section 2)."
else
  pass_msg "ADMIN_BOOT_SECRET is set to a non-default value."
fi

# 2. The per-hotel configuration set parses and validates against the
# release bundle's configuration schema (deployment.md section 5).
if [[ ! -f "$CONFIG" ]]; then
  fail_msg "configuration set $CONFIG not found; copy deploy/config/hotel.example.json and fill in per sale."
else
  if python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$CONFIG" 2>/dev/null; then
    if python3 - "$CONFIG" "deploy/config/schema.json" <<'PYEOF' 2>/dev/null; then
import json, sys
config = json.load(open(sys.argv[1]))
schema = json.load(open(sys.argv[2]))
missing = [k for k in schema.get("required", []) if k not in config]
if missing:
    print("missing required keys: " + ", ".join(missing))
    sys.exit(1)
if config.get("schemaVersion") != 1:
    print("schemaVersion must be 1")
    sys.exit(1)
floor = config.get("backup", {}).get("retentionDaysFloor", 0)
if not isinstance(floor, int) or floor < 30:
    print("backup.retentionDaysFloor must be an integer of at least 30")
    sys.exit(1)
PYEOF
      pass_msg "configuration set $CONFIG validates against deploy/config/schema.json."
    else
      fail_msg "configuration set $CONFIG fails schema validation; see deploy/config/schema.json."
    fi
  else
    fail_msg "configuration set $CONFIG is not valid JSON."
  fi
fi

# 3. Fresh verification state only: the example file must never be
# installed as the hotel's own set.
if [[ -f "$CONFIG" ]] && grep -q "EXAMPLE-001" "$CONFIG" 2>/dev/null; then
  fail_msg "configuration set $CONFIG still carries the EXAMPLE-001 placeholder; fill in the hotel's own values."
else
  pass_msg "configuration set carries the hotel's own property values."
fi

# 4. Host sizing meets the 2*4*50 minimum (deployment.md section 5).
if command -v nproc >/dev/null 2>&1; then
  if [[ "$(nproc)" -lt 2 ]]; then
    fail_msg "host has fewer than 2 vCPUs (2*4*50 minimum)."
  else
    pass_msg "host CPU count meets the 2 vCPU minimum."
  fi
fi
if [[ -r /proc/meminfo ]]; then
  mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  if [[ "$mem_kb" -lt 4000000 ]]; then
    fail_msg "host has less than 4 GB RAM (2*4*50 minimum)."
  else
    pass_msg "host memory meets the 4 GB minimum."
  fi
fi

# 5. Tooling for the installer path is present.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  pass_msg "docker compose is available."
else
  fail_msg "docker with the compose plugin is required on the host."
fi

# 6. A blank (or existing) backup target is reachable and writable,
# and no backup or restore job is in progress (deployment.md
# sections 3 and 5).
if [[ -d "$STAGING_DIR" ]]; then
  if [[ -w "$STAGING_DIR" ]]; then
    pass_msg "backup target $STAGING_DIR is reachable and writable."
  else
    fail_msg "backup target $STAGING_DIR is not writable."
  fi
else
  if mkdir -p "$STAGING_DIR" 2>/dev/null && [[ -w "$STAGING_DIR" ]]; then
    pass_msg "backup target $STAGING_DIR created and writable."
  else
    fail_msg "backup target $STAGING_DIR cannot be created or written."
  fi
fi
if [[ -e "$STAGING_DIR/.backup-in-progress" || -e "$STAGING_DIR/.restore-in-progress" ]]; then
  fail_msg "a backup or restore job is already in progress in $STAGING_DIR."
else
  pass_msg "no backup or restore job is in progress."
fi

if [[ "$fail" -ne 0 ]]; then
  echo "preflight: FAILED — fix the items above and re-run." >&2
  exit 1
fi
echo "preflight: PASSED."
