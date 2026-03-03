import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from projectbutterfly.browser import search_engines
from projectbutterfly.browser.nav_bar import _fixup_url


def test_fixup_plain_domain_prefers_https():
    assert _fixup_url("example.com") == "https://example.com"


def test_fixup_search_text_routes_to_engine():
    search_engines.set_default("yandex")
    out = _fixup_url("best manga reader")
    assert out.startswith("https://yandex.com/search/?text=")


def test_fixup_unsafe_scheme_is_not_navigated_directly():
    search_engines.set_default("google")
    out = _fixup_url("javascript:alert(1)")
    assert out.startswith("https://www.google.com/search?q=")


def test_fixup_allowed_schemes_are_preserved():
    assert _fixup_url("http://localhost:8080") == "http://localhost:8080"
    assert _fixup_url("tanko-browser://settings") == "tanko-browser://settings"
