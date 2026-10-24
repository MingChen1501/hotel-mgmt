#!/usr/bin/env bash
#
# Timed desk checks for NFR-PERF-1 on the single-host lab (issue #182).
#
# Assumes the lab is already up (run after script/install.sh or after
# script/e2e-desk-loop.sh --keep-up) and never tears it down: the
# caller owns the stack lifecycle. Seeds a full 50-room book for
# tonight with 5 signed-in staff, then times each named view (2 s
# bound) and action (3 s bound) with nanosecond clocks.
#
# Variant rule (test-strategy L2): bounds are asserted ONLY with
# REFERENCE_HOST=1 on the 2*4*50 reference host. Everywhere else the
# run is a ci-e2e-variant: timings are printed and recorded, never
# compared against single-host bounds.
#
# Usage: DB_PASSWORD=... ADMIN_BOOT_SECRET=... \
#   script/e2e-perf-check.sh [--base-url URL] [--admin-identity ID]
# never prints secret values.
#
# Every timed line prints: PERF name=<op> elapsedMs=<n> env=<label>.

set -euo pipefail

BASE_URL="http://127.0.0.1"
ADMIN_IDENTITY="owner"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:?--base-url needs a URL}"; shift 2 ;;
    --admin-identity)
      ADMIN_IDENTITY="${2:?--admin-identity needs an identity}"; shift 2 ;;
    *)
      echo "perf: unknown argument: $1" >&2
      echo "usage: script/e2e-perf-check.sh [--base-url URL] [--admin-identity ID]" >&2
      exit 2 ;;
  esac
done

ADMIN_SECRET="${ADMIN_SECRET:-${ADMIN_BOOT_SECRET:-}}"
if [[ -z "$ADMIN_SECRET" ]]; then
  echo "perf: FAIL: ADMIN_SECRET (or ADMIN_BOOT_SECRET) is unset." >&2
  exit 1
fi

ENV_LABEL="${PERF_ENV_LABEL:-ci-e2e-variant}"
REFERENCE_HOST="${REFERENCE_HOST:-0}"

echo "perf: env nproc=$(nproc) mem=$(grep MemTotal /proc/meminfo | awk '{print $2 $3}') disk=$(df -m /tmp | awk 'NR==2 {print $4 "MiB-avail"}') label=$ENV_LABEL referenceHost=$REFERENCE_HOST"

step() { echo "perf: === $1 ==="; }
pass() { echo "perf: PASS: $1"; }
fail() { echo "perf: FAIL: $1" >&2; exit 1; }

# POST one contract operation through the proxy; prints the response
# body on success, fails on transport errors or envelope refusals.
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
    || { echo "perf: FAIL: POST /v1/$contract/$operation unreachable." >&2; rm -f "$tmp"; return 1; }
  body="$(cat "$tmp")"
  rm -f "$tmp"
  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "perf: FAIL: /v1/$contract/$operation HTTP $http_code: $body" >&2
    return 1
  fi
  if python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if "code" in d else 1)' <<<"$body" 2>/dev/null; then
    echo "perf: FAIL: /v1/$contract/$operation refused: $body" >&2
    return 1
  fi
  printf '%s' "$body"
}

field() {
  python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$1" <<<"$2"
}

# timed <name> <boundMs> <contract> <operation> <payload> <token>:
# runs the op, prints the PERF line, keeps the body in TIMED_RESP.
timed() {
  local name="$1" bound="$2"
  shift 2
  local start end elapsed
  start="$(date +%s%N)"
  TIMED_RESP="$(api "$@")" || return 1
  end="$(date +%s%N)"
  elapsed="$(( (end - start) / 1000000 ))"
  echo "PERF name=$name elapsedMs=$elapsed env=$ENV_LABEL"
  if [[ "$REFERENCE_HOST" == "1" && "$elapsed" -gt "$bound" ]]; then
    echo "perf: FAIL: $name took ${elapsed}ms on the reference host, bound ${bound}ms." >&2
    return 1
  fi
  return 0
}

TODAY="$(date +%F)"
TOMORROW="$(date -d '+1 day' +%F)"

step "owner sign-in and 5 staff sign-ins"
OWNER_SIGNIN="$(api admin SignIn "{\"signinIdentity\": \"$ADMIN_IDENTITY\", \"secret\": \"$ADMIN_SECRET\"}")" \
  || fail "owner sign-in failed."
OWNER_TOKEN="$(field token "$OWNER_SIGNIN")"
[[ -n "$OWNER_TOKEN" ]] || fail "owner sign-in returned no token."
STAFF_TOKENS=()
for i in 1 2 3 4 5; do
  api admin CreateUser "{\"displayName\": \"Perf Desk $i\", \"signinIdentity\": \"perf-desk-$i\", \"secret\": \"perf-desk-secret-$i\", \"role\": \"front-desk\"}" "$OWNER_TOKEN" >/dev/null \
    || fail "CreateUser perf-desk-$i failed."
  SIGNIN="$(api admin SignIn "{\"signinIdentity\": \"perf-desk-$i\", \"secret\": \"perf-desk-secret-$i\"}")" \
    || fail "sign-in perf-desk-$i failed."
  STAFF_TOKENS+=("$(field token "$SIGNIN")")
done
pass "5 staff signed in."

# Rotate the 5 staff tokens across timed calls.
tok() { printf '%s' "${STAFF_TOKENS[$(( $1 % 5 ))]}"; }

step "seed 50 rooms and the rate plan"
TYPE_RESP="$(api rooms UpsertRoomType '{"name": "PERF-Standard", "capacity": 2, "bedType": "double", "actor": "perf"}' "$OWNER_TOKEN")" \
  || fail "UpsertRoomType failed."
PERF_TYPE_ID="$(field id "$TYPE_RESP")"
[[ -n "$PERF_TYPE_ID" ]] || fail "room type returned no id."
ROOM_IDS=()
for n in $(seq 1 50); do
  NUM="$(printf 'PERF-%02d' "$n")"
  ROOM_RESP="$(api rooms UpsertRoom "{\"number\": \"$NUM\", \"roomType\": \"PERF-Standard\", \"floor\": \"1\", \"actor\": \"perf\"}" "$OWNER_TOKEN")" \
    || fail "UpsertRoom $NUM failed."
  ROOM_IDS+=("$(field id "$ROOM_RESP")")
done
api rates UpsertRatePlan '{"name": "PERF-RACK", "description": "perf rack rate", "defaultUnits": 1}' "$OWNER_TOKEN" >/dev/null \
  || fail "UpsertRatePlan failed."
api rates UpsertRatePrice "{\"ratePlanName\": \"PERF-RACK\", \"roomTypeId\": \"$PERF_TYPE_ID\", \"nightDate\": \"$TODAY\", \"priceMinor\": 120000}" "$OWNER_TOKEN" >/dev/null \
  || fail "UpsertRatePrice $TODAY failed."
QUOTE="$(api rates QuotePrice "{\"roomTypeId\": \"$PERF_TYPE_ID\", \"arrivalDate\": \"$TODAY\", \"departureDate\": \"$TOMORROW\", \"ratePlanName\": \"PERF-RACK\"}" "$OWNER_TOKEN")" \
  || fail "QuotePrice failed."
TOTAL="$(field totalMinor "$QUOTE")"
api guests UpsertGuest '{"guestId": "22222222-2222-4222-8222-222222222222", "fullName": "Perf Guest", "contact": {"idDocument": "PERF-0001"}, "actor": "front-desk"}' "$(tok 0)" >/dev/null \
  || fail "UpsertGuest failed."
pass "50 rooms, rate plan, and perf guest ready; one-night total $TOTAL."

step "seed a near-full book for tonight (48 of 50 units)"
for i in $(seq 1 48); do
  api reservations CreateReservation "{\"roomTypeId\": \"$PERF_TYPE_ID\", \"arrivalDate\": \"$TODAY\", \"departureDate\": \"$TOMORROW\", \"guest\": {\"guestId\": \"22222222-2222-4222-8222-222222222222\", \"fullName\": \"Perf Guest\"}, \"sellableUnits\": 50, \"priceBasis\": {\"totalMinor\": $TOTAL}, \"idempotencyKey\": \"perf-book-$i\", \"actor\": \"front-desk\"}" "$(tok "$i")" >/dev/null \
    || fail "seed booking perf-book-$i failed."
done
pass "48 bookings seeded."

step "open one stay with a charge for the folio views"
B1="$(api reservations CreateReservation "{\"roomTypeId\": \"$PERF_TYPE_ID\", \"arrivalDate\": \"$TODAY\", \"departureDate\": \"$TOMORROW\", \"guest\": {\"guestId\": \"22222222-2222-4222-8222-222222222222\", \"fullName\": \"Perf Guest\"}, \"sellableUnits\": 50, \"priceBasis\": {\"totalMinor\": $TOTAL}, \"idempotencyKey\": \"perf-book-setup\", \"actor\": \"front-desk\"}" "$(tok 0)")" \
  || fail "setup booking failed."
B1_RESID="$(field reservationId "$B1")"
api rooms AssignRoom "{\"roomNumber\": \"PERF-01\", \"businessDate\": \"$TODAY\", \"stayLink\": \"perf-setup-link\", \"actor\": \"front-desk\"}" "$(tok 1)" >/dev/null \
  || fail "AssignRoom PERF-01 failed."
SETUP_CHECKIN="$(api stay CheckIn "{\"reservationId\": \"$B1_RESID\", \"guestId\": \"22222222-2222-4222-8222-222222222222\", \"roomId\": \"${ROOM_IDS[0]}\", \"actor\": \"front-desk\"}" "$(tok 1)")" \
  || fail "setup CheckIn failed."
STAY_SETUP="$(field stayId "$SETUP_CHECKIN")"
[[ -n "$STAY_SETUP" ]] || fail "setup CheckIn returned no stayId."
api reservations CheckInReservation "{\"reservationRef\": \"$(field reservationRef "$B1")\", \"stayId\": \"$STAY_SETUP\", \"actor\": \"front-desk\"}" "$(tok 1)" >/dev/null \
  || fail "setup CheckInReservation failed."
api billing PostCharge "{\"stayId\": \"$STAY_SETUP\", \"itemKind\": \"nightly-room-charge\", \"itemName\": \"Room PERF-01\", \"amountMinor\": 120000, \"idempotencyKey\": \"perf-charge-setup\", \"actor\": \"front-desk\"}" "$(tok 2)" >/dev/null \
  || fail "setup PostCharge failed."
FOLIO_SETUP="$(api billing GetFolioBalance "{\"stayId\": \"$STAY_SETUP\", \"actor\": \"front-desk\"}" "$(tok 2)")" \
  || fail "setup GetFolioBalance failed."
FOLIO_SETUP_ID="$(field folioId "$FOLIO_SETUP")"
[[ -n "$FOLIO_SETUP_ID" ]] || fail "folio returned no id."
pass "stay $STAY_SETUP in-house with folio $FOLIO_SETUP_ID."

step "timed named views (bound 2000ms on the reference host only)"
rep=0
for round in 1 2 3; do
  timed "QueryCalendar" 2000 reservations QueryCalendar "{\"dateFrom\": \"$TODAY\", \"dateTo\": \"$TOMORROW\", \"roomTypeId\": \"$PERF_TYPE_ID\"}" "$(tok "$rep")" || fail "timed QueryCalendar failed."
  rep=$((rep+1))
  timed "CheckSellableCount" 2000 rates CheckSellableCount "{\"roomTypeId\": \"$PERF_TYPE_ID\", \"dateFrom\": \"$TODAY\", \"dateTo\": \"$TOMORROW\", \"totalUnits\": 50}" "$(tok "$rep")" || fail "timed CheckSellableCount failed."
  rep=$((rep+1))
  timed "ListArrivalsDepartures" 2000 stay ListArrivalsDepartures "{\"businessDate\": \"$TODAY\"}" "$(tok "$rep")" || fail "timed ListArrivalsDepartures failed."
  rep=$((rep+1))
  timed "GetFolioBalance" 2000 billing GetFolioBalance "{\"stayId\": \"$STAY_SETUP\", \"actor\": \"front-desk\"}" "$(tok "$rep")" || fail "timed GetFolioBalance failed."
  rep=$((rep+1))
done
pass "12 named-view timings recorded."

step "timed check-ins (bound 3000ms on the reference host only)"
for rep in 1 2; do
  BOOK="$(api reservations CreateReservation "{\"roomTypeId\": \"$PERF_TYPE_ID\", \"arrivalDate\": \"$TODAY\", \"departureDate\": \"$TOMORROW\", \"guest\": {\"guestId\": \"22222222-2222-4222-8222-222222222222\", \"fullName\": \"Perf Guest\"}, \"sellableUnits\": 50, \"priceBasis\": {\"totalMinor\": $TOTAL}, \"idempotencyKey\": \"perf-book-checkin-$rep\", \"actor\": \"front-desk\"}" "$(tok "$rep")")" \
    || fail "check-in booking $rep failed."
  STAY_LINK="perf-checkin-link-$rep"
  ROOM_N="$(printf 'PERF-%02d' "$(( rep + 1 ))")"
  api rooms AssignRoom "{\"roomNumber\": \"$ROOM_N\", \"businessDate\": \"$TODAY\", \"stayLink\": \"$STAY_LINK\", \"actor\": \"front-desk\"}" "$(tok "$rep")" >/dev/null \
    || fail "AssignRoom $ROOM_N failed."
  timed "CheckIn" 3000 stay CheckIn "{\"reservationId\": \"$(field reservationId "$BOOK")\", \"guestId\": \"22222222-2222-4222-8222-222222222222\", \"roomId\": \"${ROOM_IDS[$rep]}\", \"actor\": \"front-desk\"}" "$(tok "$rep")" \
    || fail "timed CheckIn $rep failed."
  STAY="$(field stayId "$TIMED_RESP")"
  [[ -n "$STAY" ]] || fail "timed CheckIn $rep returned no stayId."
  api reservations CheckInReservation "{\"reservationRef\": \"$(field reservationRef "$BOOK")\", \"stayId\": \"$STAY\", \"actor\": \"front-desk\"}" "$(tok "$rep")" >/dev/null \
    || fail "CheckInReservation $rep failed."
  eval "STAY_$rep=\"$STAY\"; ROOM_$rep=\"$ROOM_N\""
done
pass "full 50-unit book reached; 2 timed check-ins recorded."

step "timed charge posting and payment recording (bound 3000ms on the reference host only)"
for rep in 1 2 3; do
  timed "PostCharge" 3000 billing PostCharge "{\"stayId\": \"$STAY_SETUP\", \"itemKind\": \"nightly-room-charge\", \"itemName\": \"Room PERF-01 extra $rep\", \"amountMinor\": $(( 1000 + rep * 100 )), \"idempotencyKey\": \"perf-charge-$rep\", \"actor\": \"front-desk\"}" "$(tok "$rep")" \
    || fail "timed PostCharge $rep failed."
done
for rep in 1 2; do
  timed "RecordPayment" 3000 billing RecordPayment "{\"stayId\": \"$STAY_SETUP\", \"method\": \"cash\", \"amountMinor\": $(( 4000 + rep * 1000 )), \"idempotencyKey\": \"perf-pay-$rep\", \"actor\": \"front-desk\"}" "$(tok "$rep")" \
    || fail "timed RecordPayment $rep failed."
done
pass "3 charge and 2 payment timings recorded."

step "timed check-outs on settled folios (bound 3000ms on the reference host only)"
for rep in 1 2; do
  eval "STAY=\"\$STAY_$rep\"; ROOMN=\"\$ROOM_$rep\""
  api billing PostCharge "{\"stayId\": \"$STAY\", \"itemKind\": \"nightly-room-charge\", \"itemName\": \"Room $ROOMN\", \"amountMinor\": 120000, \"idempotencyKey\": \"perf-co-charge-$rep\", \"actor\": \"front-desk\"}" "$(tok "$rep")" >/dev/null \
    || fail "checkout setup charge $rep failed."
  api billing RecordPayment "{\"stayId\": \"$STAY\", \"method\": \"card\", \"amountMinor\": 120000, \"idempotencyKey\": \"perf-co-pay-$rep\", \"actor\": \"front-desk\"}" "$(tok "$rep")" >/dev/null \
    || fail "checkout setup payment $rep failed."
  FOLIO="$(api billing GetFolioBalance "{\"stayId\": \"$STAY\", \"actor\": \"front-desk\"}" "$(tok "$rep")")" \
    || fail "checkout folio read $rep failed."
  [[ "$(field balanceMinor "$FOLIO")" == "0" ]] || fail "folio $rep not settled: $FOLIO."
  timed "CheckOut" 3000 stay CheckOut "{\"stayId\": \"$STAY\", \"folioId\": \"$(field folioId "$FOLIO")\", \"folioBalanceMinor\": 0, \"actualDeparture\": \"${TODAY}T12:00:00Z\", \"idempotencyKey\": \"perf-checkout-$rep\", \"actor\": \"front-desk\"}" "$(tok "$rep")" \
    || fail "timed CheckOut $rep failed."
  api rooms ReleaseRoom "{\"roomNumber\": \"$ROOMN\", \"actor\": \"front-desk\"}" "$(tok "$rep")" >/dev/null \
    || fail "ReleaseRoom $ROOMN failed."
done
pass "2 timed check-outs recorded on settled folios."

step "release the setup stay (untimed cleanup)"
api billing RecordOpenBalanceApproval "{\"stayId\": \"$STAY_SETUP\", \"approvedBy\": \"owner\", \"role\": \"manager\", \"reason\": \"perf cleanup\", \"idempotencyKey\": \"perf-cleanup-approval\", \"actor\": \"manager\"}" "$OWNER_TOKEN" >/dev/null \
  || fail "cleanup approval failed."
SETUP_BAL="$(field balanceMinor "$(api billing GetFolioBalance "{\"stayId\": \"$STAY_SETUP\", \"actor\": \"front-desk\"}" "$(tok 0)")")"
api stay CheckOut "{\"stayId\": \"$STAY_SETUP\", \"folioId\": \"$FOLIO_SETUP_ID\", \"folioBalanceMinor\": $SETUP_BAL, \"openBalanceApproval\": {\"approvedBy\": \"owner\", \"role\": \"manager\"}, \"actualDeparture\": \"${TODAY}T12:00:00Z\", \"idempotencyKey\": \"perf-cleanup-checkout\", \"actor\": \"front-desk\"}" "$(tok 0)" >/dev/null \
  || fail "cleanup checkout failed."
api rooms ReleaseRoom '{"roomNumber": "PERF-01", "actor": "front-desk"}' "$(tok 0)" >/dev/null \
  || fail "cleanup release failed."
pass "setup stay closed and room released."

echo "perf: DONE: 21 timings recorded (12 views, 9 actions) env=$ENV_LABEL."
