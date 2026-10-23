#!/usr/bin/env bash
#
# Desk-loop E2E for the walking skeleton on a single host (issue #113).
#
# Proves the Phase 3 slice end to end through the reverse proxy:
# Admin sign-in and config, Rooms setup and sellability, Rates plan
# and quote, Reservations booking through the real RES -> RATE ->
# ROOM input path, then backup -> restore drill -> re-verify, per
# docs/devops/deployment.md section 3 step 6 and
# docs/operations/backup-dr.md section 4.
#
# Sequence: book -> verify -> backup -> restore -> verify.
#
# Usage (from the repo root, after script/preflight.sh passes):
#   DB_PASSWORD=<secret> ADMIN_BOOT_SECRET=<secret> \
#     script/e2e-desk-loop.sh [--base-url http://127.0.0.1] \
#     [--staging-dir ./backup-staging] [--keep-up]
#
# The stack is brought up fresh (docker compose up -d --build),
# migrations and the boot seed are applied idempotently, and the
# stack is left running unless --keep-up is omitted (default tears
# down in reverse stop order). The desk signs in as ADMIN_IDENTITY
# with the provisioned ADMIN_BOOT_SECRET (override with
# ADMIN_SECRET); both secrets fail closed on dev defaults per the
# same denylist as script/preflight.sh. Never prints secret values.

set -euo pipefail

BASE_URL="http://127.0.0.1"
STAGING_DIR="./backup-staging"
TEARDOWN=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:?--base-url needs a URL}"; shift 2 ;;
    --staging-dir)
      STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
    --keep-up)
      TEARDOWN=0; shift ;;
    *)
      echo "e2e: unknown argument: $1" >&2
      echo "usage: script/e2e-desk-loop.sh [--base-url URL] [--staging-dir DIR] [--keep-up]" >&2
      exit 2 ;;
  esac
done

COMPOSE=(docker compose -f deploy/compose.yaml)
ADMIN_IDENTITY="${ADMIN_IDENTITY:-owner}"
# ADMIN_SECRET defaults to the provisioned boot secret later (after
# the fail-closed gate); an explicit override is honoured as-is.
START_EPOCH="$(date +%s)"

step() { echo "e2e: === $1 ==="; }
pass() { echo "e2e: PASS: $1"; }

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
    || { echo "e2e: FAIL: POST /v1/$contract/$operation unreachable." >&2; rm -f "$tmp"; return 1; }
  body="$(cat "$tmp")"
  rm -f "$tmp"
  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "e2e: FAIL: /v1/$contract/$operation HTTP $http_code: $body" >&2
    return 1
  fi
  if python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if "code" in d else 1)' <<<"$body" 2>/dev/null; then
    echo "e2e: FAIL: /v1/$contract/$operation refused: $body" >&2
    return 1
  fi
  printf '%s' "$body"
}

field() {
  python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$1" <<<"$2"
}

teardown() {
  if [[ "$TEARDOWN" -eq 1 ]]; then
    echo "e2e: tearing down in reverse stop order (deployment.md section 4)."
    "${COMPOSE[@]}" stop proxy >/dev/null 2>&1 || true
    "${COMPOSE[@]}" stop reservations rates reporting stay rooms guests billing admin >/dev/null 2>&1 || true
    "${COMPOSE[@]}" stop db >/dev/null 2>&1 || true
  fi
}

step "bring up the single-host stack"
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
  echo "e2e: FAIL: DB_PASSWORD is unset or still a dev default; set the per-sale database secret (script/preflight.sh gates the same list)." >&2
  exit 1
fi
if is_default_secret "$ADMIN_BOOT_SECRET_CHECK"; then
  echo "e2e: FAIL: ADMIN_BOOT_SECRET is unset or still a dev default; provision the per-sale owner boot secret (script/preflight.sh gates the same list)." >&2
  exit 1
fi
# The desk signs in with the provisioned per-sale boot secret unless
# an explicit ADMIN_SECRET override is given.
ADMIN_SECRET="${ADMIN_SECRET:-$ADMIN_BOOT_SECRET_CHECK}"
if [[ -z "$ADMIN_SECRET" ]]; then
  echo "e2e: FAIL: ADMIN_SECRET is empty after defaults." >&2
  exit 1
fi
"${COMPOSE[@]}" up -d --build
"${COMPOSE[@]}" exec -T db bash -c 'until pg_isready -U hotel -d hotel; do sleep 2; done'

step "wait for every module through the proxy"
for module in reservations rates reporting stay rooms guests billing admin; do
  for _ in $(seq 1 24); do
    if curl -fsS --noproxy '*' --max-time 5 "$BASE_URL/v1/$module/healthz" >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done
  if ! curl -fsS --noproxy '*' --max-time 10 "$BASE_URL/v1/$module/healthz" >/dev/null; then
    echo "e2e: FAIL: $module never answered through the proxy." >&2
    echo "e2e: --- compose state ---" >&2
    "${COMPOSE[@]}" ps >&2 || true
    echo "e2e: --- proxy log tail ---" >&2
    "${COMPOSE[@]}" logs --tail=50 proxy >&2 || true
    teardown; exit 1
  fi
  pass "$module answers through the proxy."
done

step "apply boot migrations and the boot seed (idempotent)"
MIGRATIONS=(
  services/reservations/migrations/000001_boot.up.sql
  services/reservations/migrations/000002_schema.up.sql
  services/rates/migrations/000001_boot.up.sql
  services/rates/migrations/000002_schema.up.sql
  services/reporting/migrations/000001_boot.up.sql
  services/stay/migrations/001_boot.sql
  services/rooms/migrations/001_boot.sql
  services/rooms/migrations/002_schema.sql
  services/guests/migrations/001_boot.sql
  services/admin/migrations/001_boot.sql
  services/admin/migrations/002_schema.sql
  services/billing/src/main/resources/db/migration/V1__boot.sql
)
for migration in "${MIGRATIONS[@]}"; do
  "${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -v ON_ERROR_STOP=1 -f - <"$migration" >/dev/null \
    || { echo "e2e: FAIL: migration $migration did not apply." >&2; teardown; exit 1; }
done
"${COMPOSE[@]}" exec -T db psql -U hotel -d hotel -v ON_ERROR_STOP=1 -f - <deploy/seed/boot.sql >/dev/null \
  || { echo "e2e: FAIL: boot seed did not apply." >&2; teardown; exit 1; }
pass "migrations and boot seed applied."

step "Admin: sign in and read the hotel config"
SIGNIN_RESP="$(api admin SignIn "{\"signinIdentity\": \"$ADMIN_IDENTITY\", \"secret\": \"$ADMIN_SECRET\"}")" \
  || { teardown; exit 1; }
TOKEN="$(field token "$SIGNIN_RESP")"
[[ -n "$TOKEN" ]] || { echo "e2e: FAIL: sign-in returned no token." >&2; teardown; exit 1; }
pass "owner sign-in returned a session token."
CONFIG_RESP="$(api admin GetHotelConfig '{}' "$TOKEN")" || { teardown; exit 1; }
echo "e2e: hotel config schemaVersion: $(field schemaVersion "$CONFIG_RESP")"

step "Rooms: set up one type and one room, check sellability"
ARRIVAL="$(date -d '+30 days' +%F)"
DEPARTURE="$(date -d '+32 days' +%F)"
NIGHT1="$(date -d '+30 days' +%F)"
NIGHT2="$(date -d '+31 days' +%F)"
TYPE_RESP="$(api rooms UpsertRoomType '{"name": "E2E Standard", "capacity": 2, "bedType": "double", "actor": "e2e"}' "$TOKEN")" || { teardown; exit 1; }
ROOM_TYPE_ID="$(field id "$TYPE_RESP")"
api rooms UpsertRoom "{\"number\": \"E2E-101\", \"roomType\": \"$ROOM_TYPE_ID\", \"actor\": \"e2e\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
SELL_RESP="$(api rooms CheckRoomTypeSellability "{\"roomType\": \"$ROOM_TYPE_ID\", \"dateFrom\": \"$ARRIVAL\", \"dateTo\": \"$DEPARTURE\"}" "$TOKEN")" || { teardown; exit 1; }
SELLABLE="$(field sellableCount "$SELL_RESP")"
if [[ "$SELLABLE" -lt 1 ]]; then
  echo "e2e: FAIL: expected at least one sellable unit, got $SELLABLE." >&2
  teardown; exit 1
fi
pass "room type $ROOM_TYPE_ID sellable ($SELLABLE unit(s)) for $ARRIVAL to $DEPARTURE."

step "Rates: plan, nightly prices, restriction check, quote"
api rates UpsertRatePlan '{"name": "E2E-RACK", "description": "E2E rack rate", "defaultUnits": 1}' "$TOKEN" >/dev/null || { teardown; exit 1; }
api rates UpsertRatePrice "{\"ratePlanName\": \"E2E-RACK\", \"roomTypeId\": \"$ROOM_TYPE_ID\", \"nightDate\": \"$NIGHT1\", \"priceMinor\": 120000}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api rates UpsertRatePrice "{\"ratePlanName\": \"E2E-RACK\", \"roomTypeId\": \"$ROOM_TYPE_ID\", \"nightDate\": \"$NIGHT2\", \"priceMinor\": 120000}" "$TOKEN" >/dev/null || { teardown; exit 1; }
api rates CheckRestrictions "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$ARRIVAL\", \"departureDate\": \"$DEPARTURE\"}" "$TOKEN" >/dev/null || { teardown; exit 1; }
COUNT_RESP="$(api rates CheckSellableCount "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"dateFrom\": \"$ARRIVAL\", \"dateTo\": \"$DEPARTURE\", \"totalUnits\": $SELLABLE}" "$TOKEN")" || { teardown; exit 1; }
QUOTE_RESP="$(api rates QuotePrice "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$ARRIVAL\", \"departureDate\": \"$DEPARTURE\", \"ratePlanName\": \"E2E-RACK\"}" "$TOKEN")" || { teardown; exit 1; }
TOTAL="$(field totalMinor "$QUOTE_RESP")"
pass "quoted total $TOTAL minor units for 2 nights (sellability input: $COUNT_RESP)."

step "Reservations: book one reservation (RES -> RATE -> ROOM inputs)"
IDEM="e2e-$(date +%s)"
# guestId is a fixed valid UUID: the contract declares format uuid
# and strict validation would refuse a non-UUID reference.
BOOK_RESP="$(api reservations CreateReservation "{\"roomTypeId\": \"$ROOM_TYPE_ID\", \"arrivalDate\": \"$ARRIVAL\", \"departureDate\": \"$DEPARTURE\", \"guest\": {\"guestId\": \"11111111-1111-4111-8111-111111111111\", \"fullName\": \"E2E Guest\", \"idDocument\": \"E2E-0001\"}, \"sellableUnits\": $SELLABLE, \"priceBasis\": {\"totalMinor\": $TOTAL}, \"idempotencyKey\": \"$IDEM\", \"actor\": \"front-desk\"}" "$TOKEN")" || { teardown; exit 1; }
REF="$(field reservationRef "$BOOK_RESP")"
STATE="$(field state "$BOOK_RESP")"
if [[ "$STATE" != "confirmed" || -z "$REF" ]]; then
  echo "e2e: FAIL: booking did not confirm: $BOOK_RESP" >&2
  teardown; exit 1
fi
pass "booked reservation $REF (state confirmed, quoted total $(field quotedTotal "$BOOK_RESP"))."

step "verify the booking"
GET_RESP="$(api reservations GetReservation "{\"reservationRef\": \"$REF\"}" "$TOKEN")" || { teardown; exit 1; };
[[ "$(field state "$GET_RESP")" == "confirmed" ]] || { echo "e2e: FAIL: GetReservation state mismatch: $GET_RESP" >&2; teardown; exit 1; }
CAL_RESP="$(api reservations QueryCalendar "{\"dateFrom\": \"$ARRIVAL\", \"dateTo\": \"$DEPARTURE\", \"roomTypeId\": \"$ROOM_TYPE_ID\"}" "$TOKEN")" || { teardown; exit 1; };
python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if any(r.get("reservationRef") == sys.argv[1] for r in d.get("reservations", [])) else 1)' "$REF" <<<"$CAL_RESP" \
  || { echo "e2e: FAIL: calendar does not list $REF." >&2; teardown; exit 1; }
pass "GetReservation and QueryCalendar both show $REF confirmed."

step "backup the engine"
DB_PASSWORD="$DB_PASSWORD_CHECK" script/backup.sh --staging-dir "$STAGING_DIR" --label e2e \
  || { echo "e2e: FAIL: backup step failed." >&2; teardown; exit 1; }

step "restore drill (verify-only) inside the RTO budget"
script/restore.sh --verify-only --staging-dir "$STAGING_DIR" \
  || { echo "e2e: FAIL: restore drill failed." >&2; teardown; exit 1; }

step "re-verify the desk after the drill"
REGET_RESP="$(api reservations GetReservation "{\"reservationRef\": \"$REF\"}" "$TOKEN")" || { teardown; exit 1; }
[[ "$(field state "$REGET_RESP")" == "confirmed" ]] || { echo "e2e: FAIL: booking lost after drill." >&2; teardown; exit 1; }
for module in reservations rates rooms admin; do
  curl -fsS --noproxy '*' --max-time 10 "$BASE_URL/v1/$module/healthz" >/dev/null \
    || { echo "e2e: FAIL: $module unhealthy after drill." >&2; teardown; exit 1; }
done
pass "booking $REF still confirmed; desk modules healthy after the drill."

ELAPSED="$(( $(date +%s) - START_EPOCH ))"
echo "e2e: EVIDENCE: reservation=$REF state=confirmed totalMinor=$TOTAL arrival=$ARRIVAL departure=$DEPARTURE elapsed=${ELAPSED}s (RTO budget 4h)."
teardown
echo "e2e: SUCCEEDED."
