"""
Data bridge — thin adapter connecting the browser to bridge.py's data layer.

Provides simple Python-native methods for querying history, bookmarks, etc.
without going through JSON serialization / QWebChannel.
"""

from __future__ import annotations


class DataBridge:
    """
    Adapter that reads directly from bridge.py's in-process QObject caches.

    Usage:
        db = DataBridge(bridge_root)
        results = db.search_history("github")
        bookmarks = db.get_bookmarks()
    """

    def __init__(self, bridge_root=None):
        self._bridge = bridge_root

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

    def search_completions(self, query: str, limit: int = 8) -> list[dict]:
        """
        Search history + bookmarks for omnibox completions.

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
                    # Score: exact domain match > title match > URL match
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

        # Search history
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
                    # Boost recent visits
                    visited_at = entry.get("visitedAt", 0)
                    if visited_at:
                        import time
                        age_hours = (time.time() * 1000 - visited_at) / 3600000
                        if age_hours < 1:
                            score += 40
                        elif age_hours < 24:
                            score += 20
                        elif age_hours < 168:  # 7 days
                            score += 10
                    results.append({
                        "type": "history",
                        "title": title or url,
                        "url": url,
                        "score": score,
                    })

        # Sort by score descending, limit
        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:limit]

    def get_bookmarks(self) -> list[dict]:
        """Get all bookmarks as a list of dicts."""
        return self._get_bookmarks_raw()

    def is_bookmarked(self, url: str) -> bool:
        """Check if a URL is bookmarked."""
        target = url.strip()
        for bm in self._get_bookmarks_raw():
            if bm.get("url", "").strip() == target:
                return True
        return False

    def add_bookmark(self, url: str, title: str = ""):
        """Add a bookmark via the bridge."""
        bm_bridge = self._bookmarks
        if bm_bridge:
            import json
            bm_bridge.add(json.dumps({"url": url, "title": title}))

    def remove_bookmark(self, url: str):
        """Remove a bookmark by URL via the bridge."""
        bm_bridge = self._bookmarks
        if bm_bridge:
            import json
            bm_bridge.removeByUrl(json.dumps({"url": url}))

    def add_history_entry(self, url: str, title: str = ""):
        """Record a page visit in history."""
        h_bridge = self._history
        if h_bridge:
            import json, time
            h_bridge.upsert(json.dumps({
                "url": url,
                "title": title,
                "visitedAt": int(time.time() * 1000),
                "scope": "sources_browser",
            }))

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
