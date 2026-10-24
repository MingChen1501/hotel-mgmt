#!/usr/bin/env bash
#
# Owner-runnable POC demonstration for the desk loop (issue #185).
#
# Thin narrator over the existing deployment-path gates — not a new
# installer: step 1 runs script/preflight.sh (fails closed on default
# secrets, placeholder or malformed configuration, and unmet host
# minimums), step 2 runs script/e2e-desk-loop.sh with the stack left
# up (book -> check in -> post charges -> check out with folio
# review -> backup -> restore drill -> re-verify), and step 3
# collects the artefact locations from that run. Prints a per-step
# PASS/FAIL summary at the end; any failure fails closed with a
# named cause. The pass/fail checklist the owner walks is in
# docs/operations/demo-poc-checklist.md.
#
# Usage (from the repo root, with the hotel's configuration set ready):
#   cp deploy/config/hotel.example.json deploy/config/hotel.json
#   ${EDITOR:-vi} deploy/config/hotel.json   # hotel's own values; never commit real hotel data
#   DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
#     script/demo-poc.sh [--config deploy/config/hotel.json] \
#     [--staging-dir ./backup-staging] [--base-url http://127.0.0.1] \
#     [--log-file ./backup-staging/demo-poc.log]
#
# Never prints secret values, only which variable failed.

set -euo pipefail

CONFIG="deploy/config/hotel.json"
STAGING_DIR="./backup-staging"
BASE_URL="http://127.0.0.1"
LOG_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="${2:?--config needs a path}"; shift 2 ;;
    --staging-dir)
      STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
    --base-url)
      BASE_URL="${2:?--base-url needs a URL}"; shift 2 ;;
    --log-file)
      LOG_FILE="${2:?--log-file needs a path}"; shift 2 ;;
    *)
      echo "demo-poc: unknown argument: $1" >&2
      echo "usage: script/demo-poc.sh [--config PATH] [--staging-dir DIR] [--base-url URL] [--log-file PATH]" >&2
      exit 2 ;;
  esac
done

ROOT="$(dirname "$0")/.."
if [[ -z "$LOG_FILE" ]]; then
  LOG_FILE="$STAGING_DIR/demo-poc.log"
fi

# Per-step results for the closing summary.
PREFLIGHT_RESULT="NOT RUN"
DESKLOOP_RESULT="NOT RUN"
ARTEFACTS_RESULT="NOT RUN"
FAIL_CAUSE=""

fail_closed() {
  echo "demo-poc: FAIL: $1" >&2
  FAIL_CAUSE="$1"
}

mkdir -p "$(dirname "$LOG_FILE")" "$STAGING_DIR" 2>/dev/null \
  || { fail_closed "log/staging dirs not writable (log $LOG_FILE, staging $STAGING_DIR)"; exit 1; }

echo "demo-poc: === step 1/3: pre-flight (fails closed) ===" | tee "$LOG_FILE"
if DB_PASSWORD="${DB_PASSWORD:-}" ADMIN_BOOT_SECRET="${ADMIN_BOOT_SECRET:-}" \
  "$ROOT/script/preflight.sh" --config "$CONFIG" --staging-dir "$STAGING_DIR" 2>&1 | tee -a "$LOG_FILE"; then
  PREFLIGHT_RESULT="PASS"
  echo "demo-poc: PASS: pre-flight (fail-closed entry gate)." | tee -a "$LOG_FILE"
else
  PREFLIGHT_RESULT="FAIL"
  fail_closed "pre-flight refused (see $LOG_FILE for the named cause: secret, config, host, tooling, or backup target)"
fi

if [[ "$PREFLIGHT_RESULT" == "PASS" ]]; then
  echo "demo-poc: === step 2/3: desk loop proof (book -> check-in -> charges -> check-out -> backup -> restore drill -> re-verify, stack stays up) ===" | tee -a "$LOG_FILE"
  if DB_PASSWORD="${DB_PASSWORD:-}" ADMIN_BOOT_SECRET="${ADMIN_BOOT_SECRET:-}" \
    "$ROOT/script/e2e-desk-loop.sh" --base-url "$BASE_URL" \
    --staging-dir "$STAGING_DIR" --hotel-config "$CONFIG" --keep-up 2>&1 | tee -a "$LOG_FILE"; then
    DESKLOOP_RESULT="PASS"
    echo "demo-poc: PASS: desk loop (book -> check-in -> charges -> check-out -> backup -> restore drill -> re-verify)." | tee -a "$LOG_FILE"
  else
    DESKLOOP_RESULT="FAIL"
    fail_closed "desk loop failed (see $LOG_FILE for the first 'e2e: FAIL:' line)"
  fi
fi

# Step 3 runs only when the loop passed: locate the artefacts the
# checklist asks the owner to open (invoice/receipt ids from the
# loop's EVIDENCE line, newest backup and drill reports).
EVIDENCE=""
BACKUP_REPORT=""
DRILL_REPORT=""
if [[ "$DESKLOOP_RESULT" == "PASS" ]]; then
  echo "demo-poc: === step 3/3: artefact locations ===" | tee -a "$LOG_FILE"
  EVIDENCE="$(grep -E '^e2e: EVIDENCE:' "$LOG_FILE" | tail -n 1 || true)"
  for candidate in "$STAGING_DIR"/hotel-*.report.json; do
    [[ -f "$candidate" ]] || continue
    [[ "$candidate" == *-restore-drill.report.json ]] && continue
    if [[ -z "$BACKUP_REPORT" || "$candidate" -nt "$BACKUP_REPORT" ]]; then
      BACKUP_REPORT="$candidate"
    fi
  done
  for candidate in "$STAGING_DIR"/hotel-*-restore-drill.report.json; do
    [[ -f "$candidate" ]] || continue
    if [[ -z "$DRILL_REPORT" || "$candidate" -nt "$DRILL_REPORT" ]]; then
      DRILL_REPORT="$candidate"
    fi
  done
  if [[ -z "$EVIDENCE" ]]; then
    ARTEFACTS_RESULT="FAIL"
    fail_closed "artefact collection found no e2e EVIDENCE line in $LOG_FILE"
  elif [[ -z "$BACKUP_REPORT" ]]; then
    ARTEFACTS_RESULT="FAIL"
    fail_closed "artefact collection found no backup report in $STAGING_DIR"
  elif [[ -z "$DRILL_REPORT" ]]; then
    ARTEFACTS_RESULT="FAIL"
    fail_closed "artefact collection found no restore-drill report in $STAGING_DIR"
  else
    ARTEFACTS_RESULT="PASS"
    echo "demo-poc: PASS: artefacts located." | tee -a "$LOG_FILE"
  fi
fi

echo "demo-poc: ===== PASS/FAIL summary =====" | tee -a "$LOG_FILE"
echo "demo-poc: pre-flight: $PREFLIGHT_RESULT" | tee -a "$LOG_FILE"
echo "demo-poc: desk loop:  $DESKLOOP_RESULT" | tee -a "$LOG_FILE"
echo "demo-poc: artefacts:  $ARTEFACTS_RESULT" | tee -a "$LOG_FILE"
if [[ "$ARTEFACTS_RESULT" == "PASS" ]]; then
  echo "demo-poc: full log:  $LOG_FILE" | tee -a "$LOG_FILE"
  echo "demo-poc: $EVIDENCE" | tee -a "$LOG_FILE"
  echo "demo-poc: backup report: $BACKUP_REPORT (open it: outcome must be success)" | tee -a "$LOG_FILE"
  echo "demo-poc: drill report:  $DRILL_REPORT (open it: outcome success, withinBudget true)" | tee -a "$LOG_FILE"
  echo "demo-poc: invoice/receipt: the EVIDENCE line above carries the invoice (folio) id; the desk prints the invoice and the cash receipt from that folio and its payment (docs/operations/demo-poc-checklist.md step 6)." | tee -a "$LOG_FILE"
fi

if [[ -n "$FAIL_CAUSE" ]]; then
  echo "demo-poc: RESULT: FAIL: $FAIL_CAUSE" | tee -a "$LOG_FILE"
  exit 1
fi

echo "demo-poc: RESULT: PASS: desk loop demonstrated end to end; stack left up for the owner walkthrough." | tee -a "$LOG_FILE"
echo "demo-poc: SUCCEEDED."
