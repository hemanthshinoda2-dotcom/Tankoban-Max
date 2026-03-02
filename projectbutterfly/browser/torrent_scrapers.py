"""
Direct torrent scrapers for PirateBay, 1337x, and Nyaa.

No Jackett/Prowlarr required — these scrape the sites directly.
Uses only stdlib (urllib + html.parser) to avoid extra dependencies.
"""

from __future__ import annotations

import json
import re
import urllib.request
import urllib.parse
import urllib.error
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor, as_completed


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/json,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

_TIMEOUT = 12  # seconds per request


def _fetch(url: str) -> str:
    """Fetch a URL and return the response body as text."""
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = resp.read()
        # Try to detect encoding
        ct = resp.headers.get("Content-Type", "")
        if "charset=" in ct:
            enc = ct.split("charset=")[-1].split(";")[0].strip()
        else:
            enc = "utf-8"
        return data.decode(enc, errors="replace")


def _parse_size(size_str: str) -> int:
    """Parse a human-readable size string into bytes."""
    size_str = size_str.strip().upper().replace(",", "")
    multipliers = {"B": 1, "KB": 1024, "KIB": 1024, "MB": 1048576, "MIB": 1048576,
                   "GB": 1073741824, "GIB": 1073741824, "TB": 1099511627776, "TIB": 1099511627776}
    for unit, mult in sorted(multipliers.items(), key=lambda x: -len(x[0])):
        if size_str.endswith(unit):
            try:
                return int(float(size_str[: -len(unit)].strip()) * mult)
            except ValueError:
                return 0
    try:
        return int(float(size_str))
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# PirateBay (via apibay.org JSON API)
# ---------------------------------------------------------------------------

_TPB_API = "https://apibay.org/q.php"


def search_piratebay(query: str, limit: int = 30) -> list[dict]:
    """Search PirateBay via the apibay.org API."""
    try:
        url = f"{_TPB_API}?q={urllib.parse.quote_plus(query)}"
        text = _fetch(url)
        data = json.loads(text)

        if not isinstance(data, list):
            return []

        results = []
        for item in data[:limit]:
            name = item.get("name", "")
            if not name or name == "No results returned":
                continue
            info_hash = item.get("info_hash", "")
            if not info_hash:
                continue

            magnet = (
                f"magnet:?xt=urn:btih:{info_hash}"
                f"&dn={urllib.parse.quote_plus(name)}"
                f"&tr=udp://tracker.opentrackr.org:1337/announce"
                f"&tr=udp://open.stealth.si:80/announce"
                f"&tr=udp://tracker.torrent.eu.org:451/announce"
                f"&tr=udp://tracker.bittor.pw:1337/announce"
                f"&tr=udp://tracker.openbittorrent.com:6969/announce"
            )

            results.append({
                "title": name,
                "magnetUri": magnet,
                "sizeBytes": int(item.get("size", 0)),
                "seeders": int(item.get("seeders", 0)),
                "leechers": int(item.get("leechers", 0)),
                "sourceName": "PirateBay",
                "sourceKey": "piratebay",
            })

        return results
    except Exception:
        return []


# ---------------------------------------------------------------------------
# 1337x (HTML scraping)
# ---------------------------------------------------------------------------

_1337X_BASE = "https://1337x.to"


class _1337xListParser(HTMLParser):
    """Parse the 1337x search results list page."""

    def __init__(self):
        super().__init__()
        self.results: list[dict] = []
        self._current: dict = {}
        self._in_name_col = False
        self._in_seeds_col = False
        self._in_leech_col = False
        self._in_size_col = False
        self._in_a = False
        self._col_index = 0
        self._td_depth = 0
        self._capture_text = ""
        self._in_tbody = False

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "tbody":
            self._in_tbody = True
        if not self._in_tbody:
            return
        if tag == "tr":
            self._current = {}
            self._col_index = 0
        elif tag == "td":
            self._col_index += 1
            self._td_depth += 1
            self._capture_text = ""
            if self._col_index == 1:
                self._in_name_col = True
            elif self._col_index == 2:
                self._in_seeds_col = True
            elif self._col_index == 3:
                self._in_leech_col = True
            elif self._col_index == 4:
                self._in_size_col = True
        elif tag == "a" and self._in_name_col:
            href = attrs_d.get("href", "")
            if "/torrent/" in href:
                self._current["_detail_path"] = href
                self._in_a = True

    def handle_endtag(self, tag):
        if tag == "tbody":
            self._in_tbody = False
        if not self._in_tbody:
            return
        if tag == "td":
            self._td_depth -= 1
            text = self._capture_text.strip()
            if self._in_seeds_col:
                self._current["seeders"] = int(text) if text.isdigit() else 0
                self._in_seeds_col = False
            elif self._in_leech_col:
                self._current["leechers"] = int(text) if text.isdigit() else 0
                self._in_leech_col = False
            elif self._in_size_col:
                # Size cell sometimes has a <span> with the unit
                self._current["sizeBytes"] = _parse_size(text)
                self._in_size_col = False
            self._in_name_col = False
        elif tag == "a" and self._in_a:
            self._current["title"] = self._capture_text.strip()
            self._in_a = False
        elif tag == "tr" and self._current.get("title"):
            self.results.append(self._current)

    def handle_data(self, data):
        if self._in_tbody:
            self._capture_text += data


class _1337xDetailParser(HTMLParser):
    """Parse a 1337x torrent detail page to extract the magnet link."""

    def __init__(self):
        super().__init__()
        self.magnet: str = ""

    def handle_starttag(self, tag, attrs):
        if tag == "a" and not self.magnet:
            href = dict(attrs).get("href", "")
            if href.startswith("magnet:"):
                self.magnet = href


def _1337x_get_magnet(detail_path: str) -> str:
    """Fetch a 1337x detail page and extract the magnet link."""
    try:
        html = _fetch(f"{_1337X_BASE}{detail_path}")
        parser = _1337xDetailParser()
        parser.feed(html)
        return parser.magnet
    except Exception:
        return ""


def search_1337x(query: str, limit: int = 20) -> list[dict]:
    """Search 1337x by scraping the search results page."""
    try:
        url = f"{_1337X_BASE}/search/{urllib.parse.quote_plus(query)}/1/"
        html = _fetch(url)
        parser = _1337xListParser()
        parser.feed(html)

        raw = parser.results[:limit]
        if not raw:
            return []

        # Fetch magnet links in parallel (up to 6 concurrent)
        results = []
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {}
            for item in raw:
                path = item.get("_detail_path", "")
                if path:
                    futures[pool.submit(_1337x_get_magnet, path)] = item

            for future in as_completed(futures):
                item = futures[future]
                magnet = ""
                try:
                    magnet = future.result()
                except Exception:
                    pass
                if magnet:
                    results.append({
                        "title": item.get("title", ""),
                        "magnetUri": magnet,
                        "sizeBytes": item.get("sizeBytes", 0),
                        "seeders": item.get("seeders", 0),
                        "leechers": item.get("leechers", 0),
                        "sourceName": "1337x",
                        "sourceKey": "1337x",
                    })

        return results
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Nyaa (HTML scraping)
# ---------------------------------------------------------------------------

_NYAA_BASE = "https://nyaa.si"


class _NyaaParser(HTMLParser):
    """Parse the Nyaa search results table."""

    def __init__(self):
        super().__init__()
        self.results: list[dict] = []
        self._current: dict = {}
        self._in_tbody = False
        self._col_index = 0
        self._capture_text = ""
        self._td_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "tbody":
            self._in_tbody = True
        if not self._in_tbody:
            return
        if tag == "tr":
            self._current = {}
            self._col_index = 0
        elif tag == "td":
            self._col_index += 1
            self._capture_text = ""
            self._td_depth += 1
        elif tag == "a":
            href = attrs_d.get("href", "")
            # Column 2 has the title link
            if self._col_index == 2 and "/view/" in href and "title" not in self._current:
                self._current["_title_link"] = True
            # Column 3 has magnet and torrent links
            if self._col_index == 3 and href.startswith("magnet:"):
                self._current["magnetUri"] = href

    def handle_endtag(self, tag):
        if tag == "tbody":
            self._in_tbody = False
        if not self._in_tbody:
            return
        if tag == "td":
            self._td_depth -= 1
            text = self._capture_text.strip()
            if self._col_index == 4:
                self._current["sizeBytes"] = _parse_size(text)
            elif self._col_index == 6:
                self._current["seeders"] = int(text) if text.isdigit() else 0
            elif self._col_index == 7:
                self._current["leechers"] = int(text) if text.isdigit() else 0
        elif tag == "a" and self._current.get("_title_link"):
            self._current["title"] = self._capture_text.strip()
            del self._current["_title_link"]
        elif tag == "tr":
            if self._current.get("title") and self._current.get("magnetUri"):
                self.results.append(self._current)

    def handle_data(self, data):
        if self._in_tbody:
            self._capture_text += data


def search_nyaa(query: str, limit: int = 30) -> list[dict]:
    """Search Nyaa.si by scraping the search results page."""
    try:
        url = f"{_NYAA_BASE}/?f=0&c=0_0&q={urllib.parse.quote_plus(query)}&s=seeders&o=desc"
        html = _fetch(url)
        parser = _NyaaParser()
        parser.feed(html)

        results = []
        for item in parser.results[:limit]:
            results.append({
                "title": item.get("title", ""),
                "magnetUri": item.get("magnetUri", ""),
                "sizeBytes": item.get("sizeBytes", 0),
                "seeders": item.get("seeders", 0),
                "leechers": item.get("leechers", 0),
                "sourceName": "Nyaa",
                "sourceKey": "nyaa",
            })

        return results
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Unified search (all sources in parallel)
# ---------------------------------------------------------------------------

def search_all(query: str, sites: set[str] | None = None, limit: int = 60) -> list[dict]:
    """
    Search all enabled sites in parallel and return merged, sorted results.

    Args:
        query: Search query string
        sites: Set of site keys to search ("piratebay", "1337x", "nyaa").
               None means search all.
        limit: Max total results to return.

    Returns:
        List of result dicts sorted by seeders descending.
    """
    if sites is None:
        sites = {"piratebay", "1337x", "nyaa"}

    searchers = []
    if "piratebay" in sites:
        searchers.append(("piratebay", search_piratebay, query, 30))
    if "1337x" in sites:
        searchers.append(("1337x", search_1337x, query, 20))
    if "nyaa" in sites:
        searchers.append(("nyaa", search_nyaa, query, 30))

    all_results = []

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {}
        for key, fn, q, lim in searchers:
            futures[pool.submit(fn, q, lim)] = key

        for future in as_completed(futures):
            try:
                results = future.result()
                all_results.extend(results)
            except Exception:
                pass

    # Sort by seeders descending
    all_results.sort(key=lambda r: r.get("seeders", 0), reverse=True)

    # Deduplicate by magnet info_hash
    seen_hashes: set[str] = set()
    deduped = []
    for r in all_results:
        magnet = r.get("magnetUri", "")
        # Extract info_hash from magnet
        m = re.search(r"btih:([a-fA-F0-9]{40})", magnet)
        if not m:
            m = re.search(r"btih:([a-zA-Z2-7]{32})", magnet)
        ih = m.group(1).lower() if m else magnet
        if ih not in seen_hashes:
            seen_hashes.add(ih)
            deduped.append(r)

    return deduped[:limit]
