#!/usr/bin/env bash
#
# Catalogue-coverage gate (NFR-I18N-1, issue #192; app/src half, issue #342).
#
# Asserts that 100% of the sampled user-visible strings resolve via
# the shared message catalogue: every sample key exists in
# messages/en.json with the declared placeholders, every migrated
# call site references its key, every runtime mirror is byte-identical
# to the canonical file, every literal `t()` call in the desk shell
# (`app/src/`, tests excluded) plus every shell nav labelKey resolves
# in the catalogue (section 7 additionally rejects static aria-label
# literals and static <noscript> paragraphs, which bypass locale
# switching), and the shell runbook wording renders the
# catalogue value in the default locale. (The legacy static pages and
# their data-msg/inline-script checks were removed with the pages in
# #299; the Vue `t()` wrapper parity is pinned by the Vitest suite
# in `app/src/i18n/`.)
#
# Fail-closed half of the UI-consistency rules (issue #342): a new
# screen that renders copy outside the catalogue fails here. Dynamic
# `t()` calls (variables, template literals) and the PrimeVue-first
# judgement stay a blocking reviewer checklist item (see
# `.opencode/agents/dev-peer-review.md`) — the static scan cannot
# judge them.
#
# Usage: script/catalogue-coverage-check.sh (run from anywhere;
# resolves the repo root). Exits non-zero on the first failure class.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$ROOT" <<'EOF'
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1])
failures = []

def fail(message):
    failures.append(message)
    print(f"FAIL {message}")

def ok(message):
    print(f"OK {message}")

# 1. The canonical catalogue is well-formed.
catalogue_path = ROOT / "messages" / "en.json"
try:
    catalogue = json.loads(catalogue_path.read_text(encoding="utf-8"))
except (OSError, ValueError) as exc:
    fail(f"messages/en.json does not parse: {exc}")
    catalogue = None
if catalogue is not None:
    if catalogue.get("locale") != "en":
        fail("messages/en.json locale must be the default locale en")
    messages = catalogue.get("messages")
    if not isinstance(messages, dict) or not messages:
        fail("messages/en.json must carry a non-empty messages map")
        messages = {}
    key_shape = re.compile(r"^[a-z0-9]+(\.[a-z0-9_]+)+$")
    placeholder = re.compile(r"\{([A-Za-z0-9_]+)\}")
    for key, pattern in messages.items():
        if not key_shape.match(key):
            fail(f"catalogue key {key!r} breaks the <surface>.<domain>.<name> shape")
        if not isinstance(pattern, str) or not pattern:
            fail(f"catalogue key {key!r} must map to a non-empty pattern")
    ok(f"messages/en.json parses with {len(messages)} keys")

    # 2. The bounded sample resolves: keys exist, call sites reference
    # them, and declared params match the pattern placeholders exactly.
    sample_path = ROOT / "messages" / "sample.json"
    try:
        sample = json.loads(sample_path.read_text(encoding="utf-8"))["sample"]
    except (OSError, ValueError, KeyError) as exc:
        fail(f"messages/sample.json does not parse: {exc}")
        sample = []
    checked = 0
    for entry in sample:
        key = entry["key"]
        pattern = messages.get(key)
        if pattern is None:
            fail(f"sample key {key!r} is missing from messages/en.json")
            continue
        declared = entry.get("params", {})
        actual = set(placeholder.findall(pattern))
        if set(declared) != actual:
            fail(f"sample key {key!r} declares params {sorted(declared)} "
                 f"but the pattern carries {sorted(actual)}")
            continue
        for source in entry.get("sources", []):
            try:
                text = (ROOT / source).read_text(encoding="utf-8")
            except OSError:
                fail(f"sample key {key!r} source {source} is unreadable")
                continue
            if key not in text:
                fail(f"sample key {key!r} is not referenced by {source}")
                continue
        checked += 1
    ok(f"sample resolves: {checked}/{len(sample)} keys with exact params and call sites")

    # 3. Runtime mirrors stay byte-identical to the canonical file.
    canonical = catalogue_path.read_bytes()
    mirrors = [
        "services/reservations/internal/messages/en.json",
        "services/admin/src/messages.en.json",
        "services/billing/src/main/resources/messages/en.json",
        "services/rates/internal/messages/en.json",
        "services/reporting/internal/messages/en.json",
        "services/rooms/src/messages.en.json",
        "services/stay/src/messages.en.json",
        "services/guests/src/messages.en.json",
    ]
    for mirror in mirrors:
        path = ROOT / mirror
        if not path.is_file():
            fail(f"mirror {mirror} is missing")
        elif path.read_bytes() != canonical:
            fail(f"mirror {mirror} differs from messages/en.json")
    ok(f"{len(mirrors)} runtime mirrors are byte-identical")

    # 4. Shell runbook wording resolves via the catalogue: every
    # msg/step/pass/fail_msg call in the four runbook scripts
    # references an existing key, and every inline fallback repeats
    # the pattern (single-line calls with literal key and fallback,
    # per script/messages.sh). Param patterns must keep every static
    # fragment in the fallback, mirroring the frontend check.
    def scan_shell_calls(text):
        calls = []
        pattern = re.compile(
            r'(?:fail_msg|pass_msg|step|pass|msg)\s+"([^"]+)"\s+"((?:[^"\\]|\\.)*)"')
        for match in pattern.finditer(text):
            key = match.group(1)
            if key.startswith("$"):
                # Wrapper definitions forward their caller's key and
                # fallback at runtime; the call sites carry the
                # literals and are sampled individually.
                continue
            fallback = re.sub(r'\\(.)', r'\1', match.group(2))
            calls.append((key, fallback))
        return calls

    for script_name in ["script/preflight.sh", "script/backup.sh",
                        "script/restore.sh", "script/e2e-desk-loop.sh"]:
        text = (ROOT / script_name).read_text(encoding="utf-8")
        count = 0
        for key, fallback in scan_shell_calls(text):
            pattern = messages.get(key)
            if pattern is None:
                fail(f"{script_name} calls msg() with unknown key {key!r}")
                continue
            names = set(placeholder.findall(pattern))
            if not names:
                if fallback != pattern:
                    fail(f"{script_name} [{key}] fallback differs from the catalogue")
            else:
                fragments = [part for part in placeholder.split(pattern)
                             if part and part not in names]
                for fragment in fragments:
                    if fragment not in fallback:
                        fail(f"{script_name} [{key}] fallback drops the static fragment {fragment!r}")
                        break
            count += 1
        if count == 0:
            fail(f"{script_name}: no catalogue call sites found")
        ok(f"{script_name}: {count} msg() call sites match the catalogue")

    # 5. Desk-shell call sites resolve via the catalogue (issue #342):
    # every literal t('key') call in app/src (SFCs and TS, tests
    # excluded — tests deliberately use missing keys and quote
    # call-site source) must exist in messages/en.json, and every
    # shell nav labelKey in app/src/App.vue must resolve too.
    call = re.compile(r"(?<![A-Za-z0-9_.])t\(\s*['\"]([A-Za-z0-9_.]+)['\"]")
    app_src = ROOT / "app" / "src"
    app_keys = {}
    for path in sorted(app_src.rglob("*")):
        if path.suffix not in (".vue", ".ts") or not path.is_file():
            continue
        if path.name.endswith(".test.ts"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            fail(f"app source {path.relative_to(ROOT)} is unreadable")
            continue
        for match in call.finditer(text):
            app_keys.setdefault(match.group(1), []).append(
                str(path.relative_to(ROOT)))
    if not app_keys:
        fail("app/src carries no literal t() call sites")
    checked = 0
    for key in sorted(app_keys):
        if key not in messages:
            fail(f"app call-site key {key!r} is missing from "
                 f"messages/en.json (first used by {app_keys[key][0]})")
            continue
        checked += 1
    ok(f"app/src: {checked}/{len(app_keys)} literal t() keys resolve "
       f"in the catalogue")
    nav_text = (app_src / "App.vue").read_text(encoding="utf-8")
    nav_keys = re.findall(r"labelKey:\s*'([^']+)'", nav_text)
    if not nav_keys:
        fail("app/src/App.vue carries no NAV_ITEMS labelKey entries")
    else:
        for key in nav_keys:
            if key not in messages:
                fail(f"shell nav labelKey {key!r} is missing from messages/en.json")
        ok(f"shell nav: {len(nav_keys)} labelKey entries resolve in the catalogue")

    # 6. Vietnamese locale parity (issue #339): messages/vi.json
    # carries exactly the en key set (no missing-key fallback in
    # normal VI use, no stray keys), declares locale "vi", and every
    # pattern carries exactly the en placeholders so {param}
    # substitution keeps working after the switch.
    vi_path = ROOT / "messages" / "vi.json"
    try:
        vi_document = json.loads(vi_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        fail(f"messages/vi.json does not parse: {exc}")
        vi_document = None
    if vi_document is not None:
        if vi_document.get("locale") != "vi":
            fail("messages/vi.json locale must be vi")
        vi_messages = vi_document.get("messages")
        if not isinstance(vi_messages, dict) or not vi_messages:
            fail("messages/vi.json must carry a non-empty messages map")
            vi_messages = {}
        else:
            for key in sorted(set(messages) - set(vi_messages)):
                fail(f"messages/vi.json is missing catalogue key {key!r}")
            for key in sorted(set(vi_messages) - set(messages)):
                fail(f"messages/vi.json carries stray key {key!r} "
                     f"missing from messages/en.json")
            matched = 0
            for key in sorted(messages):
                if key not in vi_messages:
                    continue
                pattern = vi_messages[key]
                if not isinstance(pattern, str) or not pattern:
                    fail(f"messages/vi.json key {key!r} must map to a non-empty pattern")
                    continue
                if set(placeholder.findall(pattern)) != set(placeholder.findall(messages[key])):
                    fail(f"messages/vi.json key {key!r} placeholders "
                         f"{sorted(placeholder.findall(pattern))} differ from "
                         f"messages/en.json {sorted(placeholder.findall(messages[key]))}")
                    continue
                matched += 1
            ok(f"messages/vi.json carries {matched}/{len(messages)} keys "
               f"with matching placeholders")

    # 7. No hardcoded user-visible literals in the shell/views
    # (issue #405): static aria-label attributes and static
    # <noscript> paragraphs bypass locale switching, so they fail
    # here even when every t() call site resolves. Tests are
    # excluded — they deliberately quote call-site source.
    static_aria = re.compile(r'(?<![A-Za-z0-9_:-])aria-label\s*=\s*["\']')
    noscript_open = re.compile(r"<noscript[^>]*>", re.IGNORECASE)
    noscript_close = re.compile(r"</noscript>", re.IGNORECASE)
    aria_hits = 0
    noscript_hits = 0
    for path in sorted(app_src.rglob("*")):
        if path.suffix not in (".vue", ".ts") or not path.is_file():
            continue
        if path.name.endswith(".test.ts"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            fail(f"app source {path.relative_to(ROOT)} is unreadable")
            continue
        rel = str(path.relative_to(ROOT))
        if static_aria.search(text):
            fail(f"{rel} carries a static aria-label literal; "
                 f"resolve it via :aria-label=\"t(...)\"")
            aria_hits += 1
        lower = text.lower()
        idx = 0
        while True:
            start = lower.find("<noscript", idx)
            if start == -1:
                break
            end = lower.find("</noscript>", start)
            if end == -1:
                fail(f"{rel} carries an unclosed <noscript> block")
                noscript_hits += 1
                break
            block = text[start:end]
            if "t(" not in block:
                fail(f"{rel} carries a static <noscript> paragraph; "
                     f"resolve it via t(...)")
                noscript_hits += 1
            idx = end + len("</noscript>")
    if aria_hits == 0:
        ok("app/src carries no static aria-label literals")
    if noscript_hits == 0:
        ok("app/src <noscript> blocks all resolve via t()")

if failures:
    print(f"\ncatalogue-coverage-check: {len(failures)} failure(s)")
    sys.exit(1)
print("\ncatalogue-coverage-check: PASS")
EOF
