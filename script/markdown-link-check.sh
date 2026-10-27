#!/usr/bin/env bash
#
# Markdown link gate (issue #378).
#
# Fails closed on two classes of documentation-link drift:
# - Broken relative links: every relative `](target)` link in a
#   tracked markdown file must resolve to an existing file (a
#   `#anchor` or `?query` suffix is stripped before the check;
#   file-level links only, per the issue decision).
# - Bare section glyphs: no `§` reference may remain in tracked
#   files. Two deliberate exceptions are allowlisted below and
#   documented here, not silently skipped:
#   - `frontend/docs/swagger-ui-bundle.js`: vendored third-party
#     code (`p:"§"` in a Unicode symbol map), not a section ref.
#   - The defensive `s/§.*$//` strip rule in
#     `script/harness-conventions-check.sh` and its `template/`
#     mirror: harness-owned (ai-engineer follow-up), left untouched.
#
# Out of scope (ignored): absolute URLs (`http(s):`, `mailto:`) and
# bare `#anchor`-only links.
#
# Usage: script/markdown-link-check.sh (run from anywhere; resolves repo root).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0

# 1. Relative link targets must resolve.
while IFS= read -r f; do
  dir="$(dirname "$f")"
  while IFS= read -r target; do
    case "$target" in
      http://*|https://*|mailto:*|'#'*) continue ;;
    esac
    target="${target%%#*}"
    target="${target%%\?*}"
    [ -z "$target" ] && continue
    if [ ! -e "$dir/$target" ]; then
      echo "FAIL broken link: $f -> $target"
      fail=1
    fi
  done < <(grep -hoE '\]\([^)]+\)' "$f" | sed -e 's/^](//' -e 's/)$//' || true)
done < <(git ls-files '*.md')

# 2. No bare section glyphs outside the documented exceptions.
while IFS= read -r f; do
  case "$f" in
    frontend/docs/swagger-ui-bundle.js) continue ;;
  esac
  hits="$(grep -n '§' "$f" | grep -v 's/§' || true)"
  if [ -n "$hits" ]; then
    echo "FAIL bare section glyph in $f:"
    echo "$hits"
    fail=1
  fi
done < <(git ls-files)

if [ "$fail" -eq 0 ]; then
  echo "Markdown links resolve; no bare section glyphs."
fi
exit "$fail"
