#!/usr/bin/env bash
#
# Full backup of the shared database engine (issue #113).
#
# Implements the daily full backup behind docs/operations/backup-dr.md
# sections 1-2 and the install/upgrade backups in
# docs/devops/deployment.md sections 3-4. Every run writes a visible
# success-or-failure report beside the artifact (backup-dr section 4,
# NFR-BKP-2: a backup without a success report counts as failed), in
# the runbook's plain words (runbook.md section 2).
#
# Skeleton scope: the shared engine holds the module schemas, the
# seed rows, and the per-hotel configuration rows. Module service
# rows persist in Postgres (issue #149), so this drill proves the
# mechanism (artifact, verification read-back, report, timing) and
# the desk-state restore (see script/restore.sh and the restore drill
# report).
#
# Usage (from the repo root, stack already up):
#   DB_PASSWORD=<secret> script/backup.sh [--staging-dir DIR] [--label NAME]
#
# Never prints secret values.

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/messages.sh"

STAGING_DIR="./backup-staging"
LABEL="daily"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staging-dir)
      STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
    --label)
      LABEL="${2:?--label needs a name}"; shift 2 ;;
    *)
      echo "backup: unknown argument: $1" >&2
      echo "usage: script/backup.sh [--staging-dir DIR] [--label NAME]" >&2
      exit 2 ;;
  esac
done

COMPOSE=(docker compose -f deploy/compose.yaml)
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="$STAGING_DIR/hotel-$STAMP-$LABEL.sql"
REPORT_FILE="$STAGING_DIR/hotel-$STAMP-$LABEL.report.json"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

write_report() {
  local outcome="$1" reason="$2" bytes="$3" finished_at="$4"
  # All fields travel as argv into a quoted heredoc (no shell
  # interpolation into Python source), so failure reasons keep
  # their cause verbatim and stay valid JSON (NFR-BKP-2: every run
  # produces a visible success-or-failure report).
  python3 - "$REPORT_FILE" "$outcome" "$STARTED_AT" "$finished_at" "$DUMP_FILE" "$bytes" "$reason" <<'PYEOF'
import json, sys
_, report_file, outcome, started_at, finished_at, artifact, raw_bytes, reason = sys.argv
report = {
    "outcome": outcome,
    "startedAt": started_at,
    "finishedAt": finished_at,
    "artifact": artifact,
    "bytes": int(raw_bytes),
    "verifiedReadBack": outcome == "success",
    "reason": reason,
}
json.dump(report, open(report_file, "w"), indent=2)
PYEOF
}

# Every run surfaces its report on the desk screen (issue #116):
# the publisher never masks the backup outcome, so it runs guarded.
publish_desk_report() {
  script/publish-backup-report.sh --staging-dir "$STAGING_DIR" \
    || echo "$(msg "script.runbook.backup_warning" "backup: WARNING: the desk surface was not refreshed; the report above is still in {dir}." dir="$STAGING_DIR")" >&2
}

fail_backup() {
  local reason="$1"
  local finished_at
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_report "failure" "$reason" 0 "$finished_at"
  rm -f "$STAGING_DIR/.backup-in-progress"
  echo "$(msg "script.runbook.backup_failed" "Backup failed at {timestamp} — {reason}" timestamp="$(date +'%H:%M on %d %b')" reason="$reason")" | tee -a "$STAGING_DIR/backup.log"
  publish_desk_report
  exit 1
}

mkdir -p "$STAGING_DIR"
if [[ -e "$STAGING_DIR/.backup-in-progress" ]]; then
  echo "$(msg "script.runbook.backup_in_progress" "backup: a backup job is already in progress in {dir}." dir="$STAGING_DIR")" >&2
  exit 1
fi
touch "$STAGING_DIR/.backup-in-progress"

# Plain-format dump to the host staging dir over the compose exec
# channel, so no backup files travel inside container images and no
# extra mounts are needed on the single host.
if ! "${COMPOSE[@]}" exec -T db pg_dump -U hotel -d hotel -F p >"$DUMP_FILE" 2>"$STAGING_DIR/.backup-stderr"; then
  reason="$(head -c 300 "$STAGING_DIR/.backup-stderr" | tr '\n' ' ')"
  rm -f "$DUMP_FILE" "$STAGING_DIR/.backup-stderr"
  fail_backup "$(msg "script.runbook.backup_reason_dump" "database dump failed: {detail}" detail="${reason:-unknown error}")"
fi
rm -f "$STAGING_DIR/.backup-stderr"

BYTES="$(wc -c <"$DUMP_FILE" | tr -d ' ')"
if [[ "$BYTES" -lt 100 ]]; then
  rm -f "$DUMP_FILE"
  fail_backup "$(msg "script.runbook.backup_reason_small" "dump artifact is suspiciously small ({bytes} bytes)" bytes="$BYTES")"
fi

# Completeness check (backup-dr section 4): the copy must read back.
# A scratch database on the same engine proves restorability without
# touching the live hotel database.
SCRATCH="hotel_backup_verify_$$"
if ! "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $SCRATCH;" >/dev/null; then
  rm -f "$DUMP_FILE"
  fail_backup "$(msg "script.runbook.backup_reason_scratch" "could not create the scratch verification database")"
fi
if "${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -v ON_ERROR_STOP=1 -f - <"$DUMP_FILE" >/dev/null 2>&1 \
  && TABLES="$("${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")"; then
  echo "$(msg "script.runbook.backup_verified" "backup: verification read-back found {tables} user tables in the scratch database." tables="$TABLES")"
else
  "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null 2>&1 || true
  rm -f "$DUMP_FILE"
  fail_backup "$(msg "script.runbook.backup_reason_readback" "verification read-back of the backup copy failed")"
fi
"${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $SCRATCH;" >/dev/null

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
write_report "success" "" "$BYTES" "$FINISHED_AT"
rm -f "$STAGING_DIR/.backup-in-progress"
echo "$(msg "script.runbook.backup_succeeded" "Backup succeeded at {timestamp}: {dumpFile} ({bytes} bytes, read-back verified)." timestamp="$(date +'%H:%M on %d %b')" dumpFile="$DUMP_FILE" bytes="$BYTES")" | tee -a "$STAGING_DIR/backup.log"
publish_desk_report
