#!/usr/bin/env bash
#
# Desk-loop E2E for the walking skeleton on a single host (issue #113).
#
# Proves the Phase 3 slice end to end through the reverse proxy:
# Admin sign-in and config, guest upsert, Rooms setup and sellability,
# Rates plan and quote, Reservations booking through the real RES ->
# RATE -> ROOM input path, then a same-day check-in (AssignRoom ->
# Stay CheckIn -> reservation check-in), folio charge and payment,
# day-close, then backup -> restore drill -> re-verify, per
# docs/devops/deployment.md section 3 step 6 and
# docs/operations/backup-dr.md section 4.
#
# Sequence: book -> check in -> move/times -> charge/pay/close ->
# checkout with folio review (refusal, approval, close, room
# release) -> backup -> restore (verified against the pre-failure
# expectation record) -> verify.
#
# Usage (from the repo root, after script/preflight.sh passes):
#   DB_PASSWORD=<secret> ADMIN_BOOT_SECRET=<secret> \
#     script/e2e-desk-loop.sh [--base-url http://127.0.0.1] \
#     [--staging-dir ./backup-staging] [--hotel-config deploy/config/hotel.json] [--keep-up]
#
# When the hotel's configuration set exists (the default path above),
# the loop applies it through script/apply-hotel-config.sh right
# after the Admin sign-in and verifies the hotel's own identity and
# standard times are in effect (FR-ADM-1, FR-ADM-4, NFR-DEP-1); when
# it is absent the desk runs on the boot seed values.
#
# The stack is brought up fresh (docker compose up -d --build),
# migrations and the boot seed are applied idempotently, and the
# stack is left running unless --keep-up is omitted (default tears
# down in reverse stop order). The desk signs in as ADMIN_IDENTITY
# with the provisioned ADMIN_BOOT_SECRET (override with
# ADMIN_SECRET); both secrets fail closed on dev defaults per the
# same denylist as script/preflight.sh. Never prints secret values.

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/messages.sh"

BASE_URL="http://127.0.0.1"
STAGING_DIR="./backup-staging"
HOTEL_CONFIG="deploy/config/hotel.json"
TEARDOWN=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:?--base-url needs a URL}"; shift 2 ;;
    --staging-dir)
      STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
    --hotel-config)
      HOTEL_CONFIG="${2:?--hotel-config needs a path}"; shift 2 ;;
    --keep-up)
      TEARDOWN=0; shift ;;
    *)
      echo "e2e: unknown argument: $1" >&2
      echo "usage: script/e2e-desk-loop.sh [--base-url URL] [--staging-dir DIR] [--hotel-config PATH] [--keep-up]" >&2
      exit 2 ;;
  esac
done

COMPOSE=(docker compose -f deploy/compose.yaml)
ADMIN_IDENTITY="${ADMIN_IDENTITY:-owner}"
# ADMIN_SECRET defaults to the provisioned boot secret later (after
# the fail-closed gate); an explicit override is honoured as-is.
START_EPOCH="$(date +%s)"

step() { echo "$(msg "$@")"; }
pass() { echo "$(msg "$@")"; }

# POST one contract operation through the proxy; prints the response
# body on success, fails on transport errors or envelope refusals.
# --noproxy: the desk entry is always the on-premise host itself
# (runbook.md section 4 — the desk works offline), so proxy
# environment variables must never divert these loopback calls.
api() {
  local contract="$1" operation="$2" payload="$3" token="${4:-}"
  local auth=()
  if [[ -n "$token" ]]; then
    auth=(-H "Authorization: Bearer $token")
  fi
  local tmp http_code body
  tmp="$(mktemp)"
  http_code="$(curl -sS --noproxy '*' --max-time 15 -o "$tmp" -w '%{http_code}' -X POST "$BASE_URL/v1/$contract/$operation" \
    -H "Content-Type: application/json" "${auth[@]}" -d "$payload" 2>/dev/null)" \
    || { echo "$(msg "script.runbook.e2e_api_unreachable" "e2e: FAIL: POST /v1/{contract}/{operation} unreachable." contract="$contract" operation="$operation")" >&2; rm -f "$tmp"; return 1; }
  body="$(cat "$tmp")"
  rm -f "$tmp"
  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "$(msg "script.runbook.e2e_api_http_fail" "e2e: FAIL: /v1/{contract}/{operation} HTTP {httpCode}: {body}." contract="$contract" operation="$operation" httpCode="$http_code" body="$body")" >&2
    return 1
  fi
  if python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if "code" in d else 1)' <<<"$body" 2>/dev/null; then
    echo "$(msg "script.runbook.e2e_api_refused" "e2e: FAIL: /v1/{contract}/{operation} refused: {body}." contract="$contract" operation="$operation" body="$body")" >&2
    return 1
  fi
  printf '%s' "$body"
}

field() {
  python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$1" <<<"$2"
}

# Expect a contract refusal: passes when the call answers outside 2xx
# with the expected error code, fails otherwise. Safe under set -e.
expect_refusal() {
  local contract="$1" operation="$2" payload="$3" token="$4" code="$5"
  local tmp http_code body actual
  tmp="$(mktemp)"
  http_code="$(curl -sS --noproxy '*' --max-time 15 -o "$tmp" -w '%{http_code}' -X POST "$BASE_URL/v1/$contract/$operation" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "$payload" 2>/dev/null)" \
    || { echo "$(msg "script.runbook.e2e_api_unreachable" "e2e: FAIL: POST /v1/{contract}/{operation} unreachable." contract="$contract" operation="$operation")" >&2; rm -f "$tmp"; return 1; }
  body="$(cat "$tmp")"
  rm -f "$tmp"
  actual="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("code", ""))' <<<"$body" 2>/dev/null || true)"
  if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    echo "$(msg "script.runbook.e2e_refusal_succeeded" "e2e: FAIL: /v1/{contract}/{operation} succeeded, want refusal {code}: {body}." contract="$contract" operation="$operation" code="$code" body="$body")" >&2
    return 1
  fi
  if [[ "$actual" != "$code" ]]; then
    echo "$(msg "script.runbook.e2e_refusal_code" "e2e: FAIL: /v1/{contract}/{operation} refused with '{actual}', want '{code}': {body}." contract="$contract" operation="$operation" actual="$actual" code="$code" body="$body")" >&2
    return 1
  fi
  echo "$(msg "script.runbook.e2e_refusal_ok" "e2e: refused as expected: /v1/{contract}/{operation} {code}." contract="$contract" operation="$operation" code="$code")"
}

teardown() {
  if [[ "$TEARDOWN" -eq 1 ]]; then
    echo "$(msg "script.runbook.e2e_teardown" "e2e: tearing down in reverse stop order (deployment.md section 4).")"
    "${COMPOSE[@]}" stop proxy >/dev/null 2>&1 || true
    "${COMPOSE[@]}" stop reservations rates reporting stay rooms guests billing admin >/dev/null 2>&1 || true
    "${COMPOSE[@]}" stop db >/dev/null 2>&1 || true
  fi
}

step "script.runbook.e2e_step_bring_up" "e2e: === bring up the single-host stack ==="
# Fail closed on default secrets (audit S3): the same denylist as
# script/preflight.sh (canonical), so the loop can never run on dev
# defaults even though compose ships lab-only fallbacks.
is_default_secret() {
  case "$1" in
    ""|"change-me"|"change-me-dev-only"|"password"|"hotel"|"hotel-dev-only") return 0 ;;
    *) return 1 ;;
  esac
}
DB_PASSWORD_CHECK="${DB_PASSWORD:-}"
ADMIN_BOOT_SECRET_CHECK="${ADMIN_BOOT_SECRET:-}"
if is_default_secret "$DB_PASSWORD_CHECK"; then
  echo "$(msg "script.runbook.e2e_db_default" "e2e: FAIL: DB_PASSWORD is unset or still a dev default; set the per-sale database secret (script/preflight.sh gates the same list).")" >&2
  exit 1
fi
if is_default_secret "$ADMIN_BOOT_SECRET_CHECK"; then
  echo "$(msg "script.runbook.e2e_boot_default" "e2e: FAIL: ADMIN_BOOT_SECRET is unset or still a dev default; provision the per-sale owner boot secret (script/preflight.sh gates the same list).")" >&2
  exit 1
fi
# The desk signs in with the provisioned per-sale boot secret unless
# an explicit ADMIN_SECRET override is given.
ADMIN_SECRET="${ADMIN_SECRET:-$ADMIN_BOOT_SECRET_CHECK}"
if [[ -z "$ADMIN_SECRET" ]]; then
  echo "$(msg "script.runbook.e2e_secret_empty" "e2e: FAIL: ADMIN_SECRET is empty after defaults.")" >&2
  exit 1
fi

# Desk UI migration shell (Refs #291): the proxy serves the Vite
# static build from app/dist/ (bind-mounted at /srv/app-dist, never
# nested under the :ro frontend mount), and dist/ is gitignored, so
# the build must exist before compose up or proxy creation fails.
# Rebuild when the Node toolchain is present; otherwise reuse a
# previously built dist, and fail closed when there is nothing to
# serve. (Plain echo: the catalogue gate covers only its bounded
# sample, and script/install.sh already uses plain echo.)
if [[ -f app/package.json ]]; then
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    echo "e2e: building the desk UI migration shell (app/dist/)..."
    (cd app && npm ci && npm run build)
  elif [[ -f app/dist/index.html ]]; then
    echo "e2e: WARNING: node/npm not found; reusing the existing app/dist/ build."
  else
    echo "e2e: FAIL: app/dist/index.html is missing and node/npm are unavailable;" >&2
    echo "e2e: FAIL: install Node 22 and rerun, or run 'npm ci && npm run build' in app/ first." >&2
    exit 1
  fi
else
  echo "e2e: FAIL: app/package.json is missing; the proxy mount for /app/ has nothing to serve." >&2
  exit 1
fi
"${COMPOSE[@]}" up -d --build
"${COMPOSE[@]}" exec -T db bash -c 'until pg_isready -U hotel -d hotel; do sleep 2; done'

step "script.runbook.e2e_step_wait_modules" "e2e: === wait for every module through the proxy ==="
for module in reservations rates reporting stay rooms guests billing admin; do
  for _ in $(seq 1 24); do
    if curl -fsS --noproxy '*' --max-time 5 "$BASE_URL/v1/$module/healthz" >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done
  if ! curl -fsS --noproxy '*' --max-time 10 "$BASE_URL/v1/$module/healthz" >/dev/null; then
    echo "$(msg "script.runbook.e2e_module_down" "e2e: FAIL: {module} never answered through the proxy." module="$module")" >&2
    echo "$(msg "script.runbook.e2e_compose_state" "e2e: --- compose state ---")" >&2
    "${COMPOSE[@]}" ps >&2 || true
    echo "$(msg "script.runbook.e2e_proxy_log" "e2e: --- proxy log tail ---")" >&2
    "${COMPOSE[@]}" logs --tail=50 proxy >&2 || true
    teardown; exit 1
  fi
  pass "script.runbook.e2e_module_ok" "e2e: PASS: {module} answers through the proxy." module="$module"
done

step "script.runbook.e2e_step_migrations" "e2e: === apply boot migrations and the boot seed (idempotent) ==="
MIGRATIONS=(
  services/reservations/migrations/000001_boot.up.sql
  services/reservations/migrations/000002_schema.up.sql
  services/reservations/migrations/000003_guest_snapshot.up.sql
  services/rates/migrations/000001_boot.up.sql
  services/rates/migrations/000002_schema.up.sql
  services/rates/migrations/000003_default_units.up.sql
  services/reporting/migrations/000001_boot.up.sql
  services/reporting/migrations/000002_schema.up.sql
  services/stay/migrations/001_boot.sql
  services/stay/migrations/002_schema.sql
  services/stay/migrations/003_checkout.sql
  services/rooms/migrations/001_boot.sql
  services/rooms/migrations/002_schema.sql
  services/guests/migrations/001_boot.sql
  services/guests/migrations/002_schema.sql
  services/admin/migrations/001_boot.sql
  services/admin/migrations/002_schema.sql
  services/billing/src/main/resources/db/migration/V1__boot.sql
  services/billing/src/main/resources/db/migration/V2__schema.sql
)
for migration in "${MIGRATIONS[@]}"; do
  "${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -v ON_ERROR_STOP=1 -f - <"$migration" >/dev/null \
    || { echo "$(msg "script.runbook.e2e_migration_failed" "e2e: FAIL: migration {migration} did not apply." migration="$migration")" >&2; teardown; exit 1; }
done
"${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -v ON_ERROR_STOP=1 -f - <deploy/seed/boot.sql >/dev/null \
  || { echo "$(msg "script.runbook.e2e_seed_failed" "e2e: FAIL: boot seed did not apply.")" >&2; teardown; exit 1; }
pass "script.runbook.e2e_migrations_ok" "e2e: PASS: migrations and boot seed applied."

step "script.runbook.e2e_step_signin" "e2e: === Admin: sign in and read the hotel config ==="
SIGNIN_RESP="$(api admin SignIn "{\"signinIdentity\": \"$ADMIN_IDENTITY\", \"secret\": \"$ADMIN_SECRET\"}")" \
  || { teardown; exit 1; }
TOKEN="$(field token "$SIGNIN_RESP")"
[[ -n "$TOKEN" ]] || { echo "$(msg "script.runbook.e2e_no_token" "e2e: FAIL: sign-in returned no token.")" >&2; teardown; exit 1; }
pass "script.runbook.e2e_signin_ok" "e2e: PASS: owner sign-in returned a session token."
CONFIG_RESP="$(api admin GetHotelConfig '{}' "$TOKEN")" || { teardown; exit 1; }
echo "$(msg "script.runbook.e2e_config_version" "e2e: hotel config schemaVersion: {version}." version="$(field schemaVersion "$CONFIG_RESP")")"

step "script.runbook.e2e_step_hotel_config" "e2e: === Hotel config: apply the deployment set (FR-ADM-1, FR-ADM-4, NFR-DEP-1) ==="
if [[ -f "$HOTEL_CONFIG" ]]; then
  ADMIN_IDENTITY="$ADMIN_IDENTITY" ADMIN_SECRET="$ADMIN_SECRET" \
    script/apply-hotel-config.sh --config "$HOTEL_CONFIG" --base-url "$BASE_URL" \
    || { teardown; exit 1; }
  pass "script.runbook.e2e_config_applied" "e2e: PASS: deployment set {config} applied with the hotel's own values in effect." config="$HOTEL_CONFIG"
else
  echo "$(msg "script.runbook.e2e_no_config" "e2e: no deployment set at {config}; desk runs on the boot seed values." config="$HOTEL_CONFIG")"
fi

step "script.runbook.e2e_step_guest" "e2e: === Guests: upsert the E2E guest (FR-GST-1) ==="
GUEST_ID="11111111-1111-4111-8111-111111111111"
api guests UpsertGuest "{\"guestId\": \"$GUEST_ID\", \"fullName\": \"E2E Guest\", \"contact\": {\"idDocument\": \"E2E-0001\"}, \"preferences\": {\"floor\": \"high\"}, \"notes\": \"E2E\", \"actor\": \"front-desk\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
pass "script.runbook.e2e_guest_ok" "e2e: PASS: guest {guestId} upserted." guestId="$GUEST_ID"

step "script.runbook.e2e_step_rooms" "e2e: === Rooms: set up one type and one room, check sellability ==="
ARRIVAL="$(date -d '+30 days' +%F)"
DEPARTURE="$(date -d '+32 days' +%F)"
NIGHT1="$(date -d '+30 days' +%F)"
NIGHT2="$(date -d '+31 days' +%F)"
TYPE_RESP="$(api rooms UpsertRoomType '{"name": "E2E Standard", "capacity": 2, "bedType": "double", "actor": "e2e"}' "$TOKEN")" || { teardown; exit 1; }
ROOM_TYPE_ID="$(field id "$TYPE_RESP")"
ROOM1_RESP="$(api rooms UpsertRoom "{\"number\": \"E2E-101\", \"roomType\": \"$ROOM_TYPE_ID\", \"actor\": \"e2e\"}" "$TOKEN")" || { teardown; exit 1; }
ROOM1_ID="$(field id "$ROOM1_RESP")"
ROOM2_RESP="$(api rooms UpsertRoom "{\"number\": \"E2E-102\", \"roomType\": \"$ROOM_TYPE_ID\", \"actor\": \"e2e\"}" "$TOKEN")" || { teardown; exit 1; }
ROOM2_ID="$(field id "$ROOM2_RESP")"
SELL_RESP="$(api rooms CheckRoomTypeSellability "{\"roomType\": \"$ROOM_TYPE_ID\", \"dateFrom\": \"$ARRIVAL\", \"dateTo\": \"$DEPARTURE\"}" "$TOKEN")" || { teardown; exit 1; }
SELLABLE="$(field sellableCount "$SELL_RESP")"
if [[ "$SELLABLE" -lt 1 ]]; then
  echo "$(msg "script.runbook.e2e_no_sellable" "e2e: FAIL: expected at least one sellable unit, got {sellable}." sellable="$SELLABLE")" >&2
  teardown; exit 1
fi
pass "script.runbook.e2e_sellable_ok" "e2e: PASS: room type {roomType} sellable ({sellable} unit(s)) for {arrival} to {departure}." roomType="$ROOM_TYPE_ID" sellable="$SELLABLE" arrival="$ARRIVAL" departure="$DEPARTURE"

step "script.runbook.e2e_step_rates" "e2e: === Rates: plan, nightly prices, restriction check, quote ==="
api rates UpsertRatePlan '{"name": "E2E-RACK", "description": "E2E rack rate", "defaultUnits": 1}' "$TOKEN" >/dev/null || { teardown; exit 1; }
api rates UpsertRatePrice "{\"ratePlanName\": \"E2E-RACK\", \"roomTypeId\": \"$ROOM_TYPE_ID\", \"nightDate\": \"$NIGHT1\", \"priceMinor\": 120000}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api rates UpsertRatePrice "{\"ratePlanName\": \"E2E-RACK\", \"roomTypeId\": \"$ROOM_TYPE_ID\", \"nightDate\": \"$NIGHT2\", \"priceMinor\": 120000}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api rates CheckRestrictions "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$ARRIVAL\", \"departureDate\": \"$DEPARTURE\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
COUNT_RESP="$(api rates CheckSellableCount "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"dateFrom\": \"$ARRIVAL\", \"dateTo\": \"$DEPARTURE\", \"totalUnits\": $SELLABLE}" "$TOKEN")" || { teardown; exit 1; }
QUOTE_RESP="$(api rates QuotePrice "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$ARRIVAL\", \"departureDate\": \"$DEPARTURE\", \"ratePlanName\": \"E2E-RACK\"}" "$TOKEN")" || { teardown; exit 1; }
TOTAL="$(field totalMinor "$QUOTE_RESP")"
pass "script.runbook.e2e_quote_ok" "e2e: PASS: quoted total {total} minor units for 2 nights (sellability input: {count})." total="$TOTAL" count="$COUNT_RESP"

step "script.runbook.e2e_step_book" "e2e: === Reservations: book one reservation (RES -> RATE -> ROOM inputs) ==="
IDEM="e2e-$(date +%s)"
# guestId is a fixed valid UUID: the contract declares format uuid
# and strict validation would refuse a non-UUID reference.
BOOK_RESP="$(api reservations CreateReservation "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$ARRIVAL\", \"departureDate\": \"$DEPARTURE\", \"guest\": {\"guestId\": \"$GUEST_ID\", \"fullName\": \"E2E Guest\", \"idDocument\": \"E2E-0001\"}, \"sellableUnits\": $SELLABLE, \"priceBasis\": {\"totalMinor\": $TOTAL}, \"idempotencyKey\": \"$IDEM\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
REF="$(field reservationRef "$BOOK_RESP")"
STATE="$(field state "$BOOK_RESP")"
if [[ "$STATE" != "confirmed" || -z "$REF" ]]; then
  echo "$(msg "script.runbook.e2e_booking_failed" "e2e: FAIL: booking did not confirm: {body}." body="$BOOK_RESP")" >&2
  teardown; exit 1
fi
pass "script.runbook.e2e_booking_ok" "e2e: PASS: booked reservation {ref} (state confirmed, quoted total {total})." ref="$REF" total="$(field quotedTotal "$BOOK_RESP")"

step "script.runbook.e2e_step_verify_booking" "e2e: === verify the booking ==="
GET_RESP="$(api reservations GetReservation "{\"reservationRef\": \"$REF\"}" "$TOKEN")" || { teardown; exit 1; };
[[ "$(field state "$GET_RESP")" == "confirmed" ]] || { echo "$(msg "script.runbook.e2e_get_mismatch" "e2e: FAIL: GetReservation state mismatch: {body}." body="$GET_RESP")" >&2; teardown; exit 1; }
CAL_RESP="$(api reservations QueryCalendar "{\"dateFrom\": \"$ARRIVAL\", \"dateTo\": \"$DEPARTURE\", \"roomTypeId\": \"$ROOM_TYPE_ID\"}" "$TOKEN")" || { teardown; exit 1; };
python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if any(r.get("reservationRef") == sys.argv[1] for r in d.get("reservations", [])) else 1)' "$REF" <<<"$CAL_RESP" \
  || { echo "$(msg "script.runbook.e2e_calendar_missing" "e2e: FAIL: calendar does not list {ref}." ref="$REF")" >&2; teardown; exit 1; }
pass "script.runbook.e2e_verify_ok" "e2e: PASS: GetReservation and QueryCalendar both show {ref} confirmed." ref="$REF"

step "script.runbook.e2e_step_confirmation" "e2e: === Guests: attach the RES-side snapshot, produce the confirmation (FR-GST-4) ==="
ATTACH_PAYLOAD="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({"reservationRef": d["reservationRef"], "guest": {"guestId": d["guest"]["guestId"], "fullName": d["guest"]["fullName"]}, "dates": {"checkIn": d["arrivalDate"], "checkOut": d["departureDate"]}, "type": d["roomTypeId"], "price": {"amountMinor": d["priceBasis"]["totalMinor"]}}))' <<<"$GET_RESP")" || { teardown; exit 1; }
api guests AttachReservation "$ATTACH_PAYLOAD" "$TOKEN" >/dev/null || { teardown; exit 1; }
CONFIRM_RESP="$(api guests ProduceConfirmation "{\"reservationRef\": \"$REF\"}" "$TOKEN")" || { teardown; exit 1; }
python3 -c 'import json,sys; d=json.load(sys.stdin); exp={"ref": sys.argv[1], "guest": sys.argv[2], "checkIn": sys.argv[3], "checkOut": sys.argv[4], "total": int(sys.argv[5])}; sys.exit(0 if (d.get("reservationRef") == exp["ref"] and d.get("guest", {}).get("fullName") == exp["guest"] and d.get("dates", {}).get("checkIn") == exp["checkIn"] and d.get("dates", {}).get("checkOut") == exp["checkOut"] and d.get("price", {}).get("amountMinor") == exp["total"] and "hotel" not in d) else 1)' "$REF" "E2E Guest" "$ARRIVAL" "$DEPARTURE" "$TOTAL" <<<"$CONFIRM_RESP" \
  || { echo "$(msg "script.runbook.e2e_confirmation_mismatch" "e2e: FAIL: confirmation does not match the booking: {body}." body="$CONFIRM_RESP")" >&2; teardown; exit 1; }
pass "script.runbook.e2e_confirmation_ok" "e2e: PASS: confirmation produced for {ref} (guest {guest}, {arrival} to {departure}, total {total})." ref="$REF" guest="E2E Guest" arrival="$ARRIVAL" departure="$DEPARTURE" total="$TOTAL"

step "script.runbook.e2e_step_checkin" "e2e: === check in one stay for tonight (FR-FDK-1, NFR-CON-2) ==="
TODAY="$(date +%F)"
TOMORROW="$(date -d '+1 day' +%F)"
PLUS2="$(date -d '+2 days' +%F)"
api rates UpsertRatePrice "{\"ratePlanName\": \"E2E-RACK\", \"roomTypeId\": \"$ROOM_TYPE_ID\", \"nightDate\": \"$TODAY\", \"priceMinor\": 120000}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api rates UpsertRatePrice "{\"ratePlanName\": \"E2E-RACK\", \"roomTypeId\": \"$ROOM_TYPE_ID\", \"nightDate\": \"$TOMORROW\", \"priceMinor\": 120000}" "$TOKEN" >/dev/null || { teardown; exit 1; }
TODAY_QUOTE="$(api rates QuotePrice "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$TODAY\", \"departureDate\": \"$PLUS2\", \"ratePlanName\": \"E2E-RACK\"}" "$TOKEN")" || { teardown; exit 1; }
TODAY_TOTAL="$(field totalMinor "$TODAY_QUOTE")"
TODAY_BOOK="$(api reservations CreateReservation "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$TODAY\", \"departureDate\": \"$PLUS2\", \"guest\": {\"guestId\": \"$GUEST_ID\", \"fullName\": \"E2E Guest\"}, \"sellableUnits\": $SELLABLE, \"priceBasis\": {\"totalMinor\": $TODAY_TOTAL}, \"idempotencyKey\": \"$IDEM-today\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
TODAY_REF="$(field reservationRef "$TODAY_BOOK")"
TODAY_RESID="$(field reservationId "$TODAY_BOOK")"
[[ -n "$TODAY_RESID" ]] || { echo "$(msg "script.runbook.e2e_no_reservation_id" "e2e: FAIL: booking returned no reservationId.")" >&2; teardown; exit 1; }
STAY_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
api rooms AssignRoom "{\"roomNumber\": \"E2E-101\", \"businessDate\": \"$TODAY\", \"stayLink\": \"$STAY_ID\", \"actor\": \"front-desk\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api stay CheckIn "{\"stayId\": \"$STAY_ID\", \"reservationId\": \"$TODAY_RESID\", \"guestId\": \"$GUEST_ID\", \"roomId\": \"$ROOM1_ID\", \"actor\": \"front-desk\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api reservations CheckInReservation "{\"reservationRef\": \"$TODAY_REF\", \"stayId\": \"$STAY_ID\", \"actor\": \"front-desk\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
pass "script.runbook.e2e_checkin_ok" "e2e: PASS: stay {stay} in-house for reservation {ref}." stay="$STAY_ID" ref="$TODAY_REF"

step "script.runbook.e2e_step_move" "e2e: === move the guest mid-stay (FR-FDK-3) ==="
api rooms AssignRoom "{\"roomNumber\": \"E2E-102\", \"businessDate\": \"$TODAY\", \"stayLink\": \"$STAY_ID\", \"actor\": \"front-desk\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
MOVE_RESP="$(api stay MoveRoom "{\"stayId\": \"$STAY_ID\", \"toRoomId\": \"$ROOM2_ID\", \"idempotencyKey\": \"$IDEM-move\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field roomId "$MOVE_RESP")" == "$ROOM2_ID" ]] || { echo "$(msg "script.runbook.e2e_move_failed" "e2e: FAIL: move did not link {room}: {body}." room="$ROOM2_ID" body="$MOVE_RESP")" >&2; teardown; exit 1; }
REL1_RESP="$(api rooms ReleaseRoom "{\"roomNumber\": \"E2E-101\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field newState "$REL1_RESP")" == "vacant-dirty" ]] || { echo "$(msg "script.runbook.e2e_release1_failed" "e2e: FAIL: old room not released vacant-dirty: {body}." body="$REL1_RESP")" >&2; teardown; exit 1; }
pass "script.runbook.e2e_move_ok" "e2e: PASS: stay {stay} moved to E2E-102, E2E-101 vacant-dirty." stay="$STAY_ID"

step "script.runbook.e2e_step_times" "e2e: === record the early arrival and check the daily lists (FR-FDK-4/5) ==="
TIMES_RESP="$(api stay RecordActualTimes "{\"stayId\": \"$STAY_ID\", \"actualArrival\": \"${TODAY}T05:30:00Z\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field actualArrival "$TIMES_RESP")" == "${TODAY}T05:30:00.000Z" ]] || { echo "$(msg "script.runbook.e2e_arrival_failed" "e2e: FAIL: actual arrival not kept: {body}." body="$TIMES_RESP")" >&2; teardown; exit 1; }
LISTS_RESP="$(api stay ListArrivalsDepartures "{\"businessDate\": \"$TODAY\"}" "$TOKEN")" || { teardown; exit 1; }
python3 - "$LISTS_RESP" "$STAY_ID" <<'PYEOF' \
  || { echo "$(msg "script.runbook.e2e_lists_failed" "e2e: FAIL: stay missing from the daily lists.")" >&2; teardown; exit 1; }
import json, sys
lists, stay = json.loads(sys.argv[1]), sys.argv[2]
assert any(s.get("stayId") == stay for s in lists["arrivals"]), lists
assert any(s.get("stayId") == stay for s in lists["inHouse"]), lists
PYEOF
pass "script.runbook.e2e_lists_ok" "e2e: PASS: early arrival kept, stay listed in arrivals and in-house."

step "script.runbook.e2e_step_billing" "e2e: === folio charge, payment, invoice/receipt, and day-close (FR-BIL-1/2/3/4/6, FR-CUS-3) ==="
api billing UpsertChargeItem '{"name": "E2E Breakfast", "priceMinor": 2500, "actor": "manager"}' "$TOKEN" >/dev/null || { teardown; exit 1; }
api billing PostCharge "{\"stayId\": \"$STAY_ID\", \"itemKind\": \"nightly-room-charge\", \"itemName\": \"Room E2E-101\", \"amountMinor\": 120000, \"idempotencyKey\": \"$IDEM-charge\", \"actor\": \"front-desk\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api billing PostCharge "{\"stayId\": \"$STAY_ID\", \"itemKind\": \"charge-item\", \"itemName\": \"E2E Breakfast\", \"amountMinor\": 2500, \"idempotencyKey\": \"$IDEM-charge-item\", \"actor\": \"front-desk\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
PAY_RESP="$(api billing RecordPayment "{\"stayId\": \"$STAY_ID\", \"method\": \"cash\", \"amountMinor\": 60000, \"idempotencyKey\": \"$IDEM-payment\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
FOLIO_BALANCE="$(field balanceMinor "$PAY_RESP")"
PAYMENT_ID="$(field paymentId "$PAY_RESP")"
DAY_CLOSE="$(api billing RunDayClose "{\"businessDate\": \"$TODAY\", \"actor\": \"manager\"}" "$TOKEN")" || { teardown; exit 1; }
CHARGES_TOTAL="$(field chargesTotalMinor "$DAY_CLOSE")"
FOLIO_RESP="$(api billing GetFolioBalance "{\"stayId\": \"$STAY_ID\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
FOLIO_ID="$(field folioId "$FOLIO_RESP")"
INVOICE_RESP="$(api billing ProduceInvoice "{\"folioId\": \"$FOLIO_ID\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
python3 - "$INVOICE_RESP" "$FOLIO_RESP" <<'PYEOF' \
  || { echo "$(msg "script.runbook.e2e_invoice_failed" "e2e: FAIL: invoice does not match the folio.")" >&2; teardown; exit 1; }
import json, sys
invoice, folio = (json.loads(a) for a in sys.argv[1:3])
assert invoice["invoiceId"] == invoice["folioId"] == folio["folioId"], invoice
assert invoice["stayId"] == folio["stayId"], invoice
assert invoice["balanceMinor"] == folio["balanceMinor"], invoice
assert [c["itemName"] for c in invoice["charges"]] == [c["itemName"] for c in folio["charges"]], invoice
assert [c["amountMinor"] for c in invoice["charges"]] == [c["amountMinor"] for c in folio["charges"]], invoice
assert [p["paymentId"] for p in invoice["payments"]] == [p["paymentId"] for p in folio["payments"]], invoice
assert any(c["itemName"] == "E2E Breakfast" for c in invoice["charges"]), invoice
PYEOF
RECEIPT_RESP="$(api billing ProduceReceipt "{\"paymentId\": \"$PAYMENT_ID\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
python3 - "$RECEIPT_RESP" "$PAY_RESP" <<'PYEOF' \
  || { echo "$(msg "script.runbook.e2e_receipt_failed" "e2e: FAIL: receipt does not match the recorded payment.")" >&2; teardown; exit 1; }
import json, sys
receipt, payment = (json.loads(a) for a in sys.argv[1:3])
assert receipt["receiptId"] == receipt["paymentId"] == payment["paymentId"], receipt
assert receipt["folioId"] == payment["folioId"], receipt
assert receipt["method"] == payment["method"] == "cash", receipt
assert receipt["amountMinor"] == payment["amountMinor"] == 60000, receipt
PYEOF
pass "script.runbook.e2e_billing_ok" "e2e: PASS: day-close {date} charges={charges} folio balance={balance}; invoice matches folio, receipt matches cash payment." date="$TODAY" charges="$CHARGES_TOTAL" balance="$FOLIO_BALANCE"

step "script.runbook.e2e_step_checkout" "e2e: === check out with folio review (FR-FDK-2, FR-BIL-7) ==="
expect_refusal stay CheckOut "{\"stayId\": \"$STAY_ID\", \"folioId\": \"$FOLIO_ID\", \"folioBalanceMinor\": $FOLIO_BALANCE, \"actor\": \"front-desk\"}" "$TOKEN" "SETTLEMENT_REQUIRED" || { teardown; exit 1; }
pass "script.runbook.e2e_refusal_checkout_ok" "e2e: PASS: open-balance check-out refused, stay remains in house."
api billing RecordOpenBalanceApproval "{\"stayId\": \"$STAY_ID\", \"approvedBy\": \"owner\", \"role\": \"manager\", \"reason\": \"E2E approved\", \"idempotencyKey\": \"$IDEM-approval\", \"actor\": \"manager\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
# The folio must read the recorded approval back as the contracted
# object (issue #347): CheckOut carries the folio-read value — never
# a retyped copy — so the loop proves the produce → read → checkout
# round trip end to end.
FOLIO_APPROVED_RESP="$(api billing GetFolioBalance "{\"stayId\": \"$STAY_ID\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
CHECKOUT_BODY="$(python3 - "$FOLIO_APPROVED_RESP" "$STAY_ID" "$FOLIO_ID" "$FOLIO_BALANCE" "$TODAY" "$IDEM-checkout" <<'PYEOF'
import json, sys
folio, stay_id, folio_id, balance, today, idem = sys.argv[1:7]
approval = json.loads(folio)["openBalanceApproval"]
assert isinstance(approval, dict), approval
print(json.dumps({"stayId": stay_id, "folioId": folio_id, "folioBalanceMinor": int(balance),
    "openBalanceApproval": approval, "actualDeparture": today + "T14:00:00Z",
    "idempotencyKey": idem, "actor": "front-desk"}))
PYEOF
)" || { echo "$(msg "script.runbook.e2e_approval_shape" "e2e: FAIL: folio approval is not the contracted object: {body}." body="$FOLIO_APPROVED_RESP")" >&2; teardown; exit 1; }
CHECKOUT_RESP="$(api stay CheckOut "$CHECKOUT_BODY" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field state "$CHECKOUT_RESP")" == "closed" ]] || { echo "$(msg "script.runbook.e2e_not_closed" "e2e: FAIL: stay not closed: {body}." body="$CHECKOUT_RESP")" >&2; teardown; exit 1; }
[[ "$(field invoiceRef "$CHECKOUT_RESP")" == "$FOLIO_ID" ]] || { echo "$(msg "script.runbook.e2e_invoice_ref" "e2e: FAIL: invoice is not the folio: {body}." body="$CHECKOUT_RESP")" >&2; teardown; exit 1; }
expect_refusal stay GetStayRef "{\"stayId\": \"$STAY_ID\"}" "$TOKEN" "STATE_ILLEGAL" || { teardown; exit 1; }
REL2_RESP="$(api rooms ReleaseRoom "{\"roomNumber\": \"E2E-102\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field newState "$REL2_RESP")" == "vacant-dirty" ]] || { echo "$(msg "script.runbook.e2e_release2_failed" "e2e: FAIL: room not released vacant-dirty: {body}." body="$REL2_RESP")" >&2; teardown; exit 1; }
pass "script.runbook.e2e_checkout_ok" "e2e: PASS: stay {stay} closed with invoice {folio}, E2E-102 vacant-dirty." stay="$STAY_ID" folio="$FOLIO_ID"

step "script.runbook.e2e_step_expectation" "e2e: === write the restore expectation record ==="
EXPECT_FILE="$STAGING_DIR/e2e-expect.json"
# Direct invocations may point at a fresh --staging-dir that nothing
# has created yet (backup.sh runs mkdir -p only in step 14), so
# ensure it exists before the expectation record write below.
mkdir -p "$STAGING_DIR"
PAYMENTS_JSON="$(python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["paymentsByMethod"], sort_keys=True))' <<<"$DAY_CLOSE")"
# Pre-failure ground truth for the runbook section 5 owner checks
# (issue #117): the hotel's own name, the checked-in room's state,
# and the rate plan's nightly prices, read from the live database
# just before the backup so the drill compares against what the
# desk actually showed.
HOTEL_NAME="$("${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -tAc "SELECT name FROM admin.hotel_profile LIMIT 1;")"
ROOM_STATE="$("${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -tAc "SELECT state FROM rooms.rooms WHERE number = 'E2E-101';")"
RATE_PRICES_JSON="$("${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -tAc "SELECT coalesce(json_object_agg(night_date::text, price_minor ORDER BY night_date)::text, '{}') FROM rates.rate_prices WHERE rate_plan_id = (SELECT id FROM rates.rate_plans WHERE name = 'E2E-RACK');")"
python3 - "$EXPECT_FILE" "$TODAY" "$TODAY_REF" "$STAY_ID" "$FOLIO_ID" "$FOLIO_BALANCE" "$CHARGES_TOTAL" "$PAYMENTS_JSON" "$HOTEL_NAME" "$ROOM_STATE" "$RATE_PRICES_JSON" <<'PYEOF'
import json, sys
_, path, today, ref, stay, folio, balance, charges, payments, hotel, room_state, prices = sys.argv
record = {
    "arrivalsDate": today,
    "arrivalRefs": [ref],
    "reservationRef": ref,
    "reservationState": "checked-in",
    "stayId": stay,
    "stayState": "closed",
    "folioId": folio,
    "folioBalanceMinor": int(balance),
    "dayClose": {
        "businessDate": today,
        "chargesTotalMinor": int(charges),
        "paymentsByMethod": json.loads(payments),
    },
    "hotelName": hotel,
    "roomNumber": "E2E-101",
    "roomState": room_state,
    "ratePlanName": "E2E-RACK",
    "ratePrices": {k: int(v) for k, v in json.loads(prices).items()},
}
json.dump(record, open(path, "w"), indent=2)
PYEOF
echo "$(msg "script.runbook.e2e_expectation" "e2e: expectation record: {record}." record="$(cat "$EXPECT_FILE")")"

step "script.runbook.e2e_step_backup" "e2e: === backup the engine ==="
DB_PASSWORD="$DB_PASSWORD_CHECK" script/backup.sh --staging-dir "$STAGING_DIR" --label e2e \
  || { echo "$(msg "script.runbook.e2e_backup_failed" "e2e: FAIL: backup step failed.")" >&2; teardown; exit 1; }

step "script.runbook.e2e_step_report" "e2e: === desk shows the newest backup report (issue #116) ==="
DESK_REPORT="$(curl -fsS --noproxy '*' --max-time 10 "$BASE_URL/backup-report.json")" \
  || { echo "$(msg "script.runbook.e2e_no_report" "e2e: FAIL: the desk backup report is not served.")" >&2; teardown; exit 1; }
python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("outcome") == "success" and "Backup succeeded at" in d.get("line", "") else 1)' <<<"$DESK_REPORT" \
  || { echo "$(msg "script.runbook.e2e_report_failed" "e2e: FAIL: the desk does not show the backup success line: {report}." report="$DESK_REPORT")" >&2; teardown; exit 1; }
pass "script.runbook.e2e_report_ok" "e2e: PASS: desk shows the backup success line through the proxy."

step "script.runbook.e2e_step_drill" "e2e: === restore drill (verify-only) inside the RTO budget ==="
script/restore.sh --verify-only --staging-dir "$STAGING_DIR" --expect-file "$EXPECT_FILE" \
  || { echo "$(msg "script.runbook.e2e_drill_failed" "e2e: FAIL: restore drill failed.")" >&2; teardown; exit 1; }

step "script.runbook.e2e_step_reverify" "e2e: === re-verify the desk after the drill ==="
REGET_RESP="$(api reservations GetReservation "{\"reservationRef\": \"$REF\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field state "$REGET_RESP")" == "confirmed" ]] || { echo "$(msg "script.runbook.e2e_booking_lost" "e2e: FAIL: booking lost after drill.")" >&2; teardown; exit 1; }
TODAY_REGET="$(api reservations GetReservation "{\"reservationRef\": \"$TODAY_REF\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field state "$TODAY_REGET")" == "checked-in" ]] || { echo "$(msg "script.runbook.e2e_checkin_lost" "e2e: FAIL: checked-in booking lost after drill.")" >&2; teardown; exit 1; }
TODAY_STAY="$(api stay GetStay "{\"stayId\": \"$STAY_ID\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field state "$TODAY_STAY")" == "closed" ]] || { echo "$(msg "script.runbook.e2e_stay_lost" "e2e: FAIL: closed stay lost after drill.")" >&2; teardown; exit 1; }
TODAY_LISTS="$(api stay ListArrivalsDepartures "{\"businessDate\": \"$TODAY\"}" "$TOKEN")" || { teardown; exit 1; }
python3 - "$TODAY_LISTS" "$STAY_ID" <<'PYEOF' \
  || { echo "$(msg "script.runbook.e2e_departures_lost" "e2e: FAIL: closed stay missing from departures after drill.")" >&2; teardown; exit 1; }
import json, sys
lists, stay = json.loads(sys.argv[1]), sys.argv[2]
assert any(s.get("stayId") == stay for s in lists["departures"]), lists
PYEOF
TODAY_DAY="$(api billing GetDayClose "{\"businessDate\": \"$TODAY\"}" "$TOKEN")" || { teardown; exit 1; }
python3 - "$EXPECT_FILE" "$TODAY_DAY" <<'PYEOF'
import json, sys
expect = json.load(open(sys.argv[1]))
actual = json.loads(sys.argv[2])
day = expect["dayClose"]
assert actual["businessDate"] == day["businessDate"], actual
assert actual["chargesTotalMinor"] == day["chargesTotalMinor"], actual
assert actual["paymentsByMethod"] == day["paymentsByMethod"], actual
PYEOF
[ $? -eq 0 ] || { echo "$(msg "script.runbook.e2e_dayclose_changed" "e2e: FAIL: day-close totals changed across the drill.")" >&2; teardown; exit 1; }
for module in reservations rates rooms admin stay guests billing; do
  curl -fsS --noproxy '*' --max-time 10 "$BASE_URL/v1/$module/healthz" >/dev/null \
    || { echo "$(msg "script.runbook.e2e_unhealthy" "e2e: FAIL: {module} unhealthy after drill." module="$module")" >&2; teardown; exit 1; }
done
pass "script.runbook.e2e_reverify_ok" "e2e: PASS: booking {ref} still confirmed, stay {stay} closed, day-close {date} intact; desk modules healthy after the drill." ref="$REF" stay="$STAY_ID" date="$TODAY"

ELAPSED="$(( $(date +%s) - START_EPOCH ))"
echo "$(msg "script.runbook.e2e_evidence" "e2e: EVIDENCE: reservation={ref} state=confirmed totalMinor={total} arrival={arrival} departure={departure} stay={stay} state=closed invoice={folio} dayCloseDate={date} chargesTotal={charges} folioBalance={balance} elapsed={elapsed}s (RTO budget 4h)." ref="$REF" total="$TOTAL" arrival="$ARRIVAL" departure="$DEPARTURE" stay="$STAY_ID" folio="$FOLIO_ID" date="$TODAY" charges="$CHARGES_TOTAL" balance="$FOLIO_BALANCE" elapsed="$ELAPSED")"
teardown
echo "$(msg "script.runbook.e2e_succeeded" "e2e: SUCCEEDED.")"
