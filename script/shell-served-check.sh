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
# - Legacy preservation (FR-SHL-4 served half): every legacy page at
#   `/` and the `/docs` Swagger mirror still serve pre-slice
#   content. The mirror-byte half delegates to
#   `script/openapi-route-check.sh`.
#
# Serving method: docker is not guaranteed where this runs, so the
# script serves a staged root (legacy `frontend/` + built
# `app/dist/` at `/app/`) through a small Python server that mirrors
# the exact nginx block above (`alias /srv/app-dist/;` plus
# `try_files $uri $uri/ /app/index.html;` inside `location /app/`,
# legacy `location /` with `index` otherwise). The staged layout
# mirrors the alias mapping (dist staged at `$STAGE/app`, served for
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
echo "  staged legacy frontend/ + app/dist/ at /app/ under $STAGE"

cat > "$STAGE/tryfiles-server.py" <<'EOF'
import http.server, os, sys, urllib.parse

ROOT = sys.argv[1]
PORT = int(sys.argv[2])
MIME = {'.html': 'text/html', '.js': 'application/javascript',
        '.css': 'text/css', '.json': 'application/json',
        '.yaml': 'text/yaml', '.png': 'image/png',
        '.ico': 'image/x-icon', '.svg': 'image/svg+xml'}

class Handler(http.server.BaseHTTPRequestHandler):
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
        # Mirrors: location /app/ { try_files $uri $uri/ /app/index.html; }
        # plus the legacy location / { root ...; index index.html; }.
        url = urllib.parse.urlsplit(self.path).path
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
if cmp -s "$BODY" "$ROOT/frontend/index.html"; then
  fail_here "GET /app/ serves the legacy /index.html (fallback must be /app/index.html)"
else
  pass "GET /app/ is NOT the legacy /index.html"
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

echo "shell-served-check: legacy pages + /docs intact (FR-SHL-4 served half)..."
check_marker() { # check_marker <path> <marker>
  local code
  code="$(get "$1")"
  if [[ "$code" == "200" ]] && grep -qF "$2" "$BODY"; then
    pass "GET $1 -> 200, pre-slice marker present"
  else
    fail_here "GET $1 -> $code or pre-slice marker '$2' missing"
  fi
}
check_marker / 'Hotel Management — Desk Entry'
check_marker /desk.html 'Hotel Management — Desk Today'
check_marker /book.html 'Hotel Management — Desk Booking'
check_marker /stay.html 'Hotel Management — Desk Stay'
check_marker /folio.html 'Hotel Management — Desk Folio'
check_marker /print.html 'Hotel Management — Desk Print'
check_marker /admin.html 'Hotel Management — Admin Console'
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
