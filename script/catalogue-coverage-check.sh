#!/usr/bin/env bash
#
# Catalogue-coverage gate (NFR-I18N-1, issue #192).
#
# Asserts that 100% of the sampled user-visible strings resolve via
# the shared message catalogue: every sample key exists in
# messages/en.json with the declared placeholders, every migrated
# call site references its key, every runtime mirror is byte-identical
# to the canonical file, and every frontend data-msg element plus
# inline fallback renders the catalogue value in the default locale.
#
# Usage: script/catalogue-coverage-check.sh (run from anywhere;
# resolves the repo root). Exits non-zero on the first failure class.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$ROOT" <<'EOF'
import json
import re
import sys
from html.parser import HTMLParser
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
        "frontend/messages/en.json",
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

    # 4. Frontend static copy renders the catalogue value: every
    # data-msg key exists and the inline default-locale text matches
    # the pattern (HTML whitespace collapsed, as the browser renders).
    class MsgParser(HTMLParser):
        VOID = {"area", "base", "br", "col", "embed", "hr", "img",
                "input", "link", "meta", "param", "source", "track", "wbr"}

        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack = []
            self.found = {}

        def handle_starttag(self, tag, attrs):
            key = dict(attrs).get("data-msg")
            self.stack.append([tag, key, ""])
            if tag in self.VOID:
                self.handle_endtag(tag)

        def handle_startendtag(self, tag, attrs):
            self.handle_starttag(tag, attrs)
            if tag not in self.VOID:
                self.handle_endtag(tag)

        def handle_endtag(self, tag):
            if not self.stack:
                return
            while self.stack and self.stack[-1][0] != tag:
                self.stack.pop()
            if not self.stack:
                return
            top_tag, key, text = self.stack.pop()
            if key is not None:
                normalised = re.sub(r"\s+", " ", text).strip()
                self.found.setdefault(key, []).append(normalised)
            if self.stack:
                self.stack[-1][2] += text

        def handle_data(self, data):
            if self.stack:
                self.stack[-1][2] += data

    def collapse(value):
        return re.sub(r"\s+", " ", value).strip()

    for page in ["frontend/index.html", "frontend/admin.html", "frontend/desk.html", "frontend/book.html", "frontend/stay.html", "frontend/folio.html"]:
        parser = MsgParser()
        parser.feed((ROOT / page).read_text(encoding="utf-8"))
        for key, texts in parser.found.items():
            if key not in messages:
                fail(f"{page} references unknown catalogue key {key!r}")
                continue
            if placeholder.search(messages[key]):
                continue
            for text in texts:
                if text == "":
                    continue
                if collapse(text) != collapse(messages[key]):
                    fail(f"{page} [{key}] inline {text!r} differs "
                         f"from the catalogue {messages[key]!r}")
        ok(f"{page}: {len(parser.found)} data-msg keys resolve with default-locale text")

    # 5. Inline-script fallbacks stay byte-identical to the catalogue:
    # DeskMessages.msg("key", {...}, "fallback") with a literal
    # fallback must repeat the pattern; param patterns must keep
    # every static fragment in the fallback expression. A small
    # scanner (not a regex) pairs each call with its fallback so
    # nested parentheses inside fallbacks cannot misalign the match.
    def scan_calls(text):
        calls = []
        marker = 'DeskMessages.msg("'
        i = 0
        while True:
            i = text.find(marker, i)
            if i < 0:
                return calls
            j = i + len(marker)
            end_key = text.find('"', j)
            key = text[j:end_key]
            assert text[end_key + 1] == ","
            k = end_key + 2
            while text[k] in " \t\n":
                k += 1
            assert text[k] == "{"
            end_params = text.find("}", k)
            params_raw = text[k:end_params]
            k = end_params + 1
            while text[k] in " \t\n":
                k += 1
            assert text[k] == ","
            k += 1
            while text[k] in " \t\n":
                k += 1
            if text[k] == '"':
                start = k
                k += 1
                chars = []
                while text[k] != '"':
                    if text[k] == "\\":
                        chars.append(text[k + 1])
                        k += 2
                    else:
                        chars.append(text[k])
                        k += 1
                k += 1
                peek = k
                while text[peek] in " \t\n":
                    peek += 1
                if text[peek] == ")":
                    calls.append((key, params_raw, ("literal", "".join(chars))))
                    i = k
                    continue
                k = start
            depth = 1
            k0 = k
            in_str = None
            while depth > 0:
                ch = text[k]
                if in_str:
                    if ch == "\\":
                        k += 2
                        continue
                    if ch == in_str:
                        in_str = None
                elif ch in "\"'":
                    in_str = ch
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                k += 1
            calls.append((key, params_raw, ("expr", text[k0:k - 1])))
            i = k
        return calls

    for page in ["frontend/index.html", "frontend/admin.html", "frontend/desk.html", "frontend/book.html", "frontend/stay.html", "frontend/folio.html"]:
        text = (ROOT / page).read_text(encoding="utf-8")
        for key, params_raw, (kind, fallback) in scan_calls(text):
            pattern = messages.get(key)
            if pattern is None:
                fail(f"{page} calls msg() with unknown key {key!r}")
                continue
            names = set(placeholder.findall(pattern))
            if not names:
                if kind != "literal" or fallback != pattern:
                    fail(f"{page} [{key}] fallback differs from the catalogue")
            else:
                fragments = [part for part in placeholder.split(pattern)
                             if part and part not in names]
                for fragment in fragments:
                    if fragment not in fallback:
                        fail(f"{page} [{key}] fallback drops the static fragment {fragment!r}")
                        break
        ok(f"{page}: inline msg() fallbacks match the catalogue")

    # 6. The browser loader exposes the catalogue contract the other
    # stacks implement: lookup, locale formatting, page application.
    loader = (ROOT / "frontend" / "messages.js").read_text(encoding="utf-8")
    for member in ["msg:", "formatNumber:", "formatMoney:", "formatDate:",
                   "applyToPage:", "init:", "useCatalogue:"]:
        if member not in loader:
            fail(f"frontend/messages.js is missing the {member[:-1]} member")
    ok("frontend/messages.js exposes the loader contract")

    # 7. Shell runbook wording resolves via the catalogue: every
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

if failures:
    print(f"\ncatalogue-coverage-check: {len(failures)} failure(s)")
    sys.exit(1)
print("\ncatalogue-coverage-check: PASS")
EOF
