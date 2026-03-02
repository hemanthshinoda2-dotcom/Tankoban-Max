"""
Project Butterfly — Sources Widget

A dedicated QWebEngineView that loads browser_sources.html and handles
the tankoweb://sources-* URL commands for torrent search/downloads.

Uses Jackett as the search provider (user-installed, not bundled).
Matches the Electron source mode behavior exactly.
"""

import json
import os
import threading
import urllib.parse

from PySide6.QtCore import Qt, QUrl, QTimer
from PySide6.QtWidgets import QWidget, QVBoxLayout
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings

import storage
import torrent_service

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_HERE = os.path.dirname(os.path.abspath(__file__))
_SOURCES_HTML = os.path.join(_HERE, "data", "browser_sources.html")
_SOURCES_URL = QUrl.fromLocalFile(_SOURCES_HTML)


# ---------------------------------------------------------------------------
# Custom page: intercepts tankoweb://sources-* commands
# ---------------------------------------------------------------------------

class _SourcesPage(QWebEnginePage):
    """Page that intercepts tankoweb:// URLs from browser_sources.html."""

    def __init__(self, profile, widget, parent=None):
        super().__init__(profile, parent)
        self._widget = widget

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):
        if url.scheme() == "tankoweb":
            host = url.host()
            params = urllib.parse.parse_qs(url.query())

            if host == "sources-search":
                q = params.get("q", [""])[0]
                source = params.get("source", ["all"])[0]
                type_filter = params.get("type", ["all"])[0]
                sort = params.get("sort", ["relevance"])[0]
                if q:
                    self._widget._do_search(q, source, type_filter, sort)
            elif host == "sources-add-magnet":
                mid = params.get("id", [""])[0]
                if mid:
                    self._widget._add_magnet(mid)
            elif host == "sources-torrent-context":
                tid = params.get("id", [""])[0]
                # Context menu — for now just log, TODO: implement
                print(f"[sources] torrent context: {tid}")
            elif host == "sources-unhide-all":
                self._widget._unhide_all()
            elif host == "sources-clear-downloads":
                self._widget._clear_downloads()
            elif host == "sources-config-providers":
                self._widget._open_provider_config()
            elif host == "sources-dl-open":
                did = params.get("id", [""])[0]
                print(f"[sources] open download: {did}")
            elif host == "sources-dl-show":
                did = params.get("id", [""])[0]
                print(f"[sources] show download folder: {did}")
            elif host == "sources-dl-cancel":
                did = params.get("id", [""])[0]
                print(f"[sources] cancel download: {did}")
            elif host == "sources-ready":
                # Page loaded — inject initial data
                self._widget._on_sources_ready()
            return False  # block tankoweb:// navigation
        return super().acceptNavigationRequest(url, nav_type, is_main_frame)


# ---------------------------------------------------------------------------
# SourcesWidget
# ---------------------------------------------------------------------------

class SourcesWidget(QWidget):
    """
    Sources mode panel — shows Downloads, Search, Torrents tables.

    Loads browser_sources.html in a QWebEngineView and handles all
    interaction via tankoweb:// URL scheme interception.
    """

    def __init__(self, jackett_fn=None, on_back=None, parent=None):
        super().__init__(parent)
        self._jackett_fn = jackett_fn or (lambda: None)
        self._on_back = on_back

        # Search results cache (for magnet lookup by ID)
        self._search_results: list[dict] = []

        # QBit client (detect existing running instance)
        self._qbit: torrent_service.QBitClient | None = None
        self._qbit_detecting = False

        # Layout
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Profile
        self._profile = QWebEngineProfile.defaultProfile()

        # Web view
        self._view = QWebEngineView()
        self._page = _SourcesPage(self._profile, self, self._view)
        self._view.setPage(self._page)

        # Transparent background so the app gradient shows through
        self._page.setBackgroundColor(Qt.GlobalColor.transparent)

        # Settings
        s = self._view.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

        layout.addWidget(self._view)

        # Load the sources page
        self._view.load(_SOURCES_URL)

        # Poll timer for torrent updates
        self._poll_timer = QTimer(self)
        self._poll_timer.timeout.connect(self._poll_torrent_data)
        self._poll_timer.start(5000)

        # Detect qBittorrent in background
        self._detect_qbit()

    # ------------------------------------------------------------------
    # qBittorrent detection (user's running instance)
    # ------------------------------------------------------------------

    def _detect_qbit(self):
        """Detect a running qBittorrent WebUI in background."""
        if self._qbit_detecting:
            return
        self._qbit_detecting = True

        def _detect():
            try:
                port = torrent_service._detect_running_qbit()
                if port:
                    client = torrent_service.QBitClient(f"http://127.0.0.1:{port}")
                    client.login()
                    self._qbit = client
                    print(f"[sources] qBittorrent detected at port {port}")
                else:
                    print("[sources] qBittorrent WebUI not detected")
            except Exception as e:
                print(f"[sources] qBittorrent detection error: {e}")
            finally:
                self._qbit_detecting = False

        threading.Thread(target=_detect, daemon=True).start()

    # ------------------------------------------------------------------
    # Page ready — inject initial data
    # ------------------------------------------------------------------

    def _on_sources_ready(self):
        """Called when browser_sources.html signals it's ready."""
        self._push_indexers()
        self._push_torrent_data()

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def _do_search(self, query, source="all", type_filter="all", sort="relevance"):
        """Search via Jackett in a background thread."""
        jackett = self._jackett_fn()
        if not jackett:
            self._run_js("setSearchError('Jackett not detected. Start Jackett and restart the app.')")
            return

        self._run_js("setSearchLoading(true)")

        def _search():
            try:
                indexer = source if source != "all" else "all"
                results = jackett.search(query, indexer=indexer, limit=60)

                # Apply type filter
                if type_filter and type_filter != "all":
                    # Filter by category keywords in title (best effort)
                    filtered = []
                    for r in results:
                        title_lower = (r.get("title", "") or "").lower()
                        if type_filter == "comics" and any(k in title_lower for k in ["comic", "manga", "cbz", "cbr"]):
                            filtered.append(r)
                        elif type_filter == "books" and any(k in title_lower for k in ["book", "epub", "pdf", "novel"]):
                            filtered.append(r)
                        elif type_filter == "tv" and any(k in title_lower for k in ["s0", "s1", "s2", "season", "episode"]):
                            filtered.append(r)
                        elif type_filter == "movies" and any(k in title_lower for k in ["movie", "film", "720p", "1080p", "2160p", "bluray", "bdrip"]):
                            filtered.append(r)
                        elif type_filter == "anime" and any(k in title_lower for k in ["anime", "sub", "dual audio"]):
                            filtered.append(r)
                        elif type_filter == "audio" and any(k in title_lower for k in ["mp3", "flac", "audiobook", "album"]):
                            filtered.append(r)
                        elif type_filter == "other":
                            filtered.append(r)
                    if filtered:
                        results = filtered

                # Apply sort
                if sort == "seeders_desc":
                    results.sort(key=lambda r: int(r.get("seeders", 0) or 0), reverse=True)
                elif sort == "size_desc":
                    results.sort(key=lambda r: int(r.get("sizeBytes", 0) or 0), reverse=True)

                self._search_results = results
                data_json = json.dumps(results)
                QTimer.singleShot(0, lambda: self._run_js(f"updateSearchResults({data_json})"))
            except Exception as e:
                msg = f"Search failed: {e}"
                QTimer.singleShot(0, lambda: self._run_js(f"setSearchError({json.dumps(msg)})"))

        threading.Thread(target=_search, daemon=True).start()

    # ------------------------------------------------------------------
    # Add magnet
    # ------------------------------------------------------------------

    def _add_magnet(self, result_id):
        """Add a magnet from search results to qBittorrent."""
        # Find the result by ID
        magnet = ""
        for r in self._search_results:
            if str(r.get("id", "")) == result_id:
                magnet = r.get("magnetUri", "") or r.get("downloadUrl", "")
                break

        if not magnet:
            print(f"[sources] magnet not found for id: {result_id}")
            return

        qbit = self._qbit
        if not qbit:
            # Try detecting again
            self._detect_qbit()
            print("[sources] qBittorrent not available — cannot add magnet")
            return

        def _add():
            try:
                ok = qbit.add_magnet(magnet)
                if ok:
                    print(f"[sources] Magnet added successfully")
                    QTimer.singleShot(1000, self._push_torrent_data)
                else:
                    print(f"[sources] Failed to add magnet")
            except Exception as e:
                print(f"[sources] Add magnet error: {e}")

        threading.Thread(target=_add, daemon=True).start()

    # ------------------------------------------------------------------
    # Torrent data polling
    # ------------------------------------------------------------------

    def _poll_torrent_data(self):
        """Timer callback: push torrent data to the page."""
        if not self.isVisible():
            return
        self._push_torrent_data()

    def _push_torrent_data(self):
        """Fetch torrent list from qBittorrent and push to JS."""
        qbit = self._qbit
        if not qbit:
            return

        def _fetch():
            try:
                torrents = qbit.list_torrents()
                # Normalize to match Electron format
                data = []
                for t in torrents:
                    data.append({
                        "id": t.get("hash", ""),
                        "hash": t.get("hash", ""),
                        "name": t.get("name", ""),
                        "totalSize": t.get("total_size", t.get("size", 0)),
                        "downloadRate": t.get("dlspeed", 0),
                        "progress": t.get("progress", 0),
                        "state": t.get("state", "unknown"),
                    })
                data_json = json.dumps(data)
                QTimer.singleShot(0, lambda: self._run_js(f"updateTorrents({data_json})"))
            except Exception as e:
                print(f"[sources] torrent poll error: {e}")

        threading.Thread(target=_fetch, daemon=True).start()

    # ------------------------------------------------------------------
    # Indexers
    # ------------------------------------------------------------------

    def _push_indexers(self):
        """Push indexer list to the Sources dropdown."""
        jackett = self._jackett_fn()
        if not jackett:
            return

        def _fetch():
            try:
                indexers = jackett.list_indexers()
                data_json = json.dumps(indexers)
                QTimer.singleShot(0, lambda: self._run_js(f"updateSources({data_json})"))
            except Exception as e:
                print(f"[sources] indexer list error: {e}")

        threading.Thread(target=_fetch, daemon=True).start()

    # ------------------------------------------------------------------
    # Misc actions
    # ------------------------------------------------------------------

    def _unhide_all(self):
        """Unhide all hidden torrents (no-op for now, state is in JS)."""
        print("[sources] unhide all")

    def _clear_downloads(self):
        """Clear completed downloads."""
        print("[sources] clear downloads")

    def _open_provider_config(self):
        """Open provider configuration (Jackett web UI)."""
        import webbrowser
        jackett = self._jackett_fn()
        if jackett:
            webbrowser.open(jackett._base)
        else:
            webbrowser.open("http://127.0.0.1:9117")

    # ------------------------------------------------------------------
    # JS helpers
    # ------------------------------------------------------------------

    def _run_js(self, code):
        """Execute JavaScript on the sources page."""
        try:
            self._page.runJavaScript(code)
        except Exception:
            pass
