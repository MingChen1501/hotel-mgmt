#!/usr/bin/env bash
#
# One-hotel end-to-end installer for the single-host default sale
# (issue #153).
#
# Implements docs/devops/deployment.md section 3 steps 1-7 by
# sequencing the existing gates: the pre-flight check (fails closed
# on default secrets, placeholder or malformed configuration, and
# unmet host minimums) followed by the desk-loop proof (book ->
# check in -> post a charge -> check out -> backup -> restore drill
# -> re-verify), leaving the stack up for handover. The Ansible
# playbook (deploy/ansible/playbook.yaml) stays the offline-friendly
# alternative for the same steps; this script is the single command
# for the container-lab and hotel-like-hardware path.
#
# Unlike script/e2e-desk-loop.sh on its own, the installer requires
# the hotel's own configuration set to exist: a pilot install
# without the property's identity, times, rooms, rates, and policies
# is not a working single-hotel deployment (NFR-DEP-1).
#
# Usage (from the repo root, with the hotel's configuration set ready):
#   cp deploy/config/hotel.example.json deploy/config/hotel.json
#   ${EDITOR:-vi} deploy/config/hotel.json   # hotel's own values; never commit real hotel data
#   DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
#     script/install.sh [--config deploy/config/hotel.json] \
#     [--staging-dir ./backup-staging] [--base-url http://127.0.0.1]
#
# Never prints secret values, only which variable failed.

set -euo pipefail

CONFIG="deploy/config/hotel.json"
STAGING_DIR="./backup-staging"
BASE_URL="http://127.0.0.1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="${2:?--config needs a path}"; shift 2 ;;
    --staging-dir)
      STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
    --base-url)
      BASE_URL="${2:?--base-url needs a URL}"; shift 2 ;;
    *)
      echo "install: unknown argument: $1" >&2
      echo "usage: script/install.sh [--config PATH] [--staging-dir DIR] [--base-url URL]" >&2
      exit 2 ;;
  esac
done

ROOT="$(dirname "$0")/.."

if [[ ! -f "$CONFIG" ]]; then
  echo "install: FAIL: hotel configuration set $CONFIG not found;" >&2
  echo "install: copy deploy/config/hotel.example.json to $CONFIG and fill in the hotel's own values first (deployment.md section 2)." >&2
  exit 1
fi

echo "install: === step 1/3: pre-flight (fails closed) ==="
DB_PASSWORD="${DB_PASSWORD:-}" ADMIN_BOOT_SECRET="${ADMIN_BOOT_SECRET:-}" \
  "$ROOT/script/preflight.sh" --config "$CONFIG" --staging-dir "$STAGING_DIR"

echo "install: === step 2/3: install proof (desk loop + backup + restore drill, stack stays up) ==="
DB_PASSWORD="${DB_PASSWORD:-}" ADMIN_BOOT_SECRET="${ADMIN_BOOT_SECRET:-}" \
  "$ROOT/script/e2e-desk-loop.sh" --base-url "$BASE_URL" \
  --staging-dir "$STAGING_DIR" --hotel-config "$CONFIG" --keep-up

echo "install: === step 3/3: handover state ==="
REPORT=""
for candidate in "$STAGING_DIR"/hotel-*.report.json; do
  [[ -f "$candidate" ]] || continue
  # The restore-drill reports ride beside the backup reports; the
  # handover state wants the backup report itself.
  [[ "$candidate" == *-restore-drill.report.json ]] && continue
  if [[ -z "$REPORT" || "$candidate" -nt "$REPORT" ]]; then
    REPORT="$candidate"
  fi
done
if [[ -n "$REPORT" ]]; then
  echo "install: newest backup report: $REPORT"
else
  echo "install: FAIL: no backup report in $STAGING_DIR; the install proof did not finish its backup step." >&2
  exit 1
fi

echo "install: EVIDENCE: single-hotel deployment is up at $BASE_URL with the set from $CONFIG applied;"
echo "install: EVIDENCE: desk-loop proof passed (book -> check-in -> charge -> check-out -> backup -> restore drill -> re-verify);"
echo "install: EVIDENCE: first backup report $REPORT."
echo "install: NEXT: walk the runbook with the manager (docs/operations/runbook.md), record the handover"
echo "install: NEXT: in docs/operations/pilot-exit-checklist.md, and leave the stack running for the pilot day."
echo "install: SUCCEEDED."
