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

# shellcheck disable=SC1091
source "$(dirname "$0")/messages.sh"

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
  local key="$1" fallback="$2"
  shift 2
  echo "$(msg "script.runbook.preflight_fail" "preflight: FAIL: {item}" item="$(msg "$key" "$fallback" "$@")")" >&2
  fail=1
}
pass_msg() {
  local key="$1" fallback="$2"
  shift 2
  echo "$(msg "script.runbook.preflight_ok" "preflight: OK: {item}" item="$(msg "$key" "$fallback" "$@")")"
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
  fail_msg "script.runbook.preflight_db_default" "DB_PASSWORD is unset or still a dev default; set the per-sale database secret (deployment.md section 2)."
else
  pass_msg "script.runbook.preflight_db_set" "DB_PASSWORD is set to a non-default value."
fi

if is_default_secret "${ADMIN_BOOT_SECRET:-}"; then
  fail_msg "script.runbook.preflight_boot_default" "ADMIN_BOOT_SECRET is unset or still a dev default; provision the per-sale owner boot secret (deployment.md section 2)."
else
  pass_msg "script.runbook.preflight_boot_set" "ADMIN_BOOT_SECRET is set to a non-default value."
fi

# 2. The per-hotel configuration set validates against the release
# bundle's configuration schema (deployment.md section 5; issue
# #158). The shared validator checks the full section-2 set — hotel
# identity present and never the EXAMPLE placeholder, standard times
# well-formed, room/rate/charge sections non-empty with references
# that resolve, stay policies complete, retention floor honoured —
# and fails closed on any default, placeholder, or malformed value.
if "$(dirname "$0")/validate-hotel-config.sh" --config "$CONFIG"; then
  pass_msg "script.runbook.preflight_config_ok" "configuration set {config} validates against deploy/config/schema.json." config="$CONFIG"
else
  fail_msg "script.runbook.preflight_config_bad" "configuration set {config} fails validation; see deploy/config/schema.json." config="$CONFIG"
fi

# 3. Fresh verification state only: covered by the validator above
# (EXAMPLE-001 placeholder refusal), kept as an explicit gate so the
# failure names the placeholder directly.
if [[ -f "$CONFIG" ]] && grep -q "EXAMPLE-001" "$CONFIG" 2>/dev/null; then
  fail_msg "script.runbook.preflight_example" "configuration set {config} still carries the EXAMPLE-001 placeholder; fill in the hotel's own values." config="$CONFIG"
else
  pass_msg "script.runbook.preflight_config_own" "configuration set carries the hotel's own property values."
fi

# 4. Host sizing meets the 2*4*50 minimum (deployment.md section 5).
if command -v nproc >/dev/null 2>&1; then
  if [[ "$(nproc)" -lt 2 ]]; then
    fail_msg "script.runbook.preflight_cpu_few" "host has fewer than 2 vCPUs (2*4*50 minimum)."
  else
    pass_msg "script.runbook.preflight_cpu_ok" "host CPU count meets the 2 vCPU minimum."
  fi
fi
if [[ -r /proc/meminfo ]]; then
  mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  if [[ "$mem_kb" -lt 4000000 ]]; then
    fail_msg "script.runbook.preflight_mem_few" "host has less than 4 GB RAM (2*4*50 minimum)."
  else
    pass_msg "script.runbook.preflight_mem_ok" "host memory meets the 4 GB minimum."
  fi
fi

# 5. Tooling for the installer path is present.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  pass_msg "script.runbook.preflight_docker_ok" "docker compose is available."
else
  fail_msg "script.runbook.preflight_docker_missing" "docker with the compose plugin is required on the host."
fi

# 6. A blank (or existing) backup target is reachable and writable,
# and no backup or restore job is in progress (deployment.md
# sections 3 and 5).
if [[ -d "$STAGING_DIR" ]]; then
  if [[ -w "$STAGING_DIR" ]]; then
    pass_msg "script.runbook.preflight_target_ok" "backup target {dir} is reachable and writable." dir="$STAGING_DIR"
  else
    fail_msg "script.runbook.preflight_target_readonly" "backup target {dir} is not writable." dir="$STAGING_DIR"
  fi
else
  if mkdir -p "$STAGING_DIR" 2>/dev/null && [[ -w "$STAGING_DIR" ]]; then
    pass_msg "script.runbook.preflight_target_created" "backup target {dir} created and writable." dir="$STAGING_DIR"
  else
    fail_msg "script.runbook.preflight_target_failed" "backup target {dir} cannot be created or written." dir="$STAGING_DIR"
  fi
fi
if [[ -e "$STAGING_DIR/.backup-in-progress" || -e "$STAGING_DIR/.restore-in-progress" ]]; then
  fail_msg "script.runbook.preflight_job_busy" "a backup or restore job is already in progress in {dir}." dir="$STAGING_DIR"
else
  pass_msg "script.runbook.preflight_job_idle" "no backup or restore job is in progress."
fi

if [[ "$fail" -ne 0 ]]; then
  echo "$(msg "script.runbook.preflight_failed" "preflight: FAILED — fix the items above and re-run.")" >&2
  exit 1
fi
echo "$(msg "script.runbook.preflight_passed" "preflight: PASSED.")"
