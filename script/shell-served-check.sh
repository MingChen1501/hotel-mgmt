#!/usr/bin/env bash
#
# Served-shell guard (issue #291; FR-SHL-1, FR-SHL-3, FR-SHL-4 served
# half, NFR-SHL-2).
#
# What it proves, and where the other halves live:
# - Placeholder shell entry: GET /app/ plus history-mode deep-link,
#   reload-style, and unknown /app/* paths all return the built
#   shell entry (`app/dist/index.html`) with status 200, and that
#   entry is NOT the legacy /index.html. Rendering of the
#   placeholder itself is pinned by the Vitest suite (`app/src/
#   router.test.ts`, `Placeholder.test.ts`); this script pins the
#   served bytes those tests cannot see.
# - Fallback correctness (NFR-SHL-2): the `location /app/` block in
#   `deploy/nginx/nginx.conf` carries `try_files $uri $uri/
#   /app/index.html;` verbatim (fallback is `/app/index.html`, NOT
#   `/index.html` — owner-mandated correction) plus its own
#   root/alias for real file resolution, and every sampled
#   non-asset /app/* path falls back to it.
# - Print route (FR-SHL-3): /app/print/... returns the shell
#   entry (the print screen renders client-side); the static entry
#   carries no print document markup.
# - Admin route (Refs #298): /app/admin returns the shell entry
#   (the console renders client-side).
# - Cutover redirects (FR-SHL-4 served half, Refs #299): every
#   decommissioned legacy path at `/` returns a permanent redirect
#   to its matching `/app/` route, and the `/docs` Swagger mirror
#   still serves pre-slice content. The mirror-byte half delegates
#   to `script/openapi-route-check.sh`.
#
# Serving method: docker is not guaranteed where this runs, so the
# script serves a staged root (remainder `frontend/` — `/docs` only —
# plus built `app/dist/` at `/app/`) through a small Python server
# that mirrors the exact nginx blocks above (`return 301` for the
# decommissioned paths, `alias /srv/app-dist/;` plus `try_files
# $uri $uri/ /app/index.html;` inside `location /app/`, legacy
# `location /` with `index` otherwise). The staged layout mirrors
# the alias mapping (dist staged at `$STAGE/app`, served for
# `/app/*`), while nginx config *syntax* stays covered by the e2e
# `nginx -t` step, which runs on every deploy change.
#
# Precondition: `app/dist/` must exist from `npm run build` in
# `app/` (a stale or missing dist fails closed here — rebuild,
# never hand-edit, per LLD §11.1).
#
# Usage: script/shell-served-check.sh (run from anywhere; resolves
# repo root). Override the probe port with SHELL_CHECK_PORT.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/app/dist"
NGINX_CONF="$ROOT/deploy/nginx/nginx.conf"
PORT="${SHELL_CHECK_PORT:-8471}"
fail=0

pass() { echo "  OK $1"; }
fail_here() { echo "  FAIL $1"; fail=1; }

echo "shell-served-check: preconditions..."
if [[ ! -f "$DIST/index.html" ]]; then
  echo "  FAIL app/dist/index.html is missing — run 'npm run build' in app/ first (never hand-edit dist/)."
  exit 1
fi
pass "app/dist/index.html present (built, not hand-edited)"
if ! command -v python3 >/dev/null 2>&1; then
  echo "  FAIL python3 is required to serve the staged root."
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "  FAIL curl is required for the served assertions."
  exit 1
fi

echo "shell-served-check: static assertions (nginx contract + build base)..."
if awk '/location \/app\//,/}/' "$NGINX_CONF" | grep -qF 'try_files $uri $uri/ /app/index.html;'; then
  pass "location /app/ falls back to /app/index.html (NOT /index.html)"
else
  fail_here "nginx $NGINX_CONF lacks 'try_files \$uri \$uri/ /app/index.html;' inside 'location /app/'"
fi
# Real nginx never inherits a sibling location's root, so the /app/
# block must carry its own root/alias or try_files resolves against
# the compiled default root (404/500 cycle on the fallback).
if awk '/location \/app\//,/}/' "$NGINX_CONF" | grep -Eq '(^|[[:space:]])(root|alias)[[:space:]]+[^;]+;'; then
  pass "location /app/ carries its own root/alias (real file resolution)"
else
  fail_here "location /app/ sets no root/alias in $NGINX_CONF"
fi
if grep -qF "base: '/app/'" "$ROOT/app/vite.config.ts"; then
  pass "vite base is '/app/'"
else
  fail_here "app/vite.config.ts lacks base: '/app/'"
fi
if grep -q "createWebHistory('/app/')" "$ROOT/app/src/router.ts"; then
  pass "router history base is '/app/'"
else
  fail_here "app/src/router.ts lacks createWebHistory('/app/')"
fi
if grep -q '/app/' "$DIST/index.html"; then
  pass "dist/index.html references /app/ assets"
else
  fail_here "dist/index.html has no /app/ reference (built with the wrong base?)"
fi

echo "shell-served-check: staging the served root..."
STAGE="$(mktemp -d)"
cp -r "$ROOT/frontend/." "$STAGE/"
mkdir -p "$STAGE/app"
cp -r "$DIST/." "$STAGE/app/"
echo "  staged remainder frontend/ + app/dist/ at /app/ under $STAGE"

cat > "$STAGE/tryfiles-server.py" <<'EOF'
import http.server, os, sys, urllib.parse

ROOT = sys.argv[1]
PORT = int(sys.argv[2])
MIME = {'.html': 'text/html', '.js': 'application/javascript',
        '.css': 'text/css', '.json': 'application/json',
        '.yaml': 'text/yaml', '.png': 'image/png',
        '.ico': 'image/x-icon', '.svg': 'image/svg+xml'}

class Handler(http.server.BaseHTTPRequestHandler):
    # Decommissioned legacy paths (Refs #299): exact-match 301s to
    # the matching SPA route, mirroring the nginx `return 301` block.
    REDIRECTS = {
        '/': '/app/',
        '/desk.html': '/app/',
        '/book.html': '/app/book',
        '/stay.html': '/app/stay',
        '/folio.html': '/app/folio',
        '/print.html': '/app/print',
        '/admin.html': '/app/admin',
    }
    def log_message(self, *args):
        pass
    def serve(self, path):
        ext = os.path.splitext(path)[1]
        self.send_response(200)
        self.send_header('Content-Type', MIME.get(ext, 'application/octet-stream'))
        self.end_headers()
        with open(path, 'rb') as fh:
            self.wfile.write(fh.read())
    def do_GET(self):
        # Mirrors: `location = /... { return 301 ...; }` for the
        # decommissioned paths; `location /app/ { try_files $uri
        # $uri/ /app/index.html; }` plus the remainder
        # `location /` with `index` otherwise.
        url = urllib.parse.urlsplit(self.path).path
        if url in self.REDIRECTS:
            self.send_response(301)
            self.send_header('Location', self.REDIRECTS[url])
            self.end_headers()
            return
        if url.startswith('/app/'):
            rel = url[len('/app/'):]
            cand = os.path.join(ROOT, 'app', rel)
            if os.path.isfile(cand):
                self.serve(cand)
                return
            if rel != '' and os.path.isdir(cand):
                idx = os.path.join(cand, 'index.html')
                if os.path.isfile(idx):
                    self.serve(idx)
                    return
            self.serve(os.path.join(ROOT, 'app', 'index.html'))
            return
        rel = url.lstrip('/')
        cand = os.path.join(ROOT, rel)
        if os.path.isfile(cand):
            self.serve(cand)
            return
        if os.path.isdir(cand):
            idx = os.path.join(cand, 'index.html')
            if os.path.isfile(idx):
                self.serve(idx)
                return
        self.send_response(404)
        self.end_headers()

http.server.HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
EOF

python3 "$STAGE/tryfiles-server.py" "$STAGE" "$PORT" &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$STAGE"; }
trap cleanup EXIT

BASE="http://127.0.0.1:$PORT"
for _ in $(seq 1 50); do
  if curl -sS -o /dev/null "$BASE/" >/dev/null 2>&1; then break; fi
  sleep 0.2
done

BODY="$(mktemp)"
get() { # get <path> -> prints the HTTP status, stores the body in $BODY
  curl -sS -o "$BODY" -w '%{http_code}' "$BASE$1"
}

echo "shell-served-check: placeholder entry + fallback (FR-SHL-1, NFR-SHL-2)..."
code="$(get /app/)"
if [[ "$code" == "200" ]] && cmp -s "$BODY" "$DIST/index.html"; then
  pass "GET /app/ -> 200, shell entry bytes"
else
  fail_here "GET /app/ -> $code, not the shell entry"
fi
echo "shell-served-check: legacy pages decommissioned (Refs #299)..."
for legacy in index.html desk.html book.html stay.html folio.html print.html admin.html messages.js messages/en.json; do
  if [[ -e "$ROOT/frontend/$legacy" ]]; then
    fail_here "legacy frontend/$legacy still present"
  else
    pass "legacy frontend/$legacy removed"
  fi
done
if awk '/location = \//,/}/' "$NGINX_CONF" | grep -qF 'return 301 /app/'; then
  pass "nginx redirects the legacy desk entry to /app/"
else
  fail_here "nginx $NGINX_CONF lacks the legacy-path 301 redirects to /app/ routes"
fi
for p in /app/stay/today /app/no-such-screen /app/book/quote-1; do
  code="$(get "$p")"
  if [[ "$code" == "200" ]] && cmp -s "$BODY" "$DIST/index.html"; then
    pass "GET $p -> 200, shell entry bytes (deep link / unknown path fallback)"
  else
    fail_here "GET $p -> $code, not the shell entry"
  fi
done
ASSET="$(cd "$DIST/assets" && ls | head -n 1)"
if [[ -n "${ASSET:-}" ]]; then
  code="$(get "/app/assets/$ASSET")"
  if [[ "$code" == "200" ]] && cmp -s "$BODY" "$DIST/assets/$ASSET"; then
    pass "GET /app/assets/$ASSET -> 200, hashed asset served directly"
  else
    fail_here "GET /app/assets/$ASSET -> $code, asset not served"
  fi
else
  fail_here "no hashed asset found under app/dist/assets/"
fi

echo "shell-served-check: print route served (FR-SHL-3)..."
code="$(get /app/print/receipt-1)"
if [[ "$code" == "200" ]] && cmp -s "$BODY" "$DIST/index.html"; then
  pass "GET /app/print/receipt-1 -> 200, shell entry bytes"
else
  fail_here "GET /app/print/receipt-1 -> $code, not the shell entry"
fi
if grep -q 'print-document' "$BODY"; then
  fail_here "/app/print/... response contains print-document markup"
else
  pass "/app/print/... response renders no static print document (client-rendered)"
fi

echo "shell-served-check: admin route served (Refs #298)..."
code="$(get /app/admin)"
if [[ "$code" == "200" ]] && cmp -s "$BODY" "$DIST/index.html"; then
  pass "GET /app/admin -> 200, shell entry bytes"
else
  fail_here "GET /app/admin -> $code, not the shell entry"
fi

echo "shell-served-check: legacy paths redirect + /docs intact (FR-SHL-4 served half, Refs #299)..."
check_marker() { # check_marker <path> <marker>
  local code
  code="$(get "$1")"
  if [[ "$code" == "200" ]] && grep -qF "$2" "$BODY"; then
    pass "GET $1 -> 200, pre-slice marker present"
  else
    fail_here "GET $1 -> $code or pre-slice marker '$2' missing"
  fi
}
check_redirect() { # check_redirect <path> <target>
  local code location
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$1")"
  location="$(curl -sS -o /dev/null -w '%{redirect_url}' "$BASE$1")"
  if [[ "$code" == "301" && "$location" == "$2" ]]; then
    pass "GET $1 -> 301 to $2"
  else
    fail_here "GET $1 -> $code to '$location', expected 301 to '$2'"
  fi
}
check_redirect / "$BASE/app/"
check_redirect /desk.html "$BASE/app/"
check_redirect /book.html "$BASE/app/book"
check_redirect /stay.html "$BASE/app/stay"
check_redirect /folio.html "$BASE/app/folio"
check_redirect /print.html "$BASE/app/print"
check_redirect /admin.html "$BASE/app/admin"
check_marker /docs/ 'Hotel Management — Desk-Loop API Docs'

echo "shell-served-check: OpenAPI mirror half (FR-SHL-4 mirror half)..."
if "$ROOT/script/openapi-route-check.sh"; then
  pass "openapi-route-check.sh green (byte-identical mirror)"
else
  fail_here "openapi-route-check.sh red"
fi

if [[ "$fail" -ne 0 ]]; then
  echo "shell-served-check: FAIL"
  exit 1
fi
echo "shell-served-check: PASS"
