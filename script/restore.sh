#!/usr/bin/env bash
#
# Restore drill for the shared database engine (issue #113).
#
# Implements the restore side of docs/operations/backup-dr.md
# section 4 and the runbook restore procedure (runbook.md section 5):
# the newest backup with a verified success report becomes the
# restore point, and the drill target is an operable system within
# 4 hours on equivalent hardware (NFR-BKP-2).
#
# Two modes:
#   script/restore.sh --verify-only   restore the newest verified
#       backup into a scratch database and verify its contents
#       (non-disruptive; this is the drill evidence for the RTO).
#   script/restore.sh --live <file>   stop the stack in upgrade
#       order, reload the live hotel database from the backup file,
#       restart in start order, and run the health check
#       (deployment.md section 6; disruptive — desk work stops).
#
# Skeleton scope: module service rows stay in memory until the
# persistence slice, so the drill verifies the engine contents
# (schemas, seed and config rows). Desk-state restore waits for
# that slice and is tracked as a runbook-deviation follow-up, not
# claimed here.

set -euo pipefail

COMPOSE=(docker compose -f deploy/compose.yaml)
MODE="${1:-}"

newest_verified_backup() {
  local staging_dir="$1" best="" report
  for report in "$staging_dir"/hotel-*.report.json; do
    [[ -f "$report" ]] || continue
    if python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("outcome") == "success" and json.load(open(sys.argv[1])).get("verifiedReadBack") else 1)' "$report"; then
      if [[ -z "$best" || "$report" > "$best" ]]; then
        best="$report"
      fi
    fi
  done
  if [[ -z "$best" ]]; then
    return 1
  fi
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["artifact"])' "$best"
}

health_check() {
  local base_url="$1" ok=0 module
  for module in reservations rates reporting stay rooms guests billing admin; do
    if ! curl -fsS --max-time 10 "$base_url/v1/$module/healthz" >/dev/null 2>&1; then
      echo "restore: health check failed for $module." >&2
      ok=1
    fi
  done
  return "$ok"
}

case "$MODE" in
  --verify-only)
    STAGING_DIR="${2:-./backup-staging}"
    START_EPOCH="$(date +%s)"
    BACKUP_FILE="$(newest_verified_backup "$STAGING_DIR")" \
      || { echo "restore: no verified successful backup in $STAGING_DIR; nothing to drill from." >&2; exit 1; }
    if [[ ! -f "$BACKUP_FILE" ]]; then
      echo "restore: newest verified artifact $BACKUP_FILE is missing from disk." >&2
      exit 1
    fi
    SCRATCH="hotel_restore_verify_$$"
    "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $SCRATCH;" >/dev/null
    if ! "${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -v ON_ERROR_STOP=1 -f - <"$BACKUP_FILE" >/dev/null; then
      "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null 2>&1 || true
      echo "restore: drill FAILED — the backup copy did not load." >&2
      exit 1
    fi
    TABLES="$("${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")"
    PROFILES="$("${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -tAc "SELECT count(*) FROM admin.hotel_profile;" 2>/dev/null || echo 0)"
    "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $SCRATCH;" >/dev/null
    ELAPSED="$(( $(date +%s) - START_EPOCH ))"
    echo "restore: drill SUCCEEDED in ${ELAPSED}s (RTO budget 4h): $BACKUP_FILE restored to scratch with $TABLES user tables, $PROFILES hotel profile row(s)."
    ;;

  --live)
    BACKUP_FILE="${2:?--live needs a backup file path}"
    BASE_URL="${BASE_URL:-http://127.0.0.1}"
    [[ -f "$BACKUP_FILE" ]] || { echo "restore: backup file $BACKUP_FILE not found." >&2; exit 1; }
    echo "restore: LIVE restore from $BACKUP_FILE. Desk work must be stopped. Type the hotel property code to continue."
    read -r CONFIRM
    if [[ -z "$CONFIRM" ]]; then
      echo "restore: aborted." >&2
      exit 1
    fi
    touch ./backup-staging/.restore-in-progress 2>/dev/null || true
    trap 'rm -f ./backup-staging/.restore-in-progress' EXIT
    # Stop in reverse of the start order (deployment.md section 4).
    "${COMPOSE[@]}" stop proxy
    "${COMPOSE[@]}" stop reservations rates reporting stay rooms guests billing admin
    "${COMPOSE[@]}" stop db
    "${COMPOSE[@]}" start db
    "${COMPOSE[@]}" exec -T db pg_isready -U hotel -d hotel
    "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE hotel;" -c "CREATE DATABASE hotel;"
    "${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -v ON_ERROR_STOP=1 -f - <"$BACKUP_FILE"
    # Start in start order: database, modules, proxy (deployment.md section 3).
    "${COMPOSE[@]}" up -d reservations rates reporting stay rooms guests billing admin
    "${COMPOSE[@]}" up -d proxy
    sleep 10
    if health_check "$BASE_URL"; then
      echo "restore: LIVE restore SUCCEEDED; sign in and run the runbook section 5 checks before resuming desk work."
    else
      echo "restore: LIVE restore loaded but the health check FAILED — call support (runbook.md section 6)." >&2
      exit 1
    fi
    ;;

  *)
    echo "usage: script/restore.sh --verify-only [--staging-dir DIR] | --live <backup-file>" >&2
    exit 2 ;;
esac
