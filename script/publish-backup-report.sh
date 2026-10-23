#!/usr/bin/env bash
#
# Publish the newest backup report to the desk screen (issue #116).
#
# Reads the newest hotel-*.report.json in the backup staging area
# (written by script/backup.sh) and renders it into a small desk
# JSON file served with the static frontend, using the runbook's
# plain words (docs/operations/runbook.md section 2):
#   success: "Backup succeeded at HH:MM on DD Mon"
#   failure: "Backup failed at HH:MM on DD Mon — <reason>"
# plus a pointer to support (runbook section 6) on any failure.
# A missing staging area or no report at all is published as a
# failure ("no recent backup report"), because a backup without a
# success report counts as failed (runbook section 1, NFR-BKP-2).
#
# Scheduling and retention are untouched (backup-dr stays
# normative); this only surfaces the newest report. Exits 0 once
# the desk file is written, 1 when it cannot be written.
#
# Usage (from the repo root):
#   script/publish-backup-report.sh [--staging-dir DIR] [--desk-file PATH]

set -euo pipefail

STAGING_DIR="./backup-staging"
DESK_FILE="frontend/backup-report.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staging-dir)
      STAGING_DIR="${2:?--staging-dir needs a path}"; shift 2 ;;
    --desk-file)
      DESK_FILE="${2:?--desk-file needs a path}"; shift 2 ;;
    *)
      echo "publish-backup-report: unknown argument: $1" >&2
      echo "usage: script/publish-backup-report.sh [--staging-dir DIR] [--desk-file PATH]" >&2
      exit 2 ;;
  esac
done

STAGING_DIR="$STAGING_DIR" DESK_FILE="$DESK_FILE" python3 - <<'PYEOF'
import glob
import json
import os

staging_dir = os.environ["STAGING_DIR"]
desk_file = os.environ["DESK_FILE"]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SUPPORT = ("Note this message word for word and call support the same day "
           "(runbook section 6).")


def display_time(finished_at):
    # Report timestamps are UTC ("...Z"); the desk line keeps the
    # runbook's plain shape (runbook section 2: "at HH:MM on DD Mon").
    try:
        from datetime import datetime, timezone
        dt = datetime.strptime(finished_at, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc)
        return "%02d:%02d on %02d %s" % (
            dt.hour, dt.minute, dt.day, MONTHS[dt.month - 1])
    except (ValueError, TypeError):
        return None


def publish(payload):
    parent = os.path.dirname(desk_file)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(desk_file, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


reports = sorted(glob.glob(os.path.join(staging_dir, "hotel-*.report.json")))
if not reports:
    publish({
        "outcome": "failure",
        "line": "No recent backup report — treat as failed.",
        "reason": "no backup report found",
        "support": SUPPORT,
        "finishedAt": None,
    })
    print("publish-backup-report: no report in %s; "
          "published the no-recent-report failure state to %s."
          % (staging_dir, desk_file))
    raise SystemExit(0)

newest = reports[-1]
with open(newest) as f:
    report = json.load(f)

finished_at = report.get("finishedAt")
when = display_time(finished_at)
if report.get("outcome") == "success" and report.get("verifiedReadBack"):
    line = "Backup succeeded at %s." % when if when else "Backup succeeded."
    publish({
        "outcome": "success",
        "line": line,
        "reason": "",
        "support": "",
        "finishedAt": finished_at,
    })
else:
    reason = (report.get("reason") or "unknown reason").strip()
    line = ("Backup failed at %s — %s." % (when, reason) if when
            else "Backup failed — %s." % reason)
    publish({
        "outcome": "failure",
        "line": line,
        "reason": reason,
        "support": SUPPORT,
        "finishedAt": finished_at,
    })
print("publish-backup-report: published %s (%s) to %s."
      % (newest, report.get("outcome", "unknown"), desk_file))
PYEOF
