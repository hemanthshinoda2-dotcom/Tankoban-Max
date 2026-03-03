import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from projectbutterfly.browser import search_engines
from projectbutterfly.browser.data_bridge import DataBridge


class _History:
    def __init__(self, entries):
        self._entries = entries

    def _ensure_cache(self):
        return {"entries": list(self._entries)}


class _Bookmarks:
    def __init__(self, rows):
        self._rows = rows

    def _ensure_cache(self):
        return {"bookmarks": list(self._rows)}


class _Search:
    def __init__(self, terms):
        self._terms = terms

    def suggest(self, query):
        q = str(query or "").lower().strip()
        rows = []
        for term in self._terms:
            if q in term.lower():
                rows.append({"type": "search", "text": term})
        return json.dumps({"ok": True, "results": rows})


class _BridgeRoot:
    def __init__(self):
        self.webHistory = _History([
            {"url": "https://docs.python.org", "title": "Python Docs", "visitedAt": 9999999999999},
            {"url": "https://example.com/blog", "title": "Example Blog", "visitedAt": 1},
        ])
        self.webBookmarks = _Bookmarks([
            {"id": "b1", "url": "https://example.com", "title": "Example"},
        ])
        self.webSearch = _Search(["example search", "python tips"])


def test_omnibox_completion_ranking_prefers_bookmark_then_history_then_search():
    search_engines.set_default("yandex")
    bridge = DataBridge(_BridgeRoot())

    rows = bridge.search_completions("exa", limit=6)
    assert len(rows) >= 2
    assert rows[0]["type"] == "bookmark"
    assert rows[0]["url"] == "https://example.com"



def test_omnibox_completion_includes_search_history_source():
    search_engines.set_default("google")
    bridge = DataBridge(_BridgeRoot())

    rows = bridge.search_completions("python", limit=10)
    assert any(r.get("type") == "search" for r in rows)
    assert any("google.com/search" in r.get("url", "") for r in rows if r.get("type") == "search")
