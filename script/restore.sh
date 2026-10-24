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
#       With --expect-file PATH the drill additionally proves the
#       desk state survived: arrivals, the in-house stay, the
#       day-close totals, and the config rows (hotel profile name,
#       room states, rate prices) match the pre-failure expectation
#       record written by the desk loop (issue #117).
#   script/restore.sh --live <file>   stop the stack in upgrade
#       order, reload the live hotel database from the backup file,
#       restart in start order, and run the health check
#       (deployment.md section 6; disruptive — desk work stops).
#       The operator must type the hotel's own property code from
#       the per-hotel configuration set (--config PATH, default
#       deploy/config/hotel.json) exactly; anything else aborts.
#
# Scope: module rows persist in Postgres (issue #149), so the drill
# verifies the restored desk state, not just the engine contents:
# reservations, stays, folios, day-close totals, and the config
# rows behind the runbook section 5 owner checks (issue #117).

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
    # --noproxy: the desk entry is the on-premise host itself, never
    # a configured egress proxy (runbook.md section 4).
    if ! curl -fsS --noproxy '*' --max-time 10 "$base_url/v1/$module/healthz" >/dev/null 2>&1; then
      echo "restore: health check failed for $module." >&2
      ok=1
    fi
  done
  return "$ok"
}

# verify_expectation proves the desk state survived the restore
# (issue #117): the arrivals for the expected date, the one
# in-house stay, and the day-close totals in the scratch database
# match the pre-failure expectation record, as do the config rows
# behind the runbook section 5 owner checks (hotel profile name,
# room states, rate prices); and every touched row carries its
# audit actor and timestamp (NFR-AUD-1).
verify_expectation() {
  local scratch="$1" expect_file="$2"
  [[ -f "$expect_file" ]] || { echo "restore: expectation file $expect_file is missing." >&2; return 1; }
  local q
  q() { "${COMPOSE[@]}" exec -T db psql -U hotel -d "$scratch" -tAc "$1"; }
  local expect
  expect() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))' "$expect_file" "$1"; }
  local reservation_ref stay_id folio_id arrivals_date hotel_name room_number room_state rate_plan
  reservation_ref="$(expect reservationRef)"
  stay_id="$(expect stayId)"
  folio_id="$(expect folioId)"
  arrivals_date="$(expect arrivalsDate)"
  hotel_name="$(expect hotelName)"
  room_number="$(expect roomNumber)"
  room_state="$(expect roomState)"
  rate_plan="$(expect ratePlanName)"
  [[ -n "$reservation_ref" && -n "$stay_id" && -n "$folio_id" && -n "$arrivals_date" && -n "$hotel_name" && -n "$room_number" && -n "$room_state" && -n "$rate_plan" ]] \
    || { echo "restore: expectation file $expect_file is incomplete." >&2; return 1; }

  local res_state res_stay
  res_state="$(q "SELECT state FROM reservations.reservations WHERE reference = '$reservation_ref';")"
  res_stay="$(q "SELECT stay_id FROM reservations.reservations WHERE reference = '$reservation_ref';")"
  [[ "$res_state" == "$(expect reservationState)" ]] \
    || { echo "restore: reservation $reservation_ref state is '$res_state', want '$(expect reservationState)'." >&2; return 1; }
  [[ "$res_stay" == "$stay_id" ]] \
    || { echo "restore: reservation $reservation_ref lost its stay link." >&2; return 1; }

  local stay_state stay_res
  stay_state="$(q "SELECT state FROM stay.stays WHERE id = '$stay_id';")"
  stay_res="$(q "SELECT reservation_id FROM stay.stays WHERE id = '$stay_id';")"
  # The stay-flow slice (issue #150) backs up after checkout, so the
  # expected stay state rides in the expectation record; older
  # records without the key still expect the in-house stay.
  local stay_want
  stay_want="$(expect stayState)"
  [[ -z "$stay_want" ]] && stay_want="in-house"
  [[ "$stay_state" == "$stay_want" ]] \
    || { echo "restore: stay $stay_id state is '$stay_state', want '$stay_want'." >&2; return 1; }
  local stay_reservation_id
  stay_reservation_id="$(q "SELECT id FROM reservations.reservations WHERE reference = '$reservation_ref';")"
  [[ "$stay_res" == "$stay_reservation_id" ]] \
    || { echo "restore: stay $stay_id lost its reservation link." >&2; return 1; }

  local arrivals
  arrivals="$(q "SELECT coalesce(string_agg(reference, ',' ORDER BY reference), '') FROM reservations.reservations WHERE arrival_date = '$arrivals_date' AND state IN ('confirmed','checked-in');")"
  local want_arrivals
  want_arrivals="$(python3 -c 'import json,sys; print(",".join(sorted(json.load(open(sys.argv[1]))["arrivalRefs"])))' "$expect_file")"
  [[ "$arrivals" == "$want_arrivals" ]] \
    || { echo "restore: arrivals for $arrivals_date are '$arrivals', want '$want_arrivals'." >&2; return 1; }

  local folio_balance day_charges day_payments audit_gaps
  folio_balance="$(q "SELECT balance_minor FROM billing.folios WHERE id = '$folio_id';")"
  [[ "$folio_balance" == "$(expect folioBalanceMinor)" ]] \
    || { echo "restore: folio $folio_id balance is '$folio_balance', want '$(expect folioBalanceMinor)'." >&2; return 1; }
  day_charges="$(q "SELECT charges_total_minor FROM billing.day_close_runs WHERE business_date = '$arrivals_date';")"
  [[ "$day_charges" == "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["dayClose"]["chargesTotalMinor"])' "$expect_file")" ]] \
    || { echo "restore: day-close charges for $arrivals_date are '$day_charges'." >&2; return 1; }
  day_payments="$(q "SELECT payments_by_method FROM billing.day_close_runs WHERE business_date = '$arrivals_date';")"
  python3 - "$day_payments" "$expect_file" <<'PYEOF' \
    || { echo "restore: day-close payments for the date changed across the drill." >&2; return 1; }
import json, sys
actual = json.loads(sys.argv[1])
want = json.load(open(sys.argv[2]))["dayClose"]["paymentsByMethod"]
assert actual == want, (actual, want)
PYEOF
  local profiles restored_hotel restored_room rate_prices
  profiles="$(q "SELECT count(*) FROM admin.hotel_profile;")"
  [[ "$profiles" == "1" ]] \
    || { echo "restore: hotel profile rows = '$profiles', want exactly 1." >&2; return 1; }
  restored_hotel="$(q "SELECT name FROM admin.hotel_profile LIMIT 1;")"
  [[ "$restored_hotel" == "$hotel_name" ]] \
    || { echo "restore: hotel name is '$restored_hotel', want '$hotel_name'." >&2; return 1; }
  restored_room="$(q "SELECT state FROM rooms.rooms WHERE number = '$room_number';")"
  [[ "$restored_room" == "$room_state" ]] \
    || { echo "restore: room $room_number state is '$restored_room', want '$room_state'." >&2; return 1; }
  rate_prices="$(q "SELECT coalesce(json_object_agg(night_date::text, price_minor ORDER BY night_date)::text, '{}') FROM rates.rate_prices WHERE rate_plan_id = (SELECT id FROM rates.rate_plans WHERE name = '$rate_plan');")"
  python3 - "$rate_prices" "$expect_file" <<'PYEOF' \
    || { echo "restore: rate prices for plan changed across the drill." >&2; return 1; }
import json, sys
actual = json.loads(sys.argv[1])
want = {k: int(v) for k, v in json.load(open(sys.argv[2]))["ratePrices"].items()}
assert actual == want, (actual, want)
PYEOF
  audit_gaps="$(q "SELECT (SELECT count(*) FROM reservations.reservations WHERE created_by IS NULL OR created_at IS NULL) + (SELECT count(*) FROM stay.stays WHERE created_by IS NULL OR created_at IS NULL) + (SELECT count(*) FROM billing.folios WHERE created_by IS NULL OR created_at IS NULL) + (SELECT count(*) FROM billing.day_close_runs WHERE created_by IS NULL OR created_at IS NULL);")"
  [[ "$audit_gaps" == "0" ]] \
    || { echo "restore: $audit_gaps touched row(s) lost their audit entries." >&2; return 1; }
  echo "restore: desk state verified — arrivals $arrivals_date ($arrivals), stay $stay_id $stay_state, day-close charges $day_charges, hotel '$hotel_name', room $room_number $room_state, rate plan $rate_plan prices intact."
  return 0
}

case "$MODE" in
  --verify-only)
    shift
    STAGING_DIR="./backup-staging"
    EXPECT_FILE=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --staging-dir)
          STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
        --expect-file)
          EXPECT_FILE="${2:?--expect-file needs a path}"; shift 2 ;;
        *)
          echo "restore: unknown argument for --verify-only: $1" >&2
          echo "usage: script/restore.sh --verify-only [--staging-dir DIR] [--expect-file PATH] | --live <backup-file> [--config PATH] [--staging-dir DIR]" >&2
          exit 2 ;;
      esac
    done
    START_EPOCH="$(date +%s)"
    DRILL_STAMP="$(date +%Y%m%d-%H%M%S)"
    DRILL_REPORT="$STAGING_DIR/hotel-$DRILL_STAMP-restore-drill.report.json"
    # Every drill run leaves a visible success-or-failure report beside
    # the backup reports (issue #153): a drill without a success
    # report counts as failed, mirroring the backup rule in
    # docs/operations/backup-dr.md section 4 (NFR-BKP-2).
    write_drill_report() {
      local outcome="$1" reason="$2" elapsed="$3" artifact="$4" tables="$5" profiles="$6"
      python3 - "$DRILL_REPORT" "$outcome" "$START_EPOCH" "$elapsed" "$artifact" "$tables" "$profiles" "$reason" <<'PYEOF'
import json, sys
_, report_file, outcome, started, elapsed, artifact, tables, profiles, reason = sys.argv
elapsed_seconds = int(elapsed)
rto_budget_seconds = 4 * 3600
report = {
    "outcome": outcome,
    "kind": "restore-drill",
    "startedEpoch": int(started),
    "elapsedSeconds": elapsed_seconds,
    "rtoBudgetSeconds": rto_budget_seconds,
    "withinBudget": elapsed_seconds <= rto_budget_seconds,
    "artifact": artifact,
    "userTables": int(tables),
    "hotelProfileRows": int(profiles),
    "reason": reason,
}
json.dump(report, open(report_file, "w"), indent=2)
PYEOF
    }
    fail_drill() {
      local reason="$1" artifact="$2"
      local elapsed="$(( $(date +%s) - START_EPOCH ))"
      write_drill_report "failure" "$reason" "$elapsed" "$artifact" 0 0
      echo "restore: drill FAILED — $reason" >&2
      exit 1
    }
    BACKUP_FILE="$(newest_verified_backup "$STAGING_DIR")" \
      || fail_drill "no verified successful backup in $STAGING_DIR; nothing to drill from" ""
    if [[ ! -f "$BACKUP_FILE" ]]; then
      fail_drill "newest verified artifact $BACKUP_FILE is missing from disk" "$BACKUP_FILE"
    fi
    SCRATCH="hotel_restore_verify_$$"
    "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $SCRATCH;" >/dev/null
    if ! "${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -v ON_ERROR_STOP=1 -f - <"$BACKUP_FILE" >/dev/null; then
      "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null 2>&1 || true
      fail_drill "the backup copy did not load" "$BACKUP_FILE"
    fi
    TABLES="$("${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")"
    PROFILES="$("${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -tAc "SELECT count(*) FROM admin.hotel_profile;" 2>/dev/null || echo 0)"
    if [[ -n "$EXPECT_FILE" ]]; then
      verify_expectation "$SCRATCH" "$EXPECT_FILE" \
        || { "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $SCRATCH;" >/dev/null 2>&1 || true; fail_drill "desk-state verification against $EXPECT_FILE failed" "$BACKUP_FILE"; }
    fi
    "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $SCRATCH;" >/dev/null
    ELAPSED="$(( $(date +%s) - START_EPOCH ))"
    write_drill_report "success" "" "$ELAPSED" "$BACKUP_FILE" "$TABLES" "$PROFILES"
    echo "restore: drill SUCCEEDED in ${ELAPSED}s (RTO budget 4h): $BACKUP_FILE restored to scratch with $TABLES user tables, $PROFILES hotel profile row(s); report $DRILL_REPORT."
    ;;

  --live)
    shift
    BACKUP_FILE=""
    CONFIG="deploy/config/hotel.json"
    STAGING_DIR="./backup-staging"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --config)
          CONFIG="${2:?--config needs a path}"; shift 2 ;;
        --staging-dir)
          STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
        --*)
          echo "restore: unknown argument for --live: $1" >&2
          echo "usage: script/restore.sh --verify-only [--staging-dir DIR] | --live <backup-file> [--config PATH] [--staging-dir DIR]" >&2
          exit 2 ;;
        *)
          if [[ -n "$BACKUP_FILE" ]]; then
            echo "restore: only one backup file argument is accepted (got $1)." >&2
            exit 2
          fi
          BACKUP_FILE="$1"; shift ;;
      esac
    done
    [[ -n "$BACKUP_FILE" ]] || { echo "restore: --live needs a backup file path." >&2; exit 2; }
    BASE_URL="${BASE_URL:-http://127.0.0.1}"
    [[ -f "$BACKUP_FILE" ]] || { echo "restore: backup file $BACKUP_FILE not found." >&2; exit 1; }
    # Live restore wipes and reloads the hotel database: proceed
    # only when the operator types the hotel's own property code
    # exactly as configured (deploy/config, deployment.md section 2).
    # A missing or unreadable configuration fails closed.
    PROPERTY_CODE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("hotel", {}).get("propertyCode", ""))' "$CONFIG" 2>/dev/null || true)"
    if [[ -z "$PROPERTY_CODE" ]]; then
      echo "restore: cannot read hotel.propertyCode from $CONFIG; refusing the live restore." >&2
      exit 1
    fi
    echo "restore: LIVE restore from $BACKUP_FILE. Desk work must be stopped. Type the hotel property code to continue."
    read -r CONFIRM
    if [[ "$CONFIRM" != "$PROPERTY_CODE" ]]; then
      echo "restore: aborted (typed code does not match the configured property code)." >&2
      exit 1
    fi
    touch "$STAGING_DIR/.restore-in-progress" 2>/dev/null || true
    trap 'rm -f "$STAGING_DIR/.restore-in-progress"' EXIT
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
    echo "usage: script/restore.sh --verify-only [--staging-dir DIR] [--expect-file PATH] | --live <backup-file> [--config PATH] [--staging-dir DIR]" >&2
    exit 2 ;;
esac
