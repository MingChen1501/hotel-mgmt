#!/usr/bin/env bash
#
# Validate a per-hotel configuration set against the release bundle's
# configuration schema (issue #158).
#
# Implements the config half of docs/devops/deployment.md section 5
# as a reusable gate: checks the full section-2/section-3.1 set, not
# just the top-level keys — hotel identity present and not the
# EXAMPLE placeholder, standard times well-formed, room/rate/charge
# sections non-empty with references that resolve, stay policies
# complete, and the backup retention floor honoured. Fails closed:
# any missing, placeholder, malformed, or dangling value is a
# failure. Called by script/preflight.sh, the Ansible install
# playbook, and script/apply-hotel-config.sh before anything is
# applied. Prints reasons, never secret values (the set carries no
# secrets by design — deployment.md section 2).
#
# Usage (from the repo root):
#   script/validate-hotel-config.sh [--config deploy/config/hotel.json]

set -euo pipefail

CONFIG="deploy/config/hotel.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="${2:?--config needs a path}"; shift 2 ;;
    *)
      echo "validate-hotel-config: unknown argument: $1" >&2
      echo "usage: script/validate-hotel-config.sh [--config PATH]" >&2
      exit 2 ;;
  esac
done

if [[ ! -f "$CONFIG" ]]; then
  echo "validate-hotel-config: FAIL: configuration set $CONFIG not found; copy deploy/config/hotel.example.json and fill in per sale." >&2
  exit 1
fi

python3 - "$CONFIG" <<'PYEOF'
import json
import re
import sys

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as fh:
        config = json.load(fh)
except (OSError, ValueError) as exc:
    print(f"validate-hotel-config: FAIL: {path} is not valid JSON ({exc}).")
    sys.exit(1)

errors = []

def fail(message):
    errors.append(message)

if not isinstance(config, dict):
    print(f"validate-hotel-config: FAIL: {path} must be a JSON object.")
    sys.exit(1)

# Top-level set: every section-2 category present, schema version exact.
for key in ("schemaVersion", "hotel", "times", "roomTypes", "ratePlans",
            "stayPolicies", "chargeItems", "taxAndFeeRules", "backup"):
    if key not in config:
        fail(f"missing required section: {key}")
if config.get("schemaVersion") != 1:
    fail("schemaVersion must be 1")

# Hotel identity: present, non-empty, and never the shipped example
# placeholder (fail closed on defaults).
hotel = config.get("hotel")
if not isinstance(hotel, dict):
    fail("hotel must be an object")
else:
    for field in ("name", "propertyCode", "timezone", "currency"):
        value = hotel.get(field)
        if not isinstance(value, str) or not value.strip():
            fail(f"hotel.{field} must be a non-empty string")
    if hotel.get("propertyCode") == "EXAMPLE-001":
        fail("hotel.propertyCode still carries the EXAMPLE-001 placeholder; fill in the hotel's own values")

# Standard times (FR-CUS-2 / FR-ADM-4): strict 24-hour HH:MM so the
# desk enforces and displays the hotel's own times, never a default.
times = config.get("times")
time_re = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
if not isinstance(times, dict):
    fail("times must be an object")
else:
    for field in ("checkIn", "checkOut", "businessDayStart"):
        value = times.get(field)
        if not isinstance(value, str) or not time_re.match(value):
            fail(f"times.{field} must be a 24-hour HH:MM time (got {value!r})")

# Rooms, rates, charges: non-empty with codes; every rate plan names
# an existing room type so quotes can resolve at install time.
room_types = config.get("roomTypes")
room_codes = set()
if not isinstance(room_types, list) or not room_types:
    fail("roomTypes must be a non-empty array")
else:
    for entry in room_types:
        code = entry.get("code") if isinstance(entry, dict) else None
        if not isinstance(code, str) or not code.strip():
            fail(f"roomTypes entry {entry!r} must carry a non-empty code")
        elif code in room_codes:
            fail(f"duplicate roomTypes code: {code}")
        else:
            room_codes.add(code)

rate_plans = config.get("ratePlans")
if not isinstance(rate_plans, list) or not rate_plans:
    fail("ratePlans must be a non-empty array")
else:
    for entry in rate_plans:
        if not isinstance(entry, dict):
            fail(f"ratePlans entry {entry!r} must be an object")
            continue
        if not isinstance(entry.get("code"), str) or not entry["code"].strip():
            fail(f"ratePlans entry {entry!r} must carry a non-empty code")
        room_type = entry.get("roomType")
        if room_type is not None and room_type not in room_codes:
            fail(f"ratePlans entry {entry.get('code')!r} names unknown roomType {room_type!r}")

charge_items = config.get("chargeItems")
if not isinstance(charge_items, list) or not charge_items:
    fail("chargeItems must be a non-empty array")
else:
    for entry in charge_items:
        code = entry.get("code") if isinstance(entry, dict) else None
        if not isinstance(code, str) or not code.strip():
            fail(f"chargeItems entry {entry!r} must carry a non-empty code")

if not isinstance(config.get("taxAndFeeRules"), list):
    fail("taxAndFeeRules must be an array")

# Stay policies (FR-CUS-1/2, FR-RES-3/6, FR-BIL-7): every rule the
# desk enforces must be present — no silent fallback to defaults.
policies = config.get("stayPolicies")
if not isinstance(policies, dict):
    fail("stayPolicies must be an object")
else:
    required_fields = policies.get("requiredGuestFields")
    if not isinstance(required_fields, list) or not required_fields:
        fail("stayPolicies.requiredGuestFields must be a non-empty array")
    reasons = policies.get("cancellationReasons")
    if not isinstance(reasons, list) or not reasons:
        fail("stayPolicies.cancellationReasons must be a non-empty array")
    for field in ("noShowRule", "openBalanceCheckoutRule"):
        value = policies.get(field)
        if not isinstance(value, str) or not value.strip():
            fail(f"stayPolicies.{field} must be a non-empty string")

# Backup schedule with the 30-day retention floor
# (docs/operations/backup-dr.md section 3).
backup = config.get("backup")
if not isinstance(backup, dict):
    fail("backup must be an object")
else:
    schedule = backup.get("schedule")
    if not isinstance(schedule, str) or not schedule.strip():
        fail("backup.schedule must be a non-empty string")
    floor = backup.get("retentionDaysFloor")
    if not isinstance(floor, int) or isinstance(floor, bool) or floor < 30:
        fail("backup.retentionDaysFloor must be an integer of at least 30")

if errors:
    for message in errors:
        print(f"validate-hotel-config: FAIL: {path}: {message}")
    sys.exit(1)
print(f"validate-hotel-config: OK: {path} carries the hotel's own complete section-2 set.")
PYEOF
