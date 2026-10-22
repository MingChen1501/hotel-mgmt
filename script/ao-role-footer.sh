#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || -z "${1:-}" ]]; then
  echo "Usage: $0 <role> [session-id]" >&2
  exit 1
fi

role="$1"
session_id="${2:-}"

echo ""
echo "<!-- ao-role: ${role} -->"
if [[ -n "$session_id" ]]; then
  echo "Role: ${role} · AO session ${session_id}"
else
  echo "Role: ${role}"
fi
