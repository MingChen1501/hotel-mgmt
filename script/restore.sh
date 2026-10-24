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

# shellcheck disable=SC1091
source "$(dirname "$0")/messages.sh"

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
      echo "$(msg "script.runbook.restore_health_failed" "restore: health check failed for {module}." module="$module")" >&2
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
  [[ -f "$expect_file" ]] || { echo "$(msg "script.runbook.restore_expect_missing" "restore: expectation file {file} is missing." file="$expect_file")" >&2; return 1; }
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
    || { echo "$(msg "script.runbook.restore_expect_incomplete" "restore: expectation file {file} is incomplete." file="$expect_file")" >&2; return 1; }

  local res_state res_stay
  res_state="$(q "SELECT state FROM reservations.reservations WHERE reference = '$reservation_ref';")"
  res_stay="$(q "SELECT stay_id FROM reservations.reservations WHERE reference = '$reservation_ref';")"
  [[ "$res_state" == "$(expect reservationState)" ]] \
    || { echo "$(msg "script.runbook.restore_reservation_state" "restore: reservation {ref} state is '{state}', want '{want}'." ref="$reservation_ref" state="$res_state" want="$(expect reservationState)")" >&2; return 1; }
  [[ "$res_stay" == "$stay_id" ]] \
    || { echo "$(msg "script.runbook.restore_reservation_link" "restore: reservation {ref} lost its stay link." ref="$reservation_ref")" >&2; return 1; }

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
    || { echo "$(msg "script.runbook.restore_stay_state" "restore: stay {stayId} state is '{state}', want '{want}'." stayId="$stay_id" state="$stay_state" want="$stay_want")" >&2; return 1; }
  local stay_reservation_id
  stay_reservation_id="$(q "SELECT id FROM reservations.reservations WHERE reference = '$reservation_ref';")"
  [[ "$stay_res" == "$stay_reservation_id" ]] \
    || { echo "$(msg "script.runbook.restore_stay_link" "restore: stay {stayId} lost its reservation link." stayId="$stay_id")" >&2; return 1; }

  local arrivals
  arrivals="$(q "SELECT coalesce(string_agg(reference, ',' ORDER BY reference), '') FROM reservations.reservations WHERE arrival_date = '$arrivals_date' AND state IN ('confirmed','checked-in');")"
  local want_arrivals
  want_arrivals="$(python3 -c 'import json,sys; print(",".join(sorted(json.load(open(sys.argv[1]))["arrivalRefs"])))' "$expect_file")"
  [[ "$arrivals" == "$want_arrivals" ]] \
    || { echo "$(msg "script.runbook.restore_arrivals" "restore: arrivals for {date} are '{actual}', want '{want}'." date="$arrivals_date" actual="$arrivals" want="$want_arrivals")" >&2; return 1; }

  local folio_balance day_charges day_payments audit_gaps
  folio_balance="$(q "SELECT balance_minor FROM billing.folios WHERE id = '$folio_id';")"
  [[ "$folio_balance" == "$(expect folioBalanceMinor)" ]] \
    || { echo "$(msg "script.runbook.restore_folio_balance" "restore: folio {folioId} balance is '{actual}', want '{want}'." folioId="$folio_id" actual="$folio_balance" want="$(expect folioBalanceMinor)")" >&2; return 1; }
  day_charges="$(q "SELECT charges_total_minor FROM billing.day_close_runs WHERE business_date = '$arrivals_date';")"
  [[ "$day_charges" == "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["dayClose"]["chargesTotalMinor"])' "$expect_file")" ]] \
    || { echo "$(msg "script.runbook.restore_day_charges" "restore: day-close charges for {date} are '{actual}'." date="$arrivals_date" actual="$day_charges")" >&2; return 1; }
  day_payments="$(q "SELECT payments_by_method FROM billing.day_close_runs WHERE business_date = '$arrivals_date';")"
  python3 - "$day_payments" "$expect_file" <<'PYEOF' \
    || { echo "$(msg "script.runbook.restore_day_payments" "restore: day-close payments for the date changed across the drill.")" >&2; return 1; }
import json, sys
actual = json.loads(sys.argv[1])
want = json.load(open(sys.argv[2]))["dayClose"]["paymentsByMethod"]
assert actual == want, (actual, want)
PYEOF
  local profiles restored_hotel restored_room rate_prices
  profiles="$(q "SELECT count(*) FROM admin.hotel_profile;")"
  [[ "$profiles" == "1" ]] \
    || { echo "$(msg "script.runbook.restore_profiles" "restore: hotel profile rows = '{actual}', want exactly 1." actual="$profiles")" >&2; return 1; }
  restored_hotel="$(q "SELECT name FROM admin.hotel_profile LIMIT 1;")"
  [[ "$restored_hotel" == "$hotel_name" ]] \
    || { echo "$(msg "script.runbook.restore_hotel_name" "restore: hotel name is '{actual}', want '{want}'." actual="$restored_hotel" want="$hotel_name")" >&2; return 1; }
  restored_room="$(q "SELECT state FROM rooms.rooms WHERE number = '$room_number';")"
  [[ "$restored_room" == "$room_state" ]] \
    || { echo "$(msg "script.runbook.restore_room_state" "restore: room {room} state is '{actual}', want '{want}'." room="$room_number" actual="$restored_room" want="$room_state")" >&2; return 1; }
  rate_prices="$(q "SELECT coalesce(json_object_agg(night_date::text, price_minor ORDER BY night_date)::text, '{}') FROM rates.rate_prices WHERE rate_plan_id = (SELECT id FROM rates.rate_plans WHERE name = '$rate_plan');")"
  python3 - "$rate_prices" "$expect_file" <<'PYEOF' \
    || { echo "$(msg "script.runbook.restore_rate_prices" "restore: rate prices for plan changed across the drill.")" >&2; return 1; }
import json, sys
actual = json.loads(sys.argv[1])
want = {k: int(v) for k, v in json.load(open(sys.argv[2]))["ratePrices"].items()}
assert actual == want, (actual, want)
PYEOF
  audit_gaps="$(q "SELECT (SELECT count(*) FROM reservations.reservations WHERE created_by IS NULL OR created_at IS NULL) + (SELECT count(*) FROM stay.stays WHERE created_by IS NULL OR created_at IS NULL) + (SELECT count(*) FROM billing.folios WHERE created_by IS NULL OR created_at IS NULL) + (SELECT count(*) FROM billing.day_close_runs WHERE created_by IS NULL OR created_at IS NULL);")"
  [[ "$audit_gaps" == "0" ]] \
    || { echo "$(msg "script.runbook.restore_audit_gaps" "restore: {gaps} touched row(s) lost their audit entries." gaps="$audit_gaps")" >&2; return 1; }
  echo "$(msg "script.runbook.restore_verified" "restore: desk state verified — arrivals {date} ({arrivals}), stay {stayId} {stayState}, day-close charges {charges}, hotel '{hotel}', room {room} {roomState}, rate plan {plan} prices intact." date="$arrivals_date" arrivals="$arrivals" stayId="$stay_id" stayState="$stay_state" charges="$day_charges" hotel="$hotel_name" room="$room_number" roomState="$room_state" plan="$rate_plan")"
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
      echo "$(msg "script.runbook.restore_drill_failed" "restore: drill FAILED — {reason}" reason="$reason")" >&2
      exit 1
    }
    BACKUP_FILE="$(newest_verified_backup "$STAGING_DIR")" \
      || fail_drill "$(msg "script.runbook.restore_drill_no_backup" "no verified successful backup in {dir}; nothing to drill from" dir="$STAGING_DIR")" ""
    if [[ ! -f "$BACKUP_FILE" ]]; then
      fail_drill "$(msg "script.runbook.restore_drill_missing_artifact" "newest verified artifact {file} is missing from disk" file="$BACKUP_FILE")" "$BACKUP_FILE"
    fi
    SCRATCH="hotel_restore_verify_$$"
    "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $SCRATCH;" >/dev/null
    if ! "${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -v ON_ERROR_STOP=1 -f - <"$BACKUP_FILE" >/dev/null; then
      "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null 2>&1 || true
      fail_drill "$(msg "script.runbook.restore_drill_load_failed" "the backup copy did not load")" "$BACKUP_FILE"
    fi
    TABLES="$("${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")"
    PROFILES="$("${COMPOSE[@]}" exec -T db psql -U hotel -d "$SCRATCH" -tAc "SELECT count(*) FROM admin.hotel_profile;" 2>/dev/null || echo 0)"
    if [[ -n "$EXPECT_FILE" ]]; then
      verify_expectation "$SCRATCH" "$EXPECT_FILE" \
        || { "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $SCRATCH;" >/dev/null 2>&1 || true; fail_drill "$(msg "script.runbook.restore_drill_expect_failed" "desk-state verification against {file} failed" file="$EXPECT_FILE")" "$BACKUP_FILE"; }
    fi
    "${COMPOSE[@]}" exec -T db psql -U hotel -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $SCRATCH;" >/dev/null
    ELAPSED="$(( $(date +%s) - START_EPOCH ))"
    write_drill_report "success" "" "$ELAPSED" "$BACKUP_FILE" "$TABLES" "$PROFILES"
    echo "$(msg "script.runbook.restore_drill_succeeded" "restore: drill SUCCEEDED in {elapsed}s (RTO budget 4h): {file} restored to scratch with {tables} user tables, {profiles} hotel profile row(s); report {report}." elapsed="$ELAPSED" file="$BACKUP_FILE" tables="$TABLES" profiles="$PROFILES" report="$DRILL_REPORT")"
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
            echo "$(msg "script.runbook.restore_live_extra_arg" "restore: only one backup file argument is accepted (got {arg})." arg="$1")" >&2
            exit 2
          fi
          BACKUP_FILE="$1"; shift ;;
      esac
    done
    [[ -n "$BACKUP_FILE" ]] || { echo "$(msg "script.runbook.restore_live_needs_file" "restore: --live needs a backup file path.")" >&2; exit 2; }
    BASE_URL="${BASE_URL:-http://127.0.0.1}"
    [[ -f "$BACKUP_FILE" ]] || { echo "$(msg "script.runbook.restore_live_not_found" "restore: backup file {file} not found." file="$BACKUP_FILE")" >&2; exit 1; }
    # Live restore wipes and reloads the hotel database: proceed
    # only when the operator types the hotel's own property code
    # exactly as configured (deploy/config, deployment.md section 2).
    # A missing or unreadable configuration fails closed.
    PROPERTY_CODE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("hotel", {}).get("propertyCode", ""))' "$CONFIG" 2>/dev/null || true)"
    if [[ -z "$PROPERTY_CODE" ]]; then
      echo "$(msg "script.runbook.restore_live_no_property" "restore: cannot read hotel.propertyCode from {config}; refusing the live restore." config="$CONFIG")" >&2
      exit 1
    fi
    echo "$(msg "script.runbook.restore_live_confirm" "restore: LIVE restore from {file}. Desk work must be stopped. Type the hotel property code to continue." file="$BACKUP_FILE")"
    read -r CONFIRM
    if [[ "$CONFIRM" != "$PROPERTY_CODE" ]]; then
      echo "$(msg "script.runbook.restore_live_aborted" "restore: aborted (typed code does not match the configured property code).")" >&2
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
      echo "$(msg "script.runbook.restore_live_succeeded" "restore: LIVE restore SUCCEEDED; sign in and run the runbook section 5 checks before resuming desk work.")"
    else
      echo "$(msg "script.runbook.restore_live_health_failed" "restore: LIVE restore loaded but the health check FAILED — call support (runbook.md section 6).")" >&2
      exit 1
    fi
    ;;

  *)
    echo "usage: script/restore.sh --verify-only [--staging-dir DIR] [--expect-file PATH] | --live <backup-file> [--config PATH] [--staging-dir DIR]" >&2
    exit 2 ;;
esac
