"""
ChromeBrowser — main browser widget.

Assembles tab bar, nav bar, viewport stack, find bar, and context menus
into a single QWidget that replaces TankoWebWidget at stack index 2.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QColor, QKeySequence, QShortcut, QClipboard, QPixmap, QImage
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QStackedWidget, QApplication, QFileDialog,
)
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest, QNetworkReply
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import (
    QWebEnginePage,
    QWebEngineProfile,
    QWebEngineSettings,
)

from . import theme
from .tab_state import TabData, TabManager
from .tab_bar import TabBar
from .nav_bar import NavBar
from .browser_page import ChromePage, inject_antibot_script, inject_adblocker_script
from .find_bar import FindBar
from .bookmarks_bar import BookmarksBar
from .downloads_shelf import DownloadsShelf
from .data_bridge import DataBridge
from .context_menu import build_context_menu
from .permission_bar import PermissionBar
from .status_bar import StatusBar
from .shortcuts import SHORTCUTS

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_HERE = Path(__file__).resolve().parent
_NEWTAB_HTML = _HERE / "data" / "newtab.html"


# ---------------------------------------------------------------------------
# ChromeBrowser
# ---------------------------------------------------------------------------

class ChromeBrowser(QWidget):
    """
    Chrome-like browser widget.

    Integration:
        browser = ChromeBrowser(
            profile=shared_profile,
            on_back=show_web_view,
            on_window_action=handle_minimize_maximize_close,
        )
        stack.addWidget(browser)
    """

    def __init__(
        self,
        profile: QWebEngineProfile | None = None,
        on_back: Callable | None = None,
        on_window_action: Callable | None = None,
        bridge_root=None,
        parent: QWidget | None = None,
    ):
        super().__init__(parent)

        self._profile = profile or QWebEngineProfile.defaultProfile()
        self._on_back = on_back
        self._on_window_action = on_window_action
        self._closed_tabs: list[str] = []  # URLs of recently closed tabs

        # Data bridge (reads history/bookmarks from bridge.py)
        self._data_bridge = DataBridge(bridge_root)

        # Inject anti-bot + ad blocker scripts into the profile
        inject_antibot_script(self._profile)
        inject_adblocker_script(self._profile)

        # -- Tab manager (non-visual) --
        self._tab_mgr = TabManager(self)

        # -- Build UI --
        self.setStyleSheet(f"background: {theme.BG_TITLEBAR};")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Tab bar
        self._tab_bar = TabBar()
        layout.addWidget(self._tab_bar)

        # Nav bar (with omnibox autocomplete)
        self._nav_bar = NavBar(data_bridge=self._data_bridge)
        layout.addWidget(self._nav_bar)

        # Bookmarks bar (hidden by default, Ctrl+Shift+B toggles)
        self._bookmarks_bar = BookmarksBar(data_bridge=self._data_bridge)
        self._bookmarks_bar.navigate_requested.connect(self._navigate_active)
        layout.addWidget(self._bookmarks_bar)

        # Find bar (hidden by default)
        self._find_bar = FindBar()
        layout.addWidget(self._find_bar)

        # Permission bar (hidden, shows when site requests permission)
        self._permission_bar = PermissionBar()
        self._permission_bar.permission_decided.connect(self._on_permission_decided)
        layout.addWidget(self._permission_bar)

        # Viewport — one QWebEngineView per tab, stacked
        self._viewport = QStackedWidget()
        self._viewport.setStyleSheet(f"background: {theme.BG_VIEWPORT};")
        layout.addWidget(self._viewport, 1)

        # Downloads shelf (hidden, shows when download starts)
        self._downloads_shelf = DownloadsShelf()
        layout.addWidget(self._downloads_shelf)

        # Status bar (floating overlay on viewport, shows link URL on hover)
        self._status_bar = StatusBar(self._viewport)

        # -- Wire signals --
        self._wire_tab_manager()
        self._wire_tab_bar()
        self._wire_nav_bar()
        self._wire_find_bar()
        self._wire_downloads()
        self._bind_shortcuts()

        # -- Open initial tab --
        self.new_tab()

    # -----------------------------------------------------------------------
    # Signal wiring
    # -----------------------------------------------------------------------

    def _wire_tab_manager(self):
        mgr = self._tab_mgr
        mgr.tab_added.connect(self._on_tab_added)
        mgr.tab_removed.connect(self._on_tab_removed)
        mgr.tab_activated.connect(self._on_tab_activated)
        mgr.tab_title_changed.connect(self._tab_bar.update_title)
        mgr.tab_icon_changed.connect(self._tab_bar.update_icon)
        mgr.tab_loading_changed.connect(self._on_tab_loading_changed)

    def _wire_tab_bar(self):
        self._tab_bar.tab_clicked.connect(self._tab_mgr.activate)
        self._tab_bar.tab_close_clicked.connect(self._close_tab)
        self._tab_bar.new_tab_clicked.connect(self.new_tab)
        self._tab_bar.tab_reorder_requested.connect(self._on_tab_reorder)
        self._tab_bar.tab_pin_requested.connect(self._on_tab_pin)
        self._tab_bar.tab_duplicate_requested.connect(self.duplicate_tab)
        self._tab_bar.tab_mute_requested.connect(self.toggle_mute_tab)
        # Window controls live in the tab bar now
        self._tab_bar.minimize_clicked.connect(lambda: self._window_action("minimize"))
        self._tab_bar.maximize_clicked.connect(lambda: self._window_action("maximize"))
        self._tab_bar.close_clicked.connect(lambda: self._window_action("close"))

    def _wire_nav_bar(self):
        nav = self._nav_bar
        nav.navigate_requested.connect(self._navigate_active)
        nav.back_clicked.connect(self.go_back)
        nav.forward_clicked.connect(self.go_forward)
        nav.reload_clicked.connect(self.reload_active)
        nav.stop_clicked.connect(self._stop_active)
        nav.home_clicked.connect(self._go_home)
        nav.new_tab_clicked.connect(self.new_tab)
        nav.history_clicked.connect(self.open_history)
        nav.settings_clicked.connect(self.open_settings)
        nav.bookmarks_bar_toggled.connect(self.toggle_bookmarks_bar)
        nav.library_clicked.connect(self._go_to_library)
        nav.bookmark_toggled.connect(self.toggle_bookmark)

    def _go_to_library(self):
        """Navigate back to the main Tankoban library."""
        if self._on_back:
            self._on_back()

    def _wire_find_bar(self):
        self._find_bar.closed.connect(self._on_find_closed)

    def _wire_downloads(self):
        self._profile.downloadRequested.connect(self._on_download_requested)

    # File extension → library type mapping
    _BOOK_EXTS = {".epub", ".pdf", ".mobi", ".azw3", ".azw", ".txt", ".djvu", ".fb2", ".lit", ".pdb"}
    _COMIC_EXTS = {".cbr", ".cbz", ".cb7", ".cbt"}
    _VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".webm", ".mov", ".wmv", ".flv", ".m4v"}

    def _on_download_requested(self, download):
        """Handle a new download — routes to the correct library folder by type."""
        filename = download.downloadFileName() or ""
        ext = os.path.splitext(filename)[1].lower()

        # Route to the appropriate library root
        target_dir = self._get_download_dir(ext)
        if target_dir:
            download.setDownloadDirectory(target_dir)

        download.accept()
        self._downloads_shelf.add_download(download)

    def _get_download_dir(self, ext: str) -> str | None:
        """Determine the download directory based on file extension.

        Reads config files via storage module to find library root folders:
          - Books: books_settings.json → bookRootFolders
          - Comics: library_config.json → rootFolders
          - Videos: video_prefs.json → rootFolders
        """
        try:
            from .. import storage
        except Exception:
            return None

        if ext in self._BOOK_EXTS:
            cfg = storage.read_json(storage.data_path("books_settings.json"), {})
            roots = cfg.get("bookRootFolders", [])
            if roots:
                return roots[0]

        elif ext in self._COMIC_EXTS:
            cfg = storage.read_json(storage.data_path("library_config.json"), {})
            roots = cfg.get("rootFolders", [])
            if roots:
                return roots[0]

        elif ext in self._VIDEO_EXTS:
            cfg = storage.read_json(storage.data_path("video_prefs.json"), {})
            roots = cfg.get("rootFolders", [])
            if roots:
                return roots[0]

        return None

    def _bind_shortcuts(self):
        for key_seq, method_name in SHORTCUTS:
            method = getattr(self, method_name, None)
            if method:
                shortcut = QShortcut(QKeySequence(key_seq), self)
                shortcut.setContext(Qt.ShortcutContext.WidgetWithChildrenShortcut)
                shortcut.activated.connect(method)

    # -----------------------------------------------------------------------
    # Tab lifecycle
    # -----------------------------------------------------------------------

    def new_tab(self, url: str | None = None):
        """Create a new tab, optionally navigating to a URL."""
        tab = TabData()

        # Create QWebEngineView + ChromePage for this tab
        view = QWebEngineView()
        page = ChromePage(self._profile, tab.id, self)
        page.setBackgroundColor(QColor(32, 33, 36))  # prevent blank white flash on minimize/restore
        view.setPage(page)

        # Web settings
        settings = view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)

        # Fullscreen requests
        page.fullScreenRequested.connect(self._on_fullscreen_requested)

        tab.view = view

        # Wire page signals to tab manager
        self._wire_page_signals(tab.id, page, view)

        # Add to manager (also adds to tab bar via signal)
        idx = self._tab_mgr.add(tab, activate=True)
        if idx < 0:
            view.deleteLater()
            return

        # Navigate
        if url:
            view.load(QUrl(url))
        else:
            self._load_newtab(view)

    def _close_tab(self, tab_id: str):
        """Close a tab. If it's the last one, go back to the renderer."""
        tab = self._tab_mgr.get(tab_id)
        if not tab:
            return

        # Save URL for reopen
        if tab.url:
            self._closed_tabs.append(tab.url)
            if len(self._closed_tabs) > 20:
                self._closed_tabs = self._closed_tabs[-20:]

        # If this is the last tab, go back to the main app
        if self._tab_mgr.count <= 1:
            if self._on_back:
                self._on_back()
            return

        removed = self._tab_mgr.remove(tab_id)
        if removed and removed.view:
            removed.view.deleteLater()

    def close_active_tab(self):
        if self._tab_mgr.active_id:
            self._close_tab(self._tab_mgr.active_id)

    def reopen_closed_tab(self):
        if self._closed_tabs:
            url = self._closed_tabs.pop()
            self.new_tab(url)

    def next_tab(self):
        self._tab_mgr.activate_next()

    def prev_tab(self):
        self._tab_mgr.activate_prev()

    # -----------------------------------------------------------------------
    # Tab manager signal handlers
    # -----------------------------------------------------------------------

    def _on_tab_added(self, tab_id: str, index: int):
        tab = self._tab_mgr.get(tab_id)
        if tab and tab.view:
            self._viewport.addWidget(tab.view)
            self._tab_bar.add_tab(tab_id, tab.title, index)

    def _on_tab_removed(self, tab_id: str, index: int):
        self._tab_bar.remove_tab(tab_id)

    def _on_tab_activated(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return

        self._viewport.setCurrentWidget(tab.view)
        self._tab_bar.set_active(tab_id)
        self._tab_bar.ensure_visible(tab_id)

        # Update nav bar (hide internal page URLs)
        self._nav_bar.set_url(self._display_url(tab.url))
        self._nav_bar.set_loading(tab.loading)
        self._nav_bar.set_nav_state(tab.can_go_back, tab.can_go_forward)
        self._nav_bar.set_bookmarked(self._data_bridge.is_bookmarked(tab.url))

        # Update find bar page reference
        self._find_bar.set_page(tab.view.page())

    def _on_tab_loading_changed(self, tab_id: str, loading: bool, progress: int):
        self._tab_bar.update_loading(tab_id, loading)
        if tab_id == self._tab_mgr.active_id:
            self._nav_bar.set_loading(loading, progress)

    # -----------------------------------------------------------------------
    # Page signal wiring
    # -----------------------------------------------------------------------

    def _wire_page_signals(self, tab_id: str, page: ChromePage, view: QWebEngineView):
        """Connect a page's signals to the tab manager."""
        page.titleChanged.connect(
            lambda title, tid=tab_id: self._tab_mgr.update_title(tid, title)
        )
        page.urlChanged.connect(
            lambda url, tid=tab_id: self._on_url_changed(tid, url)
        )
        view.iconChanged.connect(
            lambda icon, tid=tab_id: self._tab_mgr.update_icon(tid, icon)
        )
        page.loadStarted.connect(
            lambda tid=tab_id: self._tab_mgr.update_loading(tid, True, 0)
        )
        page.loadProgress.connect(
            lambda pct, tid=tab_id: self._tab_mgr.update_loading(tid, True, pct)
        )
        page.loadFinished.connect(
            lambda ok, tid=tab_id: self._on_load_finished(tid, ok)
        )
        page.new_tab_requested.connect(
            lambda url, tid=tab_id: self._on_new_tab_requested(url)
        )
        page.internal_command.connect(self._on_internal_command)
        page.magnet_requested.connect(self._on_magnet_detected)

        # Permission prompts
        page.permission_prompt.connect(
            lambda origin, feature: self._permission_bar.show_permission(origin, feature)
        )

        # Audio state
        page.recentlyAudibleChanged.connect(
            lambda audible, tid=tab_id: self._on_audio_changed(tid, audible)
        )

        # Link hover → status bar
        page.linkHovered.connect(
            lambda url, tid=tab_id: self._on_link_hovered(tid, url)
        )

        # Context menu
        view.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        view.customContextMenuRequested.connect(
            lambda pos, v=view, p=page: self._show_context_menu(v, p, pos)
        )

    def _on_url_changed(self, tab_id: str, url: QUrl):
        url_str = url.toString()
        self._tab_mgr.update_url(tab_id, url_str)

        # Update nav bar if this is the active tab (hide internal page URLs)
        if tab_id == self._tab_mgr.active_id:
            self._nav_bar.set_url(self._display_url(url_str))
            self._nav_bar.set_bookmarked(self._data_bridge.is_bookmarked(url_str))

        # Update nav state
        tab = self._tab_mgr.get(tab_id)
        if tab and tab.view:
            page = tab.view.page()
            history = page.history()
            self._tab_mgr.update_nav_state(
                tab_id, history.canGoBack(), history.canGoForward()
            )
            if tab_id == self._tab_mgr.active_id:
                self._nav_bar.set_nav_state(history.canGoBack(), history.canGoForward())

    def _on_load_finished(self, tab_id: str, ok: bool):
        self._tab_mgr.update_loading(tab_id, False, 100 if ok else 0)

        # Record in history (skip local files and internal pages)
        if ok:
            tab = self._tab_mgr.get(tab_id)
            if tab and tab.url and tab.url.startswith("http"):
                self._data_bridge.add_history_entry(tab.url, tab.title)

    def _on_audio_changed(self, tab_id: str, audible: bool):
        tab = self._tab_mgr.get(tab_id)
        if tab:
            tab.audio_playing = audible
            self._tab_mgr.tab_audio_changed.emit(tab_id, audible, tab.muted)
            self._tab_bar.update_audio(tab_id, audible, tab.muted)

    def _on_link_hovered(self, tab_id: str, url: str):
        """Show link URL in status bar when hovering on the active tab."""
        if tab_id == self._tab_mgr.active_id:
            self._status_bar.show_url(url)

    def _on_new_tab_requested(self, url: QUrl):
        url_str = url.toString() if url and not url.isEmpty() else None
        self.new_tab(url_str)

    # -----------------------------------------------------------------------
    # Navigation
    # -----------------------------------------------------------------------

    def _navigate_active(self, url: str):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.load(QUrl(url))

    def go_back(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.back()

    def go_forward(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.forward()

    def reload_active(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.reload()

    def _stop_active(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.stop()

    def _go_home(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            self._load_newtab(tab.view)

    def _search_selection(self, text: str):
        """Search for selected text in a new tab using the configured engine."""
        from . import search_engines
        url = search_engines.get_search_url(text)
        self.new_tab(url)

    def _load_newtab(self, view: QWebEngineView):
        """Load the new tab page."""
        if _NEWTAB_HTML.exists():
            view.load(QUrl.fromLocalFile(str(_NEWTAB_HTML)))
        else:
            view.setHtml(
                "<html><body style='background:#202124;color:#e8eaed;"
                "font-family:sans-serif;display:flex;align-items:center;"
                "justify-content:center;height:100vh'>"
                "<h1>New Tab</h1></body></html>"
            )

    # -----------------------------------------------------------------------
    # Internal pages (tanko-browser:// scheme)
    # -----------------------------------------------------------------------

    _SETTINGS_HTML = _HERE / "data" / "settings.html"
    _HISTORY_HTML = _HERE / "data" / "history.html"
    _TORRENTS_HTML = _HERE / "data" / "torrents.html"

    # Internal pages whose file:// URLs should be hidden from the omnibox
    _INTERNAL_PAGE_NAMES = {"newtab.html", "settings.html", "history.html", "torrents.html"}

    @staticmethod
    def _display_url(url: str) -> str:
        """Return the URL to show in the omnibox. Internal pages show empty."""
        for name in ChromeBrowser._INTERNAL_PAGE_NAMES:
            if name in url:
                return ""
        return url

    def _on_internal_command(self, command: str, params: str):
        """Handle tanko-browser:// URLs."""
        if command == "settings":
            self.open_settings()
        elif command == "history":
            self.open_history()
        elif command == "clear-data":
            self._clear_browsing_data()
        elif command == "history-clear":
            self._clear_history()
        elif command == "history-delete":
            self._delete_history_entry(params)
        elif command == "torrents":
            self.open_torrents()
        elif command == "books":
            self._open_placeholder("Books", "Stacks-like book discovery — coming soon.")
        elif command == "comics":
            self._open_placeholder("Comics", "Comic downloader (Suwayomi / WeebCentral) — coming soon.")
        elif command == "torrent-search":
            self._handle_torrent_search(params)
        elif command == "torrent-add":
            self._handle_torrent_add(params)
        elif command == "torrent-action":
            self._handle_torrent_action(params)
        elif command == "torrent-select-files":
            self._handle_torrent_select_files(params)
        elif command == "torrent-open-folder":
            self._handle_torrent_open_folder(params)
        elif command == "torrent-pause-all":
            self._handle_torrent_global("pauseAll")
        elif command == "torrent-resume-all":
            self._handle_torrent_global("resumeAll")

    def open_settings(self):
        """Open settings in a new tab."""
        if self._SETTINGS_HTML.exists():
            self.new_tab(QUrl.fromLocalFile(str(self._SETTINGS_HTML)).toString())

    def open_history(self):
        """Open history page in a new tab, inject data after load."""
        if not self._HISTORY_HTML.exists():
            return
        self.new_tab(QUrl.fromLocalFile(str(self._HISTORY_HTML)).toString())
        # Inject history data after the page loads
        import json
        from PySide6.QtCore import QTimer
        def _inject():
            tab = self._tab_mgr.active_tab
            if tab and tab.view:
                entries = self._data_bridge._get_history_raw()
                # Sort by visitedAt descending
                entries = sorted(entries, key=lambda e: e.get("visitedAt", 0), reverse=True)
                js = f"if(typeof setHistoryData==='function')setHistoryData({json.dumps(entries[:500])});"
                tab.view.page().runJavaScript(js)
        QTimer.singleShot(500, _inject)

    def _clear_browsing_data(self):
        """Clear browsing data (history, cache, cookies)."""
        self._profile.clearHttpCache()
        self._clear_history()

    def _clear_history(self):
        """Clear all history entries."""
        h = self._data_bridge._history
        if h:
            cache = h._ensure_cache()
            cache["entries"] = []
            h._write()

    def _delete_history_entry(self, params: str):
        """Delete a single history entry by ID."""
        import urllib.parse
        parsed = urllib.parse.parse_qs(params)
        entry_id = parsed.get("id", [""])[0]
        if not entry_id:
            return
        h = self._data_bridge._history
        if h:
            cache = h._ensure_cache()
            cache["entries"] = [e for e in cache["entries"] if e.get("id") != entry_id]
            h._write()

    # -----------------------------------------------------------------------
    # Torrents page
    # -----------------------------------------------------------------------

    def _on_magnet_detected(self, magnet_uri: str):
        """Handle magnet link click — show the add-torrent dialog."""
        from .torrent_add_dialog import TorrentAddDialog
        bridge = self._data_bridge._bridge if self._data_bridge else None
        dlg = TorrentAddDialog(magnet_uri, bridge_root=bridge, parent=self)
        dlg.torrent_started.connect(self._on_torrent_added)
        dlg.exec()

    def _on_torrent_added(self, torrent_id: str):
        """Called when a torrent is added via the dialog — switch to torrents tab."""
        # If already on torrents page, just refresh. Otherwise open it.
        tab = self._tab_mgr.active_tab
        url = tab.url if tab else ""
        if "torrents.html" in url:
            self._push_torrent_updates()
        else:
            self.open_torrents()

    def open_torrents(self):
        """Open the torrent search + manager page."""
        if self._TORRENTS_HTML.exists():
            self.new_tab(QUrl.fromLocalFile(str(self._TORRENTS_HTML)).toString())
            # Start torrent progress polling for this tab
            self._start_torrent_polling()

    def _start_torrent_polling(self):
        """Start polling torrent progress and pushing updates to the active tab."""
        if hasattr(self, '_torrent_timer') and self._torrent_timer.isActive():
            return
        from PySide6.QtCore import QTimer
        self._torrent_timer = QTimer(self)
        self._torrent_timer.setInterval(1500)
        self._torrent_timer.timeout.connect(self._push_torrent_updates)
        self._torrent_timer.start()

    def _push_torrent_updates(self):
        """Push torrent download progress to the active tab if it's the torrents page."""
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            return
        url = tab.url or ""
        # Only push to the torrents page
        if "torrents.html" not in url and "tanko-browser://torrents" not in url:
            return
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "webTorrent"):
            return
        import json
        try:
            active_json = bridge.webTorrent.getActive()
            history_json = bridge.webTorrent.getHistory()
            active = json.loads(active_json) if isinstance(active_json, str) else active_json
            history = json.loads(history_json) if isinstance(history_json, str) else history_json
            combined = json.dumps({
                "active": active.get("torrents", []),
                "history": history.get("torrents", []),
            })
            tab.view.page().runJavaScript(
                f"if(typeof updateTorrents==='function')updateTorrents({combined});"
            )
        except Exception:
            pass

    def _handle_torrent_search(self, params: str):
        """Handle torrent search — runs direct scrapers in a background thread."""
        import urllib.parse, json, threading
        parsed = urllib.parse.parse_qs(params)
        query = parsed.get("q", [""])[0]
        if not query:
            return

        # Parse site filters from params (comma-separated)
        sites_param = parsed.get("sites", [""])[0]
        sites = set(sites_param.split(",")) if sites_param else None

        # Remember which tab requested the search
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            return
        tab_id = tab.id

        def _run_search():
            from .torrent_scrapers import search_all
            try:
                results = search_all(query, sites=sites, limit=60)
                result_json = json.dumps({"results": results})
            except Exception:
                result_json = json.dumps({"results": [], "error": "Search failed"})

            # Push results back to the tab on the main thread via QTimer
            from PySide6.QtCore import QTimer
            QTimer.singleShot(0, lambda: self._inject_search_results(tab_id, result_json))

        threading.Thread(target=_run_search, daemon=True).start()

    def _inject_search_results(self, tab_id: str, result_json: str):
        """Inject search results into the torrents page (called on main thread)."""
        tab = self._tab_mgr.get(tab_id)
        if tab and tab.view:
            tab.view.page().runJavaScript(
                f"if(typeof setSearchResults==='function')setSearchResults({result_json});"
            )

    def _handle_torrent_add(self, params: str):
        """Handle adding a magnet — show the add dialog."""
        import urllib.parse
        parsed = urllib.parse.parse_qs(params)
        magnet = parsed.get("magnet", [""])[0]
        if not magnet:
            return
        self._on_magnet_detected(magnet)

    def _handle_torrent_action(self, params: str):
        """Handle torrent actions (pause/resume/remove) from the torrents page."""
        import urllib.parse, json
        parsed = urllib.parse.parse_qs(params)
        action = parsed.get("action", [""])[0]
        torrent_id = parsed.get("id", [""])[0]
        if not action or not torrent_id:
            return
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "webTorrent"):
            return
        try:
            payload = json.dumps({"id": torrent_id})
            if action == "pause":
                bridge.webTorrent.pause(payload)
            elif action == "resume":
                bridge.webTorrent.resume(payload)
            elif action == "remove":
                delete_files = parsed.get("deleteFiles", ["false"])[0] == "true"
                payload = json.dumps({"id": torrent_id, "deleteFiles": delete_files})
                bridge.webTorrent.remove(payload)
        except Exception:
            pass

    def _handle_torrent_select_files(self, params: str):
        """Handle file selection change from the torrents page."""
        import urllib.parse, json
        parsed = urllib.parse.parse_qs(params)
        torrent_id = parsed.get("id", [""])[0]
        indices_raw = parsed.get("indices", [""])[0]
        if not torrent_id or not indices_raw:
            return
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "webTorrent"):
            return
        try:
            indices = json.loads(indices_raw)
            bridge.webTorrent.selectFiles(json.dumps({
                "id": torrent_id,
                "selectedIndices": indices,
            }))
        except Exception:
            pass

    def _handle_torrent_open_folder(self, params: str):
        """Open the save folder of a completed torrent in the file manager."""
        import urllib.parse, subprocess, json
        parsed = urllib.parse.parse_qs(params)
        torrent_id = parsed.get("id", [""])[0]
        if not torrent_id:
            return
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "webTorrent"):
            return
        try:
            active_json = bridge.webTorrent.getActive()
            active = json.loads(active_json) if isinstance(active_json, str) else active_json
            for t in active.get("torrents", []):
                if t.get("id") == torrent_id:
                    path = t.get("savePath") or t.get("destinationRoot", "")
                    if path and os.path.isdir(path):
                        subprocess.Popen(["explorer", os.path.normpath(path)])
                    return
            # Check history too
            hist_json = bridge.webTorrent.getHistory()
            hist = json.loads(hist_json) if isinstance(hist_json, str) else hist_json
            for t in hist.get("torrents", []):
                if t.get("id") == torrent_id:
                    path = t.get("savePath") or t.get("destinationRoot", "")
                    if path and os.path.isdir(path):
                        subprocess.Popen(["explorer", os.path.normpath(path)])
                    return
        except Exception:
            pass

    def _handle_torrent_global(self, action: str):
        """Handle global torrent actions (pauseAll, resumeAll)."""
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "webTorrent"):
            return
        try:
            if action == "pauseAll":
                bridge.webTorrent.pauseAll()
            elif action == "resumeAll":
                bridge.webTorrent.resumeAll()
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Placeholder pages (Books, Comics — coming soon)
    # -----------------------------------------------------------------------

    def _open_placeholder(self, title: str, description: str):
        """Open a placeholder page for features not yet implemented."""
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            self.new_tab()
            tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.setHtml(f"""
                <html><body style="background:#202124;color:#e8eaed;
                font-family:'Segoe UI',system-ui,sans-serif;display:flex;
                flex-direction:column;align-items:center;justify-content:center;
                height:100vh;text-align:center">
                <h1 style="font-size:36px;font-weight:300;margin-bottom:16px">{title}</h1>
                <p style="color:#9aa0a6;font-size:16px">{description}</p>
                </body></html>
            """)

    # -----------------------------------------------------------------------
    # Find bar
    # -----------------------------------------------------------------------

    def toggle_find_bar(self):
        if self._find_bar.isVisible():
            self._find_bar.hide_bar()
        else:
            tab = self._tab_mgr.active_tab
            if tab and tab.view:
                self._find_bar.set_page(tab.view.page())
            self._find_bar.show_bar()

    def _on_find_closed(self):
        # Return focus to the web view
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.setFocus()

    # -----------------------------------------------------------------------
    # Context menu
    # -----------------------------------------------------------------------

    def _show_context_menu(self, view: QWebEngineView, page: QWebEnginePage, pos):
        request = page.lastContextMenuRequest()
        if not request:
            return

        menu = build_context_menu(
            request,
            self,
            on_back=lambda: view.back(),
            on_forward=lambda: view.forward(),
            on_reload=lambda: view.reload(),
            on_copy=lambda: page.triggerAction(QWebEnginePage.WebAction.Copy),
            on_paste=lambda: page.triggerAction(QWebEnginePage.WebAction.Paste),
            on_cut=lambda: page.triggerAction(QWebEnginePage.WebAction.Cut),
            on_select_all=lambda: page.triggerAction(QWebEnginePage.WebAction.SelectAll),
            on_open_link_new_tab=lambda url: self.new_tab(url.toString()),
            on_copy_link=lambda url: QApplication.clipboard().setText(url.toString()),
            on_save_image=lambda url: self._save_image(url),
            on_copy_image=lambda url: self._copy_image(url),
            on_inspect=lambda: self.toggle_devtools(),
            on_search_selection=lambda text: self._search_selection(text),
        )

        menu.exec(view.mapToGlobal(pos))

    # -----------------------------------------------------------------------
    # Window actions
    # -----------------------------------------------------------------------

    def _window_action(self, action: str):
        if self._on_window_action:
            self._on_window_action(action)

    # -----------------------------------------------------------------------
    # Keyboard shortcut methods
    # -----------------------------------------------------------------------

    def focus_address_bar(self):
        self._nav_bar.focus_address_bar()

    def on_escape(self):
        """Escape key: exit fullscreen, close find bar, or defocus address bar."""
        win = self.window()
        if win.isFullScreen():
            self._exit_fullscreen()
        elif self._find_bar.isVisible():
            self._find_bar.hide_bar()
        else:
            tab = self._tab_mgr.active_tab
            if tab and tab.view:
                tab.view.setFocus()

    def toggle_bookmarks_bar(self):
        """Toggle bookmarks bar visibility (Ctrl+Shift+B)."""
        self._bookmarks_bar.toggle()

    # -----------------------------------------------------------------------
    # Bookmark star (Ctrl+D)
    # -----------------------------------------------------------------------

    def toggle_bookmark(self):
        """Toggle bookmark on the current page."""
        tab = self._tab_mgr.active_tab
        if not tab or not tab.url or not tab.url.startswith("http"):
            return
        if self._data_bridge.is_bookmarked(tab.url):
            self._data_bridge.remove_bookmark(tab.url)
            self._nav_bar.set_bookmarked(False)
        else:
            self._data_bridge.add_bookmark(tab.url, tab.title)
            self._nav_bar.set_bookmarked(True)

    # -----------------------------------------------------------------------
    # Zoom (Ctrl+Plus/Minus/0)
    # -----------------------------------------------------------------------

    def zoom_in(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.zoom_factor = min(5.0, tab.zoom_factor + 0.1)
            tab.view.setZoomFactor(tab.zoom_factor)

    def zoom_out(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.zoom_factor = max(0.25, tab.zoom_factor - 0.1)
            tab.view.setZoomFactor(tab.zoom_factor)

    def zoom_reset(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.zoom_factor = 1.0
            tab.view.setZoomFactor(1.0)

    # -----------------------------------------------------------------------
    # DevTools (F12)
    # -----------------------------------------------------------------------

    def toggle_devtools(self):
        """Open Chromium DevTools for the active tab."""
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            return
        page = tab.view.page()
        # If devtools page already exists, close it
        if hasattr(page, '_devtools_view') and page._devtools_view:
            page._devtools_view.close()
            page._devtools_view = None
            return
        # Create a new view for devtools
        from PySide6.QtWebEngineWidgets import QWebEngineView
        devtools = QWebEngineView()
        devtools.setWindowTitle(f"DevTools — {tab.title}")
        devtools.resize(900, 600)
        page.setDevToolsPage(devtools.page())
        page._devtools_view = devtools
        devtools.show()

    # -----------------------------------------------------------------------
    # Duplicate tab
    # -----------------------------------------------------------------------

    def duplicate_tab(self, tab_id: str | None = None):
        """Duplicate a tab by creating a new tab with the same URL."""
        tid = tab_id or self._tab_mgr.active_id
        tab = self._tab_mgr.get(tid) if tid else None
        if tab and tab.url:
            self.new_tab(tab.url)

    # -----------------------------------------------------------------------
    # Mute tab
    # -----------------------------------------------------------------------

    def toggle_mute_tab(self, tab_id: str | None = None):
        """Mute/unmute a tab."""
        tid = tab_id or self._tab_mgr.active_id
        tab = self._tab_mgr.get(tid) if tid else None
        if tab and tab.view:
            page = tab.view.page()
            tab.muted = not tab.muted
            page.setAudioMuted(tab.muted)
            self._tab_mgr.tab_audio_changed.emit(tid, tab.audio_playing, tab.muted)
            self._tab_bar.update_audio(tid, tab.audio_playing, tab.muted)

    # -----------------------------------------------------------------------
    # Image actions (context menu)
    # -----------------------------------------------------------------------

    def _save_image(self, url: QUrl):
        """Download an image from the given URL and save to file."""
        suggested = url.fileName() or "image.png"
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Image", suggested,
            "Images (*.png *.jpg *.jpeg *.gif *.webp *.bmp);;All Files (*)",
        )
        if not path:
            return
        # Use the profile's download mechanism
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.page().download(url, path)

    def _copy_image(self, url: QUrl):
        """Copy an image from URL to clipboard."""
        if not hasattr(self, '_net_mgr'):
            self._net_mgr = QNetworkAccessManager(self)
        reply = self._net_mgr.get(QNetworkRequest(url))
        reply.finished.connect(lambda r=reply: self._on_image_downloaded(r))

    def _on_image_downloaded(self, reply: QNetworkReply):
        """Handle image download completion for clipboard copy."""
        if reply.error() == QNetworkReply.NetworkError.NoError:
            data = reply.readAll()
            img = QImage()
            if img.loadFromData(data):
                QApplication.clipboard().setImage(img)
        reply.deleteLater()

    # -----------------------------------------------------------------------
    # Tab reorder + pinning
    # -----------------------------------------------------------------------

    def _on_tab_reorder(self, source_id: str, target_id: str):
        """Handle drag-drop reorder from tab bar."""
        self._tab_mgr.reorder(source_id, target_id)
        self._tab_bar.reorder_tab(source_id, target_id)

    def _on_tab_pin(self, tab_id: str, pin: bool):
        """Handle pin/unpin request from tab context menu."""
        if pin:
            self.pin_tab(tab_id)
        else:
            self.unpin_tab(tab_id)

    def pin_tab(self, tab_id: str):
        """Pin a tab."""
        tab = self._tab_mgr.set_pinned(tab_id, True)
        if tab:
            self._tab_bar.set_pinned(tab_id, True)

    def unpin_tab(self, tab_id: str):
        """Unpin a tab."""
        tab = self._tab_mgr.set_pinned(tab_id, False)
        if tab:
            self._tab_bar.set_pinned(tab_id, False)

    # -----------------------------------------------------------------------
    # Fullscreen
    # -----------------------------------------------------------------------

    def _on_fullscreen_requested(self, request):
        """Handle page-initiated fullscreen (e.g. video player)."""
        request.accept()
        if request.toggleOn():
            self._enter_fullscreen()
        else:
            self._exit_fullscreen()

    def toggle_fullscreen(self):
        """F11 toggle fullscreen."""
        win = self.window()
        if win.isFullScreen():
            self._exit_fullscreen()
        else:
            self._enter_fullscreen()

    def _enter_fullscreen(self):
        self._tab_bar.hide()
        self._nav_bar.hide()
        self._bookmarks_bar.hide()
        self._find_bar.hide()
        self._downloads_shelf.hide()
        win = self.window()
        if not win.isFullScreen():
            win.showFullScreen()

    def _exit_fullscreen(self):
        self._tab_bar.show()
        self._nav_bar.show()
        # Bookmarks bar only shows if it was visible before
        # Downloads shelf only shows if there are downloads
        win = self.window()
        if win.isFullScreen():
            win.showNormal()

    # -----------------------------------------------------------------------
    # Permission prompts
    # -----------------------------------------------------------------------

    def _on_permission_decided(self, origin, feature, granted):
        """Handle user's decision on a permission prompt."""
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            page = tab.view.page()
            policy = (
                QWebEnginePage.PermissionPolicy.PermissionGrantedByUser
                if granted else
                QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
            )
            page.setFeaturePermission(origin, feature, policy)

    # -----------------------------------------------------------------------
    # Additional shortcuts
    # -----------------------------------------------------------------------

    def open_downloads(self):
        """Toggle downloads shelf visibility."""
        if self._downloads_shelf.isVisible():
            self._downloads_shelf.setVisible(False)
        else:
            self._downloads_shelf.setVisible(True)

    def open_clear_data(self):
        """Open settings page (which has clear data button)."""
        self.open_settings()

    def print_page(self):
        """Print the current page (save as PDF via file dialog)."""
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            return
        title = tab.title.replace("/", "-").replace("\\", "-")[:50] or "page"
        path, _ = QFileDialog.getSaveFileName(
            self, "Save as PDF", f"{title}.pdf", "PDF Files (*.pdf)",
        )
        if path:
            tab.view.page().printToPdf(path)

    def view_source(self):
        """View page source in a new tab."""
        tab = self._tab_mgr.active_tab
        if tab and tab.url and tab.url.startswith("http"):
            self.new_tab(f"view-source:{tab.url}")

    # -----------------------------------------------------------------------
    # Tab number shortcuts (Ctrl+1..8, Ctrl+9)
    # -----------------------------------------------------------------------

    def _switch_to_tab_n(self, n: int):
        """Switch to the Nth tab (0-indexed)."""
        tabs = self._tab_mgr.tabs
        if 0 <= n < len(tabs):
            self._tab_mgr.activate(tabs[n].id)

    def switch_to_tab_1(self): self._switch_to_tab_n(0)
    def switch_to_tab_2(self): self._switch_to_tab_n(1)
    def switch_to_tab_3(self): self._switch_to_tab_n(2)
    def switch_to_tab_4(self): self._switch_to_tab_n(3)
    def switch_to_tab_5(self): self._switch_to_tab_n(4)
    def switch_to_tab_6(self): self._switch_to_tab_n(5)
    def switch_to_tab_7(self): self._switch_to_tab_n(6)
    def switch_to_tab_8(self): self._switch_to_tab_n(7)

    def switch_to_last_tab(self):
        """Ctrl+9: switch to the last tab."""
        tabs = self._tab_mgr.tabs
        if tabs:
            self._tab_mgr.activate(tabs[-1].id)
