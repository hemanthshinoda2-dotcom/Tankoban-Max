"""
Data bridge - thin adapter connecting the browser to bridge.py data domains.
"""

from __future__ import annotations

import json

from .state_store import BrowserStateStore


class DataBridge:
    """
    Adapter that reads directly from bridge.py in-process QObject caches.
    """

    def __init__(self, bridge_root=None):
        self._bridge = bridge_root
        self._state = BrowserStateStore(bridge_root)

    @property
    def _history(self):
        if self._bridge and hasattr(self._bridge, "webHistory"):
            return self._bridge.webHistory
        return None

    @property
    def _bookmarks(self):
        if self._bridge and hasattr(self._bridge, "webBookmarks"):
            return self._bridge.webBookmarks
        return None

    @property
    def _search(self):
        if self._bridge and hasattr(self._bridge, "webSearch"):
            return self._bridge.webSearch
        return None

    @staticmethod
    def _decode(raw):
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, list):
            return {"results": raw}
        if not isinstance(raw, str):
            return {}
        s = raw.strip()
        if not s:
            return {}
        try:
            out = json.loads(s)
            if isinstance(out, dict):
                return out
            if isinstance(out, list):
                return {"results": out}
            return {}
        except Exception:
            return {}

    def search_completions(self, query: str, limit: int = 8) -> list[dict]:
        """
        Search history + bookmarks + search history for omnibox completions.

        Returns a list of dicts with keys: type, title, url, score.
        Results are deduplicated by URL and sorted by relevance.
        """
        q = query.strip().lower()
        if not q:
            return []

        seen_urls: set[str] = set()
        results: list[dict] = []

        # Search bookmarks first (higher priority)
        bookmarks = self._get_bookmarks_raw()
        for bm in bookmarks:
            url = bm.get("url", "")
            title = bm.get("title", "")
            if not url:
                continue
            url_lower = url.lower()
            title_lower = title.lower()
            if q in url_lower or q in title_lower:
                if url not in seen_urls:
                    seen_urls.add(url)
                    score = 100
                    if q in title_lower:
                        score += 50
                    if url_lower.startswith("https://" + q) or url_lower.startswith("http://" + q):
                        score += 100
                    results.append({
                        "type": "bookmark",
                        "title": title or url,
                        "url": url,
                        "score": score,
                    })

        # Search browsing history
        history_entries = self._get_history_raw()
        for entry in history_entries:
            url = entry.get("url", "")
            title = entry.get("title", "")
            if not url:
                continue
            url_lower = url.lower()
            title_lower = title.lower()
            if q in url_lower or q in title_lower:
                if url not in seen_urls:
                    seen_urls.add(url)
                    score = 50
                    if q in title_lower:
                        score += 30
                    if url_lower.startswith("https://" + q) or url_lower.startswith("http://" + q):
                        score += 80
                    visited_at = entry.get("visitedAt", 0)
                    if visited_at:
                        import time
                        age_hours = (time.time() * 1000 - visited_at) / 3600000
                        if age_hours < 1:
                            score += 40
                        elif age_hours < 24:
                            score += 20
                        elif age_hours < 168:
                            score += 10
                    results.append({
                        "type": "history",
                        "title": title or url,
                        "url": url,
                        "score": score,
                    })

        # Search query history
        search_bridge = self._search
        if search_bridge and hasattr(search_bridge, "suggest"):
            try:
                payload = self._decode(search_bridge.suggest(query))
            except Exception:
                payload = {}
            entries = payload.get("results", [])
            if isinstance(entries, list):
                for item in entries:
                    if not isinstance(item, dict):
                        continue
                    if str(item.get("type", "")).lower() != "search":
                        continue
                    qtext = str(item.get("text", "") or "").strip()
                    if not qtext:
                        continue
                    url = self._search_url_for_query(qtext)
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)
                    results.append({
                        "type": "search",
                        "title": qtext,
                        "url": url,
                        "score": 30,
                    })

        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:limit]

    def get_bookmarks(self) -> list[dict]:
        return self._get_bookmarks_raw()

    def is_bookmarked(self, url: str) -> bool:
        target = url.strip()
        for bm in self._get_bookmarks_raw():
            if bm.get("url", "").strip() == target:
                return True
        return False

    def add_bookmark(self, url: str, title: str = ""):
        bm_bridge = self._bookmarks
        if bm_bridge:
            bm_bridge.add(json.dumps({"url": url, "title": title}))

    def remove_bookmark(self, url: str):
        bm_bridge = self._bookmarks
        if not bm_bridge:
            return
        target = str(url or "").strip()
        if not target:
            return
        try:
            cache = bm_bridge._ensure_cache()
            rows = cache.get("bookmarks", []) if isinstance(cache, dict) else []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                if str(row.get("url", "") or "").strip() != target:
                    continue
                bm_bridge.remove(json.dumps({"id": str(row.get("id", "") or "")}))
                return
        except Exception:
            return

    def add_history_entry(self, url: str, title: str = ""):
        h_bridge = self._history
        if h_bridge:
            import time
            h_bridge.upsert(json.dumps({
                "url": url,
                "title": title,
                "visitedAt": int(time.time() * 1000),
                "scope": "sources_browser",
            }))

    def load_browser_settings(self):
        return self._state.load_settings()

    def save_browser_settings(self, settings):
        return self._state.save_settings(settings)

    def load_session_state(self):
        return self._state.load_session()

    def save_session_state(self, state):
        return self._state.save_session(state)

    def get_permission_decision(self, origin, permission):
        return self._state.get_permission_decision(origin, permission)

    def set_permission_decision(self, origin, permission, decision):
        return self._state.set_permission_decision(origin, permission, decision)

    def list_download_history(self):
        return self._state.list_download_history()

    @staticmethod
    def _search_url_for_query(query):
        from . import search_engines
        return search_engines.get_search_url(str(query or ""))

    def _get_history_raw(self) -> list:
        h = self._history
        if not h:
            return []
        try:
            cache = h._ensure_cache()
            return cache.get("entries", [])
        except Exception:
            return []

    def _get_bookmarks_raw(self) -> list:
        bm = self._bookmarks
        if not bm:
            return []
        try:
            cache = bm._ensure_cache()
            return cache.get("bookmarks", [])
        except Exception:
            return []
