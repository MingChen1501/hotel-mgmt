#!/usr/bin/env bash
#
# Apply a per-hotel configuration set to a running installation
# (issue #158).
#
# Wires deploy/config through the deployment: reads the hotel's own
# validated set and saves its section-3.1 values through
# AdminService.UpdateHotelConfig (LLD section 8 — hotel values enter
# through Admin config operations, never through seeds), then reads
# the snapshot back and verifies the hotel's identity and standard
# times are in effect. Idempotent: re-applying the same set yields
# the same values, so every upgrade re-applies reproducibly
# (docs/devops/deployment.md section 4). Fails closed on dev-default
# secrets (audit S3) and refuses to apply a set that does not pass
# script/validate-hotel-config.sh first.
#
# Usage (from the repo root, with the stack up):
#   DB_PASSWORD=<secret> ADMIN_BOOT_SECRET=<secret> \
#     script/apply-hotel-config.sh [--config deploy/config/hotel.json] \
#     [--base-url http://127.0.0.1]
#
# Never prints secret values, only which variable failed.

set -euo pipefail

CONFIG="deploy/config/hotel.json"
BASE_URL="http://127.0.0.1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="${2:?--config needs a path}"; shift 2 ;;
    --base-url)
      BASE_URL="${2:?--base-url needs a URL}"; shift 2 ;;
    *)
      echo "apply-hotel-config: unknown argument: $1" >&2
      echo "usage: script/apply-hotel-config.sh [--config PATH] [--base-url URL]" >&2
      exit 2 ;;
  esac
done

# Fail closed on default secrets (audit S3): the same denylist as
# script/preflight.sh (canonical).
is_default_secret() {
  case "$1" in
    ""|"change-me"|"change-me-dev-only"|"password"|"hotel"|"hotel-dev-only") return 0 ;;
    *) return 1 ;;
  esac
}
ADMIN_IDENTITY="${ADMIN_IDENTITY:-owner}"
ADMIN_SECRET="${ADMIN_SECRET:-${ADMIN_BOOT_SECRET:-}}"
if is_default_secret "$ADMIN_SECRET"; then
  echo "apply-hotel-config: FAIL: ADMIN_SECRET (or ADMIN_BOOT_SECRET) is unset or still a dev default; provision the per-sale owner secret (deployment.md section 2)." >&2
  exit 1
fi

# Validate before applying: never push a placeholder or partial set.
"$(dirname "$0")/validate-hotel-config.sh" --config "$CONFIG" || exit 1

step() { echo "apply-hotel-config: === $1 ==="; }

step "sign in as $ADMIN_IDENTITY"
SIGNIN_BODY="$(printf '{"signinIdentity": %s, "secret": %s}' \
  "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$ADMIN_IDENTITY")" \
  "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$ADMIN_SECRET")")"
SIGNIN_RESP="$(curl -sS --noproxy '*' --max-time 15 -X POST "$BASE_URL/v1/admin/SignIn" \
  -H "Content-Type: application/json" -d "$SIGNIN_BODY")" || {
  echo "apply-hotel-config: FAIL: admin SignIn unreachable at $BASE_URL." >&2
  exit 1
}
TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("token", ""))' <<<"$SIGNIN_RESP" 2>/dev/null || true)"
if [[ -z "$TOKEN" ]]; then
  echo "apply-hotel-config: FAIL: admin SignIn refused: $SIGNIN_RESP" >&2
  exit 1
fi
echo "apply-hotel-config: owner sign-in returned a session token."

# Map the section-2 set onto Admin config values (LLD section 8).
# Profile-single-homed keys land in admin.hotel_profile; the rest
# land in admin.hotel_config_values (schema.md section 8).
VALUES_JSON="$(python3 - "$CONFIG" <<'PYEOF'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    config = json.load(fh)
hotel = config["hotel"]
times = config["times"]
policies = config["stayPolicies"]
values = {
    "name": hotel["name"],
    "propertyCode": hotel["propertyCode"],
    "timezone": hotel["timezone"],
    "currency": hotel["currency"],
    "standardCheckinTime": times["checkIn"],
    "standardCheckoutTime": times["checkOut"],
    "requiredGuestFields": policies["requiredGuestFields"],
    "cancellationReasons": policies["cancellationReasons"],
    "cancellationWording": policies.get("cancellationWording", ""),
    "noshowRule": policies["noShowRule"],
    "openBalanceCheckoutRule": policies["openBalanceCheckoutRule"],
    "chargeItems": config["chargeItems"],
    "taxAndFeeRules": config["taxAndFeeRules"],
    "restrictions": config.get("restrictions", []),
    "discounts": config.get("discounts", []),
    "ratePlans": config["ratePlans"],
    "roomTypes": config["roomTypes"],
    "retentionFloorDays": config["backup"]["retentionDaysFloor"],
}
print(json.dumps({"values": values, "updatedBy": "deployment-apply"}))
PYEOF
)"

step "save the hotel set through UpdateHotelConfig"
UPDATE_RESP="$(curl -sS --noproxy '*' --max-time 15 -X POST "$BASE_URL/v1/admin/UpdateHotelConfig" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$VALUES_JSON")" || {
  echo "apply-hotel-config: FAIL: admin UpdateHotelConfig unreachable at $BASE_URL." >&2
  exit 1
}
if python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if "code" in d else 1)' <<<"$UPDATE_RESP" 2>/dev/null; then
  echo "apply-hotel-config: FAIL: admin UpdateHotelConfig refused: $UPDATE_RESP" >&2
  exit 1
fi
echo "apply-hotel-config: hotel set saved (schemaVersion $(python3 -c 'import json,sys; print(json.load(sys.stdin).get("schemaVersion", ""))' <<<"$UPDATE_RESP"))."

step "verify the hotel values are in effect"
CONFIG_RESP="$(curl -sS --noproxy '*' --max-time 15 -X POST "$BASE_URL/v1/admin/GetHotelConfig" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{}')" || {
  echo "apply-hotel-config: FAIL: admin GetHotelConfig unreachable at $BASE_URL." >&2
  exit 1
}
VERIFY_OUT="$(CONFIG_WANT="$CONFIG" CONFIG_GOT="$CONFIG_RESP" python3 - <<'PYEOF' 2>&1
import json
import os
import sys

with open(os.environ["CONFIG_WANT"], encoding="utf-8") as fh:
    want = json.load(fh)
got_raw = os.environ["CONFIG_GOT"]
try:
    got = json.loads(got_raw)
except ValueError:
    print(f"GetHotelConfig did not answer JSON: {got_raw[:200]}")
    sys.exit(1)
values = got.get("values", {})
checks = {
    "name": want["hotel"]["name"],
    "timezone": want["hotel"]["timezone"],
    "standardCheckinTime": want["times"]["checkIn"],
    "standardCheckoutTime": want["times"]["checkOut"],
    "cancellationWording": want["stayPolicies"].get("cancellationWording", ""),
}
mismatches = [k for k, v in checks.items() if values.get(k) != v]
if mismatches:
    print("hotel values not in effect for: " + ", ".join(mismatches))
    print("snapshot values: " + json.dumps({k: values.get(k) for k in checks}))
    sys.exit(1)
print("hotel identity and standard times are in effect: "
      f"{checks['name']!r} {checks['timezone']} "
      f"{checks['standardCheckinTime']}/{checks['standardCheckoutTime']}.")
PYEOF
)" || {
  echo "apply-hotel-config: FAIL: $VERIFY_OUT" >&2
  exit 1
}
echo "apply-hotel-config: $VERIFY_OUT"
echo "apply-hotel-config: APPLIED."
