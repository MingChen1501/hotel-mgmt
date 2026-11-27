#!/usr/bin/env bash
#
# Content-verified doc-pin check (issue #786).
#
# The rule this enforces is CONTENT-VERIFIED pins (docs/ao-rules.md):
# a re-pin names the symbol the sentence describes and cites the line
# where that symbol actually is; offset arithmetic and existence-only
# sweeps are not verification.
#
# As-built docs cite code as `<path>:<line>` and `<path>:<a-b>` pins. An
# existence-only check passes a pin whose line still exists but has slid
# onto a different construct (the #632/#759 round-4 "zero-mismatch" sweep
# cleared a tree that still named pre-#632 lines). This check verifies the
# CONTENT of the cited line, not just its number:
#
#   - every pin must name a keyword the cited line (or the first line of
#     a range) must contain. The keyword is caller-supplied, never
#     inferred, and matched as a substring: pick one specific enough to
#     name the construct:
#       * a keyword map passed with --keywords (TSV:
#         `doc<TAB>resolved-target<TAB>keyword`), or
#       * an inline `<!-- pin: keyword -->` annotation on the doc line.
#         One annotation on a line applies to every pin on it; N
#         annotations pair with N pins in reading order.
#   - a pin with no keyword is reported UNVERIFIED, never PASS: a pin can
#     never pass on existence alone.
#   - a missing file, a line past EOF, or a line without the keyword is a
#     finding, and the report quotes the actual line content so a reviewer
#     can see the drift without opening the target file.
#
# Relative paths resolve the way the doc means them: repo-root relative,
# then module relative (`docs/architecture/services/<svc>.md` means
# `services/<svc>/`), then doc-relative, then a unique repo suffix. A bare
# `:line` inherits the last path cited on its line, or the last path in
# its paragraph (a markdown table row stands alone). An ambiguous suffix is
# reported, never guessed.
#
# Usage:
#   script/doc-pin-check.sh [options] <doc-file-or-dir>...
#
#   --keywords FILE   keyword map (TSV: doc, target, keyword; `#` comment
#                     lines allowed). `target` is the resolved repo-relative
#                     `path:line`; a map row matches a range pin when the
#                     path and first line match.
#   --report-only     always exit 0 (the CI first-iteration mode); findings
#                     are still printed and counted.
#   --all             print one record per pin, including PASS/UNVERIFIED.
#   --quiet           print the summary only.
#   --root DIR        repo root (default: this script's parent directory).
#
# Exit: 0 no findings (or --report-only), 1 findings, 2 usage error.
#
# Offline, no new dependency: bash + POSIX awk/grep/sed/sort. The file
# inventory comes from `git ls-files` in a git checkout (a clean checkout
# is the supported input) and from `find` under --root for fixtures.
#
# Blocking flip is a tracked follow-up: it waits for a clean inventory
# (zero findings) or an explicit allow-list, because the first report is
# the inventory itself.

set -euo pipefail
LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
KEYWORDS=""
REPORT_ONLY=0
SHOW_ALL=0
QUIET=0

usage() {
  cat >&2 <<'USAGE'
Usage:
  script/doc-pin-check.sh [options] <doc-file-or-dir>...

  --keywords FILE   keyword map (TSV: doc, target, keyword; `#` comment
                    lines allowed). `target` is the resolved repo-relative
                    `path:line`; a map row matches a range pin when the
                    path and first line match.
  --report-only     always exit 0 (the CI first-iteration mode); findings
                    are still printed and counted.
  --all             print one record per pin, including PASS/UNVERIFIED.
  --quiet           print the summary only.
  --root DIR        repo root (default: this script's parent directory).

Exit: 0 no findings (or --report-only), 1 findings, 2 usage error.
USAGE
}

die() { echo "doc-pin-check: $*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keywords) KEYWORDS="${2:-}"; shift 2 ;;
    --report-only) REPORT_ONLY=1; shift ;;
    --all) SHOW_ALL=1; shift ;;
    --quiet) QUIET=1; shift ;;
    --root) ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *) break ;;
  esac
done

[[ $# -gt 0 ]] || die "no doc set given (try: docs/architecture docs/testing docs/requirements)"
[[ -d "${ROOT}" ]] || die "root is not a directory: ${ROOT}"
ROOT="$(cd "${ROOT}" && pwd -P)"
[[ -z "${KEYWORDS}" || -f "${KEYWORDS}" ]] || die "keyword map not found: ${KEYWORDS}"
if [[ -n "${KEYWORDS}" ]]; then
  # Absolutize before cd: the map path is relative to the caller.
  KEYWORDS="$(cd "$(dirname "${KEYWORDS}")" && pwd -P)/$(basename "${KEYWORDS}")"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

cd "${ROOT}"

# ---------------------------------------------------------------------------
# 1. Collect the doc set (markdown only; evidence images are not docs).
# ---------------------------------------------------------------------------
DOCS=()
for arg in "$@"; do
  case "${arg}" in
    /*) [[ "${arg}" == "${ROOT}"/* ]] || die "doc path outside root: ${arg}"
        rel="${arg#"${ROOT}"/}" ;;
    *) rel="${arg#./}" ;;
  esac
  if [[ -d "${rel}" ]]; then
    while IFS= read -r f; do DOCS+=("${f#./}"); done \
      < <(find "${rel}" -type f -name '*.md' | sed 's|^\./||' | sort)
  elif [[ -f "${rel}" ]]; then
    DOCS+=("${rel}")
  else
    die "doc path not found under ${ROOT}: ${arg}"
  fi
done
[[ ${#DOCS[@]} -gt 0 ]] || die "doc set is empty"
printf '%s\n' "${DOCS[@]}" >"${TMP}/docs.txt"

# ---------------------------------------------------------------------------
# 2. File inventory: tracked files in a checkout, every file in a fixture.
# ---------------------------------------------------------------------------
if git -C "${ROOT}" rev-parse --show-toplevel >/dev/null 2>&1 \
  && [[ "$(cd "${ROOT}" && git rev-parse --show-toplevel 2>/dev/null)" == "${ROOT}" ]]; then
  git -C "${ROOT}" ls-files | sort >"${TMP}/inventory"
else
  find . -path ./.git -prune -o -type f -print | sed 's|^\./||' | sort >"${TMP}/inventory"
fi
[[ -s "${TMP}/inventory" ]] || die "empty file inventory under ${ROOT}"

# ---------------------------------------------------------------------------
# 3. Extract pins and inline annotations.
#    pins.tsv: doc, doc line, index-on-line, raw path, line spec, first line
#    ann.tsv:  doc, doc line, index-on-line, keyword
# ---------------------------------------------------------------------------
awk -v pinsfile="${TMP}/pins.tsv" -v annfile="${TMP}/ann.tsv" '
BEGIN {
  OFS = "\t"
  ext = "(ts|tsx|mts|cts|js|jsx|mjs|cjs|go|java|kt|vue|py|sql|sh|json|jsonc|yml|yaml|md|css|html|toml|xml|rb|rs|cc|cpp|h|cs|tf|gradle|properties)"
  pin_re = "(\\.\\.?/)*\\.?[A-Za-z0-9_][A-Za-z0-9_./-]*\\." ext ":[0-9]+(-[0-9]+)?"
  path_re = "(\\.\\.?/)*\\.?[A-Za-z0-9_][A-Za-z0-9_./-]*\\." ext
  cont_re = "^[ \t]*,[ \t]*:?[0-9]+(-[0-9]+)?"
  bare_re = ":[0-9]+(-[0-9]+)?"
  ann_re = "<!--[ \t]*pin:[ \t]*[^>]*-->"
  last_anchor = ""
  seq = 0
}
FNR == 1 { last_anchor = "" }
{
  raw = $0
  doc = FILENAME
  # A blank line ends the paragraph: bare pins no longer inherit a path
  # across it.
  if (raw ~ /^[ \t]*$/) { last_anchor = ""; next }

  # A markdown table row stands alone: a bare pin never inherits a path
  # from the row above (tables have no blank lines between rows).
  is_table = (raw ~ /^[ \t]*\|/)

  # URLs are not pins; mask them before scanning.
  line = raw
  gsub(/https?:\/\/[^ )<>"`]+/, " ", line)
  scan = line

  npin = 0
  nanc = 0
  nann = 0
  incoming = (is_table ? "" : last_anchor)

  # ---- inline annotations: <!-- pin: keyword --> ----
  annscan = raw
  while (match(annscan, ann_re)) {
    a = substr(annscan, RSTART, RLENGTH)
    annscan = substr(annscan, RSTART + RLENGTH)
    sub(/^<!--[ \t]*pin:[ \t]*/, "", a)
    sub(/[ \t]*-->[ \t]*$/, "", a)
    nann++
    print doc, FNR, nann, a > annfile
  }
  # ---- explicit pins: path:line, path:a-b ----
  pos = 1
  while (1) {
    rest = substr(line, pos)
    if (!match(rest, pin_re)) break
    at = pos + RSTART - 1
    len = RLENGTH
    tok = substr(line, at, len)
    ci = index(tok, ":")
    path = substr(tok, 1, ci - 1)
    lspec = substr(tok, ci + 1)
    npin++
    ppos[npin] = at; ppath[npin] = path; pline[npin] = lspec; pkind[npin] = "explicit"
    nanc++
    apos[nanc] = at; apath[nanc] = path
    # Consume the continuation list: `:319,440,479` and `:327, :381`.
    q = at + len
    scan = substr(scan, 1, at - 1) sprintf("%" len "s", "") substr(scan, at + len)
    while (1) {
      rest2 = substr(line, q)
      if (!match(rest2, cont_re)) break
      clen = RLENGTH
      ctok = substr(rest2, 1, clen)
      sub(/^[ \t]*,/, "", ctok); sub(/^[ \t]*:/, "", ctok)
      npin++
      ppos[npin] = q; ppath[npin] = path; pline[npin] = ctok; pkind[npin] = "continuation"
      scan = substr(scan, 1, q - 1) sprintf("%" clen "s", "") substr(scan, q + clen)
      q += clen
    }
    pos = q
  }

  # ---- plain path mentions are inheritance anchors: a bare `:line` in
  # the same table row or sentence belongs to the nearest path above it.
  # `Node.js` in prose is not a path: a slash-less token must be inside
  # backticks to count. ----
  pos = 1
  while (1) {
    rest = substr(scan, pos)
    if (!match(rest, path_re)) break
    at = pos + RSTART - 1
    len = RLENGTH
    tok = substr(scan, at, len)
    # reject a prefix hit such as `admin.h` inside `admin.hotel_profile`
    if (substr(scan, at + len, 1) ~ /[A-Za-z0-9_]/) { pos = at + len; continue }
    pre = substr(line, 1, at - 1)
    nbt = gsub(/`/, "`", pre)
    if (nbt % 2 == 0 && index(tok, "/") == 0) { pos = at + len; continue }
    nanc++
    apos[nanc] = at; apath[nanc] = tok
    pos = at + len
  }

  # ---- bare pins: `:line` inherit the nearest anchor before them ----
  pos = 1
  while (1) {
    rest = substr(scan, pos)
    if (!match(rest, bare_re)) break
    at = pos + RSTART - 1
    prev = (at > 1) ? substr(scan, at - 1, 1) : "("
    if (prev ~ /[ \t([`,;]/) {
      inherit = incoming
      best = -1
      for (i = 1; i <= nanc; i++) {
        if (apos[i] < at && apos[i] > best) { best = apos[i]; inherit = apath[i] }
      }
      npin++
      ppos[npin] = at; ppath[npin] = inherit
      pline[npin] = substr(scan, at + 1, RLENGTH - 1); pkind[npin] = "bare"
    }
    pos = at + 1
  }

  # ---- emit pins in document order, numbered per line ----
  for (i = 2; i <= npin; i++) {
    v = ppos[i]; vp = ppath[i]; vl = pline[i]; vk = pkind[i]
    j = i - 1
    while (j >= 1 && ppos[j] > v) {
      ppos[j + 1] = ppos[j]; ppath[j + 1] = ppath[j]
      pline[j + 1] = pline[j]; pkind[j + 1] = pkind[j]
      j--
    }
    ppos[j + 1] = v; ppath[j + 1] = vp; pline[j + 1] = vl; pkind[j + 1] = vk
  }
  for (i = 1; i <= npin; i++) {
    seq++
    first = pline[i]
    sub(/-[0-9]+$/, "", first)
    if (first == "") first = pline[i]
    print doc, FNR, i, ppath[i], pline[i], first, pkind[i] > pinsfile
  }

  # The last path mentioned on this line carries into the next line of
  # the same paragraph.
  best = -1
  last_anchor = (is_table ? "" : incoming)
  for (i = 1; i <= nanc; i++) if (apos[i] > best) { best = apos[i]; last_anchor = apath[i] }
  if (is_table) last_anchor = ""
}
' "${DOCS[@]}"

# ---------------------------------------------------------------------------
# 4. Resolve paths, then attach the keyword (annotation or map).
# ---------------------------------------------------------------------------
awk -v invfile="${TMP}/inventory" -v pinsfile="${TMP}/pins.tsv" \
    -v annfile="${TMP}/ann.tsv" -v mapfile="${KEYWORDS}" \
    -v outfile="${TMP}/resolved.tsv" \
    -v doclistfile="${TMP}/docs.txt" '
function dirname(p) { sub(/\/[^\/]*$/, "", p); return p }
function normalize(p,   n, parts, i, k, st, out) {
  n = split(p, parts, "/")
  k = 0
  for (i = 1; i <= n; i++) {
    if (parts[i] == "" || parts[i] == ".") continue
    if (parts[i] == "..") { if (k > 0) k--; continue }
    st[++k] = parts[i]
  }
  out = ""
  for (i = 1; i <= k; i++) out = out (i > 1 ? "/" : "") st[i]
  return out
}
function base(p,   n, a) { n = split(p, a, "/"); return a[n] }
BEGIN {
  OFS = "\t"
  # inventory
  nf = 0
  while ((getline l < invfile) > 0) {
    if (l == "") continue
    have[l] = 1
    files[++nf] = l
  }
  close(invfile)
  # map: doc, target(path:line), keyword
  nmap = 0
  if (mapfile != "") {
    while ((getline l < mapfile) > 0) {
      sub(/\r$/, "", l)
      if (l == "" || l ~ /^[ \t]*#/) continue
      n = split(l, f, "\t")
      if (n < 3) { badmap = badmap "\n" l; continue }
      doc = f[1]; tgt = f[2]; kw = f[3]
      ti = index(tgt, ":")
      if (ti == 0) { badmap = badmap "\n" l; continue }
      mpath = substr(tgt, 1, ti - 1)
      ml = substr(tgt, ti + 1)
      sub(/-[0-9]+$/, "", ml)
      nmap++
      mapdoc[nmap] = doc; mappath[nmap] = normalize(mpath); mapline[nmap] = ml
      mapkw[nmap] = kw; mapseen[nmap] = 0; mapraw[nmap] = l
    }
    close(mapfile)
  }
  # annotations
  while ((getline l < annfile) > 0) {
    n = split(l, f, "\t")
    if (n < 4) continue
    akey = f[1] SUBSEP f[2]
    anncount[akey]++
    annkw[akey SUBSEP anncount[akey]] = f[4]
    anndoc[akey] = f[1]
    annseen[akey] = 0
  }
  close(annfile)
  # pass 1: pins per doc line (annotation pairing) + scanned docs
  while ((getline l < pinsfile) > 0) {
    n = split(l, f, "\t")
    linekey[f[1] SUBSEP f[2]]++
  }
  # scanned doc set (for stale-map detection)
  while ((getline l < doclistfile) > 0) scanned[l] = 1
  close(doclistfile)
  close(pinsfile)

  # pass 2: resolve and attach keywords
  while ((getline l < pinsfile) > 0) {
    n = split(l, f, "\t")
    doc = f[1]; dline = f[2]; idx = f[3]; raw = f[4]; lspec = f[5]; first = f[6]
    key = doc SUBSEP dline
    # service hint from docs/architecture/services/<svc>.md
    svc = ""
    if (doc ~ /^docs\/architecture\/services\/[^\/]+\.md$/) {
      svc = base(doc); sub(/\.md$/, "", svc)
    } else if (doc ~ /^services\/[^\/]+\/README\.md$/) {
      svc = doc; sub(/^services\//, "", svc); sub(/\/README\.md$/, "", svc)
    }
    ck = svc SUBSEP raw
    if (!(ck in rcache)) {
      st = ""; res = ""
      p = normalize(raw)
      if (raw == "") st = "unresolved"
      else if (raw ~ /\.\.\./) st = "elided"
      else if (p == "" || p ~ /^\.\./) st = "missing"
      else if (p in have) { st = "resolved"; res = p }
      else if (svc != "" && ("services/" svc "/" p) in have) { st = "resolved"; res = "services/" svc "/" p }
      else if ((normalize(dirname(doc) "/" p)) in have) { st = "resolved"; res = normalize(dirname(doc) "/" p) }
      else {
        cand = 0; one = ""
        for (i = 1; i <= nf; i++) {
          if (files[i] == p || (length(files[i]) > length(p) && substr(files[i], length(files[i]) - length(p)) == "/" p)) {
            if (svc != "" && files[i] !~ ("^services/" svc "/")) continue
            cand++; one = files[i]
            if (cand > 1) break
          }
        }
        if (cand == 1) { st = "resolved"; res = one }
        else if (cand > 1) st = "ambiguous"
        else st = "missing"
      }
      rcache[ck] = st SUBSEP res
    }
    split(rcache[ck], rr, SUBSEP)
    st = rr[1]; res = rr[2]

    # keyword: annotation wins over map
    kw = ""
    nanl = anncount[key]
    if (nanl == 1) {
      kw = annkw[key SUBSEP 1]; annseen[key] = 1
    } else if (nanl > 1) {
      if (linekey[key] == nanl) {
        kw = annkw[key SUBSEP idx]; annseen[key] = 1
      } else {
        print "BAD-ANNOTATION", doc, dline, "-", "-", nanl " annotations vs " linekey[key] " pins", "" > outfile
      }
    }
    for (i = 1; i <= nmap; i++) {
      if (mapdoc[i] != doc) continue
      if (mappath[i] != res) continue
      if (mapline[i] != first) continue
      mapseen[i] = 1
      if (kw == "") { kw = mapkw[i]; break }
    }

    target = (res != "" ? res : (raw != "" ? raw : "-"))
    if (target != "-") target = target ":" lspec
    print doc, dline, idx, target, kw, st, lspec, first > outfile
  }
  close(pinsfile)
  close(outfile)

  # stale annotations / map rows
  for (k in annseen) if (annseen[k] == 0)
    print "STALE-ANNOTATION", anndoc[k], "-", "-", "-", "annotation on a line with no pin", "" > outfile
  for (i = 1; i <= nmap; i++) if (mapseen[i] == 0 && (mapdoc[i] in scanned))
    print "STALE-MAP", mapdoc[i], "-", mapraw[i], "-", "map row matches no pin in the scanned set", "" > outfile
  if (badmap != "") {
    n = split(badmap, rows, "\n")
    for (i = 1; i <= n; i++) if (rows[i] != "")
      print "BAD-MAP", rows[i], "-", "-", "-", "malformed keyword-map row", "" > outfile
  }
}
' 2>"${TMP}/resolve.err" || { cat "${TMP}/resolve.err" >&2; exit 2; }

# ---------------------------------------------------------------------------
# 5. Verify the content of every pin that has a keyword and a resolved file.
#    One awk pass per target file keeps the check offline and fast.
# ---------------------------------------------------------------------------
awk -F'\t' '$6 == "resolved" && $5 != "" { print $4 }' "${TMP}/resolved.tsv" \
  | sed 's/:[0-9-]*$//' | sort -u >"${TMP}/targets.txt"
: >"${TMP}/actual.tsv"
while IFS= read -r f; do
  [[ -f "${f}" ]] || continue
  want="$(awk -F'\t' -v f="$f" '$6 == "resolved" && $5 != "" {
      t=$4; sub(/:[0-9-]*$/, "", t); if (t == f) print $8
    }' "${TMP}/resolved.tsv" | sort -un | paste -sd, -)"
  [[ -n "${want}" ]] || continue
  awk -v want="${want}" -v path="$f" '
    BEGIN { n = split(want, a, ","); for (i = 1; i <= n; i++) w[a[i]] = 1; OFS = "\t" }
    (FNR in w) { line = $0; gsub(/\t/, " ", line); print path, FNR, line }
    END { print path, "TOTAL", NR }
  ' "${f}" >>"${TMP}/actual.tsv"
done <"${TMP}/targets.txt"

# ---------------------------------------------------------------------------
# 6. Status + report.
# ---------------------------------------------------------------------------
# Load the quoted target lines first (an empty first file would break the
# usual FNR == NR idiom), then stream the resolved-pin rows.
: >"${TMP}/report.tsv"
awk -F'\t' -v actualfile="${TMP}/actual.tsv" -v reportfile="${TMP}/report.tsv" '
BEGIN {
  OFS = "\t"
  while ((getline l < actualfile) > 0) {
    split(l, f, "\t")
    if (f[2] == "TOTAL") total[f[1]] = f[3]
    else content[f[1] SUBSEP f[2]] = f[3]
  }
  close(actualfile)
}
{
  # resolved.tsv row: doc, line, idx, target, keyword, rstatus, lspec, first
  # (broken annotation/map rows are printed separately from resolved.tsv)
  diag = ($1 == "BAD-ANNOTATION" || $1 == "STALE-ANNOTATION" || $1 == "STALE-MAP" || $1 == "BAD-MAP")
  if (diag) next
  doc = $1; dline = $2; target = $4; kw = $5; rstatus = $6; first = $8
  expected = (kw == "" ? "-" : kw)
  actual = ""
  if (rstatus == "unresolved") status = "UNRESOLVED"
  else if (rstatus == "elided") status = "ELIDED"
  else if (rstatus == "ambiguous") status = "AMBIGUOUS"
  else if (rstatus == "missing") status = "MISSING"
  else if (kw == "") status = "UNVERIFIED"
  else {
    p = target; sub(/:[0-9-]*$/, "", p)
    if (!(p in total) || !((p SUBSEP first) in content)) status = "EOF"
    else {
      actual = content[p SUBSEP first]
      if (index(actual, kw) > 0) status = "PASS"
      else status = "MISMATCH"
    }
  }
  print status, doc, dline, target, expected, actual > reportfile
  pins++
  if (status == "PASS") pass++
  else if (status == "UNVERIFIED") unverified++
  else if (status == "UNRESOLVED") unresolved++
  else if (status == "ELIDED") elided++
  else if (status == "AMBIGUOUS") ambiguous++
  else if (status == "MISSING") { missing++; findings++ }
  else if (status == "EOF") { eof++; findings++ }
  else if (status == "MISMATCH") { mismatch++; findings++ }
  dpins[doc]++
  if (status == "PASS") dpass[doc]++
  if (status == "MISSING" || status == "EOF" || status == "MISMATCH") {
    dfind[doc]++
    tp = target; sub(/:[0-9-]*$/, "", tp); tfind[tp]++
  }
}
END {
  close(reportfile)
  for (d in dpins) dlist[++nd] = d
  for (i = 2; i <= nd; i++) { v = dlist[i]; j = i - 1; while (j >= 1 && dlist[j] > v) { dlist[j+1] = dlist[j]; j-- } dlist[j+1] = v }
  for (i = 1; i <= nd; i++) {
    d = dlist[i]
    print "# by-doc", d, "pins=" dpins[d], "pass=" (dpass[d] + 0), "findings=" (dfind[d] + 0)
  }
  for (t in tfind) tlist[++nt] = t
  for (i = 2; i <= nt; i++) { v = tlist[i]; j = i - 1; while (j >= 1 && tlist[j] > v) { tlist[j+1] = tlist[j]; j-- } tlist[j+1] = v }
  for (i = 1; i <= nt; i++) print "# by-target", tlist[i], "findings=" tfind[tlist[i]]
  print "# summary", "pins=" (pins + 0), "pass=" (pass + 0), \
    "findings=" (findings + 0), "mismatch=" (mismatch + 0), \
    "missing=" (missing + 0), "eof=" (eof + 0), \
    "unverified=" (unverified + 0), "ambiguous=" (ambiguous + 0), \
    "unresolved=" (unresolved + 0), "elided=" (elided + 0)
}
' "${TMP}/resolved.tsv" >"${TMP}/summary.tsv"

# diagnostics (annotation/map) are appended to the report by this awk pass
# (kept separate so the verification pass above stays a pure join).

if [[ "${QUIET}" -eq 0 ]]; then
  echo "# doc-pin-check v1 (content-verified pins)"
  echo "# fields: status	doc	doc-line	target	expected	actual"
  # Findings first (everything not PASS / not the informational classes),
  # then the summary. UNVERIFIED/AMBIGUOUS/UNRESOLVED are counted, and
  # listed only with --all.
  awk -F'\t' -v all="${SHOW_ALL}" '
    $1 == "PASS" && !all { next }
    $1 == "UNVERIFIED" && !all { next }
    $1 == "AMBIGUOUS" && !all { next }
    $1 == "UNRESOLVED" && !all { next }
    $1 == "ELIDED" && !all { next }
    { print }
  ' "${TMP}/report.tsv"
  # Broken annotation/map entries are findings too; they carry their own
  # columns (status, doc, doc-line, entry, expected, detail).
  awk -F'\t' '
    $1 ~ /^(BAD-ANNOTATION|STALE-ANNOTATION|STALE-MAP|BAD-MAP)$/ {
      printf "%s\t%s\t%s\t%s\t%s\t%s\n", $1, $2, $3, $4, $5, $6
    }
  ' "${TMP}/resolved.tsv"
  grep -E '^(# by-doc|# by-target|# summary)' "${TMP}/summary.tsv" || true
fi

# ---------------------------------------------------------------------------
# 7. Exit. Findings are content/existence drift (mismatch, missing, EOF) and
#    broken annotation/map entries. UNVERIFIED/AMBIGUOUS/UNRESOLVED are
#    coverage gaps: reported and counted, never silently treated as PASS.
# ---------------------------------------------------------------------------
findings="$(awk -F'\t' '$1 == "MISMATCH" || $1 == "MISSING" || $1 == "EOF" { n++ } END { print n + 0 }' "${TMP}/report.tsv")"
bad="$(awk -F'\t' '$1 ~ /^(BAD-ANNOTATION|STALE-ANNOTATION|STALE-MAP|BAD-MAP)$/ { n++ } END { print n + 0 }' "${TMP}/resolved.tsv")"
total_findings=$((findings + bad))

if [[ "${total_findings}" -gt 0 ]]; then
  if [[ "${REPORT_ONLY}" -eq 1 ]]; then
    echo "doc-pin-check: REPORT-ONLY — ${total_findings} finding(s); not failing the run (issue #786 first iteration)."
    exit 0
  fi
  echo "doc-pin-check: FAIL — ${total_findings} finding(s)." >&2
  exit 1
fi
echo "doc-pin-check: PASS — no content-verified pin findings."
