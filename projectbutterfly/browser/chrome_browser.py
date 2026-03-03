"""
ChromeBrowser â€” main browser widget.

Assembles tab bar, nav bar, viewport stack, find bar, and context menus
into a single QWidget that replaces TankoWebWidget at stack index 2.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Callable

from PySide6.QtCore import Qt, QUrl, QTimer
from PySide6.QtGui import QColor, QKeySequence, QShortcut, QClipboard, QPixmap, QImage
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QStackedWidget, QApplication, QFileDialog, QMenu,
)
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest, QNetworkReply
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import (
    QWebEnginePage,
    QWebEngineProfile,
    QWebEngineSettings,
)

from . import theme, search_engines
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
        self._closed_tabs: list[dict] = []
        self._pending_permission = None
        self._failed_load_urls: dict[str, str] = {}
        self._suppress_load_error_until: dict[str, int] = {}
        self._tab_id_by_page: dict[int, str] = {}
        self._suspend_session_save = False
        self._restoring_session = False
        self._bookmarks_visible_before_fullscreen = False
        self._downloads_visible_before_fullscreen = False
        self._emergency_startup_mode = True

        # Data bridge (reads history/bookmarks from bridge.py)
        self._data_bridge = DataBridge(bridge_root)
        self._settings = self._data_bridge.load_browser_settings()
        search_engines.load_from_settings(self._settings)

        # Apply persisted theme before building UI
        theme.apply(self._settings.get("theme", "dark"))

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

        # Viewport â€” one QWebEngineView per tab, stacked
        self._viewport = QStackedWidget()
        self._viewport.setStyleSheet(f"background: {theme.BG_VIEWPORT};")
        layout.addWidget(self._viewport, 1)

        # Downloads shelf (hidden, shows when download starts)
        self._downloads_shelf = DownloadsShelf()
        layout.addWidget(self._downloads_shelf)

        # Status bar (floating overlay on viewport, shows link URL on hover)
        self._status_bar = StatusBar(self._viewport)

        # Session persistence (debounced)
        self._session_save_timer = QTimer(self)
        self._session_save_timer.setSingleShot(True)
        self._session_save_timer.setInterval(350)
        self._session_save_timer.timeout.connect(self._save_session_state_now)

        # -- Wire signals --
        self._wire_tab_manager()
        self._wire_tab_bar()
        self._wire_nav_bar()
        self._wire_find_bar()
        self._wire_downloads()
        self._bind_shortcuts()

        # -- Restore previous session (fallback: single new tab) --
        self._restore_session_or_default()

    # -----------------------------------------------------------------------
    # Signal wiring
    # -----------------------------------------------------------------------

    def _wire_tab_manager(self):
        mgr = self._tab_mgr
        mgr.tab_added.connect(self._on_tab_added)
        mgr.tab_removed.connect(self._on_tab_removed)
        mgr.tab_activated.connect(self._on_tab_activated)
        mgr.tab_url_changed.connect(lambda _tid, _url: self._schedule_session_save())
        mgr.tab_title_changed.connect(self._tab_bar.update_title)
        mgr.tab_title_changed.connect(lambda _tid, _title: self._schedule_session_save())
        mgr.tab_icon_changed.connect(self._tab_bar.update_icon)
        mgr.tab_loading_changed.connect(self._on_tab_loading_changed)
        mgr.tab_order_changed.connect(self._on_tab_order_changed)

    def _wire_tab_bar(self):
        self._tab_bar.tab_clicked.connect(self._tab_mgr.activate)
        self._tab_bar.tab_close_clicked.connect(self._close_tab)
        self._tab_bar.new_tab_clicked.connect(self.new_tab)
        self._tab_bar.tab_reorder_requested.connect(self._on_tab_reorder)
        self._tab_bar.tab_pin_requested.connect(self._on_tab_pin)
        self._tab_bar.tab_duplicate_requested.connect(self.duplicate_tab)
        self._tab_bar.tab_mute_requested.connect(self.toggle_mute_tab)
        self._tab_bar.close_other_tabs_requested.connect(self._close_other_tabs)
        self._tab_bar.close_tabs_right_requested.connect(self._close_tabs_to_the_right)
        self._tab_bar.reopen_closed_tab_requested.connect(self.reopen_closed_tab)
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
        nav.back_history_requested.connect(self._show_back_history_menu)
        nav.forward_history_requested.connect(self._show_forward_history_menu)
        nav.omnibox_draft_changed.connect(self._on_omnibox_draft_changed)

    def _go_to_library(self):
        """Navigate back to the main Tankoban library."""
        if self._on_back:
            self._on_back()

    def _wire_find_bar(self):
        self._find_bar.closed.connect(self._on_find_closed)

    def _wire_downloads(self):
        self._profile.downloadRequested.connect(self._on_download_requested)
        self._downloads_shelf.open_requested.connect(self._open_download_path)

    # File extension â†’ library type mapping
    _BOOK_EXTS = {".epub", ".pdf", ".mobi", ".azw3", ".azw", ".txt", ".djvu", ".fb2", ".lit", ".pdb"}
    _COMIC_EXTS = {".cbr", ".cbz", ".cb7", ".cbt"}
    _VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".webm", ".mov", ".wmv", ".flv", ".m4v"}

    def _on_download_requested(self, download):
        """Handle a new download and persist it through bridge download history."""
        filename = download.downloadFileName() or ""
        ext = os.path.splitext(filename)[1].lower()

        target_dir = self._get_download_dir(ext)
        if target_dir:
            download.setDownloadDirectory(target_dir)

        handled = False
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if bridge and hasattr(bridge, "webSources") and hasattr(bridge.webSources, "handleDownloadRequested"):
            try:
                bridge.webSources.handleDownloadRequested(download)
                handled = True
            except Exception:
                handled = False

        if not handled:
            download.accept()

        self._downloads_shelf.add_download(download)

    def _get_download_dir(self, ext: str) -> str | None:
        """Determine the download directory based on file extension.

        Prefers bridge-backed roots from webSources.getDestinations().
        Falls back to local state files if bridge roots are unavailable.
        """
        bridge = self._data_bridge._bridge if self._data_bridge else None
        roots = {"books": [], "comics": [], "videos": []}

        if bridge and hasattr(bridge, "webSources") and hasattr(bridge.webSources, "getDestinations"):
            try:
                raw = bridge.webSources.getDestinations()
                payload = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(payload, dict) and payload.get("ok"):
                    roots["books"] = [str(x) for x in (payload.get("allBooks") or []) if x]
                    roots["comics"] = [str(x) for x in (payload.get("allComics") or []) if x]
                    roots["videos"] = [str(x) for x in (payload.get("allVideos") or []) if x]
            except Exception:
                pass

        if not roots["books"] and not roots["comics"] and not roots["videos"]:
            try:
                from .. import storage
                cfg = storage.read_json(storage.data_path("library_state.json"), {})
                bcfg = storage.read_json(storage.data_path("books_library_state.json"), {})
                roots["comics"] = [str(x) for x in (cfg.get("rootFolders") or []) if x]
                roots["videos"] = [str(x) for x in (cfg.get("videoFolders") or []) if x]
                roots["books"] = [str(x) for x in (bcfg.get("bookRootFolders") or []) if x]
            except Exception:
                return None

        if ext in self._BOOK_EXTS and roots["books"]:
            return roots["books"][0]

        if ext in self._COMIC_EXTS and roots["comics"]:
            return roots["comics"][0]

        if ext in self._VIDEO_EXTS and roots["videos"]:
            return roots["videos"][0]

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

    def _normalize_closed_tab_entry(self, payload):
        src = payload if isinstance(payload, dict) else {}
        url = str(src.get("url", "") or "").strip()
        if not url:
            return None
        if self._is_restore_blocked_url(url):
            return None
        return {
            "url": url,
            "title": str(src.get("title", "") or "").strip(),
            "pinned": bool(src.get("pinned")),
            "muted": bool(src.get("muted")),
            "zoom": float(src.get("zoom", 1.0) or 1.0),
            "internal": bool(src.get("internal")),
        }

    def _push_closed_tab(self, tab: TabData):
        payload = self._normalize_closed_tab_entry({
            "url": tab.url,
            "title": tab.title,
            "pinned": tab.pinned,
            "muted": tab.muted,
            "zoom": tab.zoom_factor,
            "internal": tab.is_internal,
        })
        if not payload:
            return
        self._closed_tabs.append(payload)
        if len(self._closed_tabs) > 25:
            self._closed_tabs = self._closed_tabs[-25:]
        self._tab_bar.set_has_closed_tabs(bool(self._closed_tabs))

    def _build_tab_view(self, tab: TabData):
        view = QWebEngineView()
        page = ChromePage(self._profile, tab.id, self)
        page.setBackgroundColor(QColor(theme.BG_VIEWPORT))
        view.setPage(page)

        settings = view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)

        page.fullScreenRequested.connect(self._on_fullscreen_requested)
        page._create_window_callback = lambda opener_id=tab.id: self._create_tab_page(opener_id=opener_id)

        tab.view = view
        self._wire_page_signals(tab.id, page, view)
        if tab.zoom_factor and tab.zoom_factor != 1.0:
            view.setZoomFactor(tab.zoom_factor)
        if tab.muted:
            page.setAudioMuted(True)
        return view, page

    def new_tab(
        self,
        url: str | None = None,
        *,
        activate: bool = True,
        opener_id: str = "",
        pinned: bool = False,
        muted: bool = False,
        zoom: float = 1.0,
        is_internal: bool = False,
        title: str = "New Tab",
    ):
        """Create a new tab, optionally navigating to a URL."""
        tab = TabData(
            title=title or "New Tab",
            pinned=bool(pinned),
            muted=bool(muted),
            zoom_factor=float(zoom or 1.0),
            is_internal=bool(is_internal),
            opener_id=str(opener_id or ""),
        )

        view, _page = self._build_tab_view(tab)

        idx = self._tab_mgr.add(tab, activate=activate, opener_id=opener_id)
        if idx < 0:
            view.deleteLater()
            return None

        if url:
            view.load(QUrl(url))
        else:
            self._load_newtab(view)

        self._schedule_session_save()
        return tab.id

    def _close_tab(self, tab_id: str, record_closed: bool = True):
        """Close a tab. If it is the last tab, return to the library panel."""
        tab = self._tab_mgr.get(tab_id)
        if not tab:
            return

        if record_closed:
            self._push_closed_tab(tab)

        if self._tab_mgr.count <= 1:
            if self._on_back:
                self._on_back()
            return

        next_active_id = self._tab_mgr.next_active_after_close(tab_id, prefer_opener=True)
        removed = self._tab_mgr.remove(tab_id, next_active_id=next_active_id)
        self._failed_load_urls.pop(tab_id, None)
        self._suppress_load_error_until.pop(tab_id, None)
        if self._pending_permission and str(self._pending_permission.get("tabId", "")) == tab_id:
            self._pending_permission = None
            self._permission_bar.setVisible(False)
        if removed and removed.view:
            try:
                self._tab_id_by_page.pop(id(removed.view.page()), None)
            except Exception:
                pass
            self._viewport.removeWidget(removed.view)
            removed.view.deleteLater()
        self._schedule_session_save()

    def close_active_tab(self):
        if self._tab_mgr.active_id:
            self._close_tab(self._tab_mgr.active_id)

    def reopen_closed_tab(self):
        if self._closed_tabs:
            payload = self._closed_tabs.pop()
            self.new_tab(
                payload.get("url"),
                pinned=bool(payload.get("pinned")),
                muted=bool(payload.get("muted")),
                zoom=float(payload.get("zoom", 1.0) or 1.0),
                is_internal=bool(payload.get("internal")),
                title=str(payload.get("title", "") or "New Tab"),
            )
            self._tab_bar.set_has_closed_tabs(bool(self._closed_tabs))
            self._schedule_session_save()

    def _close_other_tabs(self, anchor_id: str):
        for tid in self._tab_mgr.close_other_ids(anchor_id):
            self._close_tab(tid, record_closed=True)

    def _close_tabs_to_the_right(self, anchor_id: str):
        for tid in self._tab_mgr.close_right_ids(anchor_id):
            self._close_tab(tid, record_closed=True)

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
            self._tab_bar.add_tab(tab_id, tab.title, index, pinned=tab.pinned)
            self._tab_bar.set_has_closed_tabs(bool(self._closed_tabs))
            self._schedule_session_save()

    def _on_tab_removed(self, tab_id: str, index: int):
        self._tab_bar.remove_tab(tab_id)
        self._schedule_session_save()

    def _on_tab_activated(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return

        self._viewport.setCurrentWidget(tab.view)
        self._tab_bar.set_active(tab_id)
        self._tab_bar.ensure_visible(tab_id)

        # Update nav bar (hide internal page URLs) and restore per-tab drafts.
        self._nav_bar.set_url(self._display_url(tab.url))
        if tab.omnibox_draft:
            self._nav_bar.set_omnibox_text(tab.omnibox_draft)
        self._nav_bar.set_loading(tab.loading)
        self._nav_bar.set_nav_state(tab.can_go_back, tab.can_go_forward)
        self._nav_bar.set_bookmarked(self._data_bridge.is_bookmarked(tab.url))

        # Update find bar page reference.
        self._find_bar.set_page(tab.view.page())
        self._permission_bar.setVisible(False)
        self._pending_permission = None
        if tab.zoom_factor and tab.zoom_factor != tab.view.zoomFactor():
            tab.view.setZoomFactor(tab.zoom_factor)
        self._schedule_session_save()

    def _on_tab_loading_changed(self, tab_id: str, loading: bool, progress: int):
        self._tab_bar.update_loading(tab_id, loading)
        if tab_id == self._tab_mgr.active_id:
            self._nav_bar.set_loading(loading, progress)

    def _on_tab_order_changed(self):
        tabs = self._tab_mgr.tabs
        self._tab_bar.set_order([t.id for t in tabs])
        for tab in tabs:
            self._tab_bar.set_pinned(tab.id, tab.pinned)
        self._schedule_session_save()

    def _on_omnibox_draft_changed(self, text: str):
        tab = self._tab_mgr.active_tab
        if not tab:
            return
        tab.omnibox_draft = str(text or "")
        self._schedule_session_save()

    # -----------------------------------------------------------------------
    # Page signal wiring
    # -----------------------------------------------------------------------

    def _wire_page_signals(self, tab_id: str, page: ChromePage, view: QWebEngineView):
        """Connect a page's signals to the tab manager."""
        self._tab_id_by_page[id(page)] = str(tab_id)
        page.destroyed.connect(
            lambda _obj=None, pid=id(page): self._tab_id_by_page.pop(pid, None)
        )
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
            lambda url, tid=tab_id: self._on_new_tab_requested(url, tid)
        )
        page.internal_command.connect(self._on_internal_command)
        page.magnet_requested.connect(
            lambda magnet, tid=tab_id: self._on_magnet_detected_for_tab(tid, magnet)
        )

        # Permission prompts
        page.permission_prompt.connect(
            lambda origin, feature, tid=tab_id, p=page: self._on_permission_requested(
                tid, p, origin, feature
            )
        )

        # Audio state
        page.recentlyAudibleChanged.connect(
            lambda audible, tid=tab_id: self._on_audio_changed(tid, audible)
        )

        # Link hover â†’ status bar
        page.linkHovered.connect(
            lambda url, tid=tab_id: self._on_link_hovered(tid, url)
        )

        # Context menu
        view.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        view.customContextMenuRequested.connect(
            lambda pos, v=view, p=page: self._show_context_menu(v, p, pos)
        )
        view.renderProcessTerminated.connect(
            lambda status, exit_code, tid=tab_id: self._on_render_process_terminated(
                tid, status, exit_code
            )
        )

    def _on_url_changed(self, tab_id: str, url: QUrl):
        url_str = url.toString()
        self._tab_mgr.update_url(tab_id, url_str)

        tab = self._tab_mgr.get(tab_id)
        if tab:
            tab.is_internal = self._is_internal_url(url_str)
            tab.crashed = False
            if url_str and not tab.is_internal:
                self._failed_load_urls.pop(tab_id, None)
            if tab_id == self._tab_mgr.active_id and not tab.omnibox_draft:
                self._nav_bar.set_url(self._display_url(url_str))
                self._nav_bar.set_bookmarked(self._data_bridge.is_bookmarked(url_str))

        # Update nav bar if this is the active tab (hide internal page URLs).
        if tab_id == self._tab_mgr.active_id:
            if not (tab and tab.omnibox_draft):
                self._nav_bar.set_url(self._display_url(url_str))
            self._nav_bar.set_bookmarked(self._data_bridge.is_bookmarked(url_str))

        # Update nav state.
        if tab and tab.view:
            page = tab.view.page()
            history = page.history()
            self._tab_mgr.update_nav_state(
                tab_id, history.canGoBack(), history.canGoForward()
            )
            if tab_id == self._tab_mgr.active_id:
                self._nav_bar.set_nav_state(history.canGoBack(), history.canGoForward())
        self._schedule_session_save()

    def _hold_tab_load_error_suppression(self, tab_id: str, ms: int):
        tid = str(tab_id or "").strip()
        if not tid:
            return
        now_ms = int(time.time() * 1000)
        deadline = now_ms + max(250, int(ms or 0))
        current = int(self._suppress_load_error_until.get(tid, 0) or 0)
        if deadline > current:
            self._suppress_load_error_until[tid] = deadline

    def _release_tab_load_error_suppression(self, tab_id: str):
        tid = str(tab_id or "").strip()
        if not tid:
            return
        self._suppress_load_error_until.pop(tid, None)

    def _is_tab_load_error_suppressed(self, tab_id: str) -> bool:
        tid = str(tab_id or "").strip()
        if not tid:
            return False
        suppress_until = int(self._suppress_load_error_until.get(tid, 0) or 0)
        if suppress_until and int(time.time() * 1000) <= suppress_until:
            return True
        if suppress_until:
            self._suppress_load_error_until.pop(tid, None)
        return False

    def _on_load_finished(self, tab_id: str, ok: bool):
        self._tab_mgr.update_loading(tab_id, False, 100 if ok else 0)
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return

        if ok:
            self._release_tab_load_error_suppression(tab_id)
            tab.crashed = False
            tab.last_error = ""
            tab.omnibox_draft = ""
            if tab.url and tab.url.startswith("http"):
                self._data_bridge.add_history_entry(tab.url, tab.title)
            self._inject_internal_page_data(tab_id)
            self._schedule_session_save()
            return

        if self._is_tab_load_error_suppressed(tab_id):
            # Internal commands and magnet interception can emit benign
            # aborted-load events on the source tab.
            return

        failed_url = str(tab.url or "").strip()
        lowered = failed_url.lower()
        if lowered.startswith("tanko-browser://") or lowered.startswith("magnet:"):
            # Command and magnet navigations are intercepted intentionally.
            return

        self._failed_load_urls[tab_id] = failed_url
        tab.last_error = "Load failed"
        self._show_error_page(tab_id, failed_url)
        self._schedule_session_save()

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

    def _create_tab_page(self, opener_id: str = "") -> ChromePage | None:
        """Create a new tab and return its QWebEnginePage.

        Called by ChromePage.createWindow() so Chromium can load the
        target URL directly into the returned page.
        """
        tab = TabData(opener_id=str(opener_id or ""))
        view, page = self._build_tab_view(tab)
        idx = self._tab_mgr.add(tab, activate=True, opener_id=opener_id)
        if idx < 0:
            view.deleteLater()
            active = self._tab_mgr.active_tab
            return active.view.page() if active and active.view else None
        self._schedule_session_save()
        return page

    def _on_new_tab_requested(self, url: QUrl, opener_id: str = ""):
        url_str = url.toString() if url and not url.isEmpty() else None
        self.new_tab(url_str, opener_id=opener_id)

    # -----------------------------------------------------------------------
    # Navigation
    # -----------------------------------------------------------------------

    def _navigate_active(self, url: str):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.omnibox_draft = ""
            tab.view.load(QUrl(url))

    def go_back(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.omnibox_draft = ""
            tab.view.back()

    def go_forward(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.omnibox_draft = ""
            tab.view.forward()

    def reload_active(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.omnibox_draft = ""
            tab.view.reload()

    def _stop_active(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.view.stop()

    def _go_home(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.omnibox_draft = ""
            self._load_newtab(tab.view)

    def _search_selection(self, text: str):
        """Search for selected text in a new tab using the configured engine."""
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
    _DOWNLOADS_HTML = _HERE / "data" / "downloads.html"
    _BOOKMARKS_HTML = _HERE / "data" / "bookmarks.html"
    _TORRENTS_HTML = _HERE / "data" / "torrents.html"

    # Internal pages whose file:// URLs should be hidden from the omnibox
    _INTERNAL_PAGE_NAMES = {
        "newtab.html",
        "settings.html",
        "history.html",
        "downloads.html",
        "bookmarks.html",
        "torrents.html",
    }

    @staticmethod
    def _display_url(url: str) -> str:
        """Return the URL to show in the omnibox. Internal pages show empty."""
        u = str(url or "")
        if u.startswith("tanko-browser://"):
            return ""
        for name in ChromeBrowser._INTERNAL_PAGE_NAMES:
            if name in u:
                return ""
        if "tanko-browser://error" in u or "tanko-browser://crashed" in u:
            return ""
        return u

    @staticmethod
    def _is_internal_url(url: str) -> bool:
        u = str(url or "")
        if not u:
            return False
        if u.startswith("tanko-browser://"):
            return True
        for name in ChromeBrowser._INTERNAL_PAGE_NAMES:
            if name in u:
                return True
        if "tanko-browser://error" in u or "tanko-browser://crashed" in u:
            return True
        return False

    @staticmethod
    def _parse_params(params: str):
        import urllib.parse
        return urllib.parse.parse_qs(str(params or ""))

    def _inject_internal_page_data(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        # Inject theme class into all internal pages
        cur_theme = str(self._settings.get("theme", "dark"))
        theme_js = (
            "document.body.classList.remove('light','dark');"
            "document.body.classList.add('" + cur_theme + "');"
        )
        tab.view.page().runJavaScript(theme_js)

        url = str(tab.url or "")
        if "history.html" in url:
            self._inject_history_data(tab_id)
        elif "settings.html" in url:
            self._inject_settings_data(tab_id)
        elif "downloads.html" in url:
            self._inject_downloads_data(tab_id)
        elif "bookmarks.html" in url:
            self._inject_bookmarks_data(tab_id)

    def _inject_settings_data(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        payload = {
            "defaultSearchEngine": search_engines.get_default_id(),
            "blockThirdPartyCookies": bool(self._settings.get("blockThirdPartyCookies")),
            "antiFingerprintProtection": bool(self._settings.get("antiFingerprintProtection", True)),
            "bookmarksBarVisible": bool(not self._bookmarks_bar.isHidden()),
            "theme": str(self._settings.get("theme", "dark")),
        }
        js = "if(typeof setSettingsData==='function')setSettingsData(" + json.dumps(payload) + ");"
        tab.view.page().runJavaScript(js)

    def _inject_history_data(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        entries = self._data_bridge._get_history_raw()
        entries = sorted(entries, key=lambda e: e.get("visitedAt", 0), reverse=True)
        js = "if(typeof setHistoryData==='function')setHistoryData(" + json.dumps(entries[:1000]) + ");"
        tab.view.page().runJavaScript(js)

    def _inject_downloads_data(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        rows = self._data_bridge.list_download_history()
        js = "if(typeof setDownloadsData==='function')setDownloadsData(" + json.dumps(rows) + ");"
        tab.view.page().runJavaScript(js)

    def _inject_bookmarks_data(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        rows = self._data_bridge.get_bookmarks()
        js = "if(typeof setBookmarksData==='function')setBookmarksData(" + json.dumps(rows) + ");"
        tab.view.page().runJavaScript(js)

    def _save_settings(self):
        self._settings = search_engines.apply_to_settings(self._settings)
        self._settings["bookmarksBarVisible"] = bool(not self._bookmarks_bar.isHidden())
        self._data_bridge.save_browser_settings(self._settings)
        self._schedule_session_save()

    def _apply_theme(self, name: str):
        """Switch to theme *name* and refresh all widget styles."""
        theme.apply(name)

        # Root widget
        self.setStyleSheet(f"background: {theme.BG_TITLEBAR};")
        self._viewport.setStyleSheet(f"background: {theme.BG_VIEWPORT};")

        # Tab bar
        self._tab_bar.setStyleSheet(theme.TAB_BAR_STYLE)
        self._tab_bar._new_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                color: {theme.TEXT_SECONDARY};
                border: none;
                border-radius: 14px;
                font-size: 18px;
                font-weight: bold;
                font-family: 'Segoe UI', sans-serif;
            }}
            QPushButton:hover {{
                background: {theme.CLOSE_BG};
                color: {theme.TEXT_PRIMARY};
            }}
        """)
        self._tab_bar._close_btn.setStyleSheet(theme.WINDOW_CLOSE_BTN_STYLE)
        self._tab_bar._min_btn.setStyleSheet(theme.WINDOW_BTN_STYLE)
        self._tab_bar._max_btn.setStyleSheet(theme.WINDOW_BTN_STYLE)

        # Nav bar
        self._nav_bar.setStyleSheet(theme.NAV_BAR_STYLE)

        # Find bar
        self._find_bar.setStyleSheet(theme.FIND_BAR_STYLE)

        # Bookmarks bar
        self._bookmarks_bar.setStyleSheet(f"""
            QWidget {{
                background: {theme.BG_TOOLBAR};
                border-bottom: 1px solid {theme.BORDER_COLOR};
            }}
        """)

        # Downloads shelf
        self._downloads_shelf.setStyleSheet(f"""
            QWidget {{
                background: {theme.BG_TOOLBAR};
                border-top: 1px solid {theme.BORDER_COLOR};
            }}
        """)

        # Permission bar
        self._permission_bar.setStyleSheet(f"""
            QWidget {{
                background: {theme.BG_TOOLBAR};
                border-bottom: 1px solid {theme.BORDER_COLOR};
            }}
        """)

        # Update webview backgrounds and inject theme class into internal pages
        theme_js = (
            "document.body.classList.remove('light','dark');"
            "document.body.classList.add('" + name + "');"
        )
        for tab in self._tab_mgr.tabs:
            if tab.view:
                tab.view.page().setBackgroundColor(
                    QColor(theme.BG_VIEWPORT)
                )
                url = str(tab.url or "")
                if tab.internal or any(p in url for p in (
                    "newtab.html", "settings.html", "history.html",
                    "downloads.html", "bookmarks.html", "torrents.html",
                )):
                    tab.view.page().runJavaScript(theme_js)

        # Force full repaint on paint-based widgets
        self._tab_bar.update()
        self._nav_bar.update()
        self._downloads_shelf.update()
        self._status_bar.update()
        # Omnibox lives inside nav bar as _address
        if hasattr(self._nav_bar, '_address'):
            self._nav_bar._address.update()
            # Update omnibox completion popup stylesheet
            if hasattr(self._nav_bar._address, '_popup'):
                self._nav_bar._address._popup.setStyleSheet(f"""
                    QWidget {{
                        background: {theme.BG_POPUP};
                        border: 1px solid {theme.BORDER_COLOR};
                        border-radius: 8px;
                    }}
                """)

    @staticmethod
    def _as_bool(raw, default=False):
        if raw is None:
            return bool(default)
        s = str(raw).strip().lower()
        if s in ("1", "true", "yes", "on"):
            return True
        if s in ("0", "false", "no", "off"):
            return False
        return bool(default)

    def _apply_settings_params(self, params: str):
        parsed = self._parse_params(params)
        if "defaultSearchEngine" in parsed:
            engine_id = parsed.get("defaultSearchEngine", [""])[0]
            search_engines.set_default(engine_id)
            self._settings["defaultSearchEngine"] = search_engines.get_default_id()
            self._nav_bar.refresh_search_engine_ui()
        if "blockThirdPartyCookies" in parsed:
            self._settings["blockThirdPartyCookies"] = self._as_bool(
                parsed.get("blockThirdPartyCookies", ["false"])[0]
            )
        if "antiFingerprintProtection" in parsed:
            self._settings["antiFingerprintProtection"] = self._as_bool(
                parsed.get("antiFingerprintProtection", ["true"])[0], default=True
            )
        if "bookmarksBarVisible" in parsed:
            show = self._as_bool(parsed.get("bookmarksBarVisible", ["false"])[0])
            self._bookmarks_bar.setVisible(show)
            if show:
                self._bookmarks_bar.refresh()
        if "theme" in parsed:
            name = str(parsed.get("theme", ["dark"])[0]).strip().lower()
            if name in ("dark", "light"):
                self._settings["theme"] = name
                self._apply_theme(name)
        self._save_settings()

    def _resolve_internal_command_source_tab(self) -> str:
        sender_page = self.sender()
        if sender_page is not None:
            tab_id = self._tab_id_by_page.get(id(sender_page), "")
            if tab_id and self._tab_mgr.get(tab_id):
                return tab_id
            for row in self._tab_mgr.tabs:
                if row.view and row.view.page() is sender_page:
                    self._tab_id_by_page[id(sender_page)] = row.id
                    return row.id
        return str(self._tab_mgr.active_id or "")

    def _command_target_tab(self, source_tab_id: str) -> str:
        sid = str(source_tab_id or "").strip()
        if sid and self._tab_mgr.get(sid):
            return sid
        return str(self._tab_mgr.active_id or "")

    def _on_internal_command(self, command: str, params: str):
        """Handle tanko-browser:// URLs."""
        source_tab_id = self._resolve_internal_command_source_tab()
        target_tab_id = self._command_target_tab(source_tab_id)
        if source_tab_id:
            self._hold_tab_load_error_suppression(source_tab_id, 2200)

        if command == "settings":
            self.open_settings()
        elif command == "settings-load":
            if target_tab_id:
                self._inject_settings_data(target_tab_id)
        elif command == "settings-save":
            self._apply_settings_params(params)
            if target_tab_id:
                self._inject_settings_data(target_tab_id)
        elif command == "history":
            self.open_history()
        elif command == "history-clear":
            self._clear_history()
            if target_tab_id:
                self._inject_history_data(target_tab_id)
        elif command == "history-delete":
            self._delete_history_entry(params)
            if target_tab_id:
                self._inject_history_data(target_tab_id)
        elif command == "history-reload":
            if target_tab_id:
                self._inject_history_data(target_tab_id)
        elif command == "clear-data":
            self._clear_browsing_data()
        elif command == "downloads":
            self.open_downloads_manager()
        elif command == "downloads-reload":
            if target_tab_id:
                self._inject_downloads_data(target_tab_id)
        elif command == "downloads-clear":
            self._clear_download_history(target_tab_id=target_tab_id)
        elif command == "downloads-remove":
            self._remove_download_entry(params, target_tab_id=target_tab_id)
        elif command == "downloads-open":
            self._open_download_entry(params)
        elif command == "downloads-reveal":
            self._reveal_download_entry(params)
        elif command == "bookmarks":
            self.open_bookmarks_manager()
        elif command == "bookmarks-delete":
            self._delete_bookmark_entry(params, target_tab_id=target_tab_id)
        elif command == "bookmarks-update":
            self._update_bookmark_entry(params, target_tab_id=target_tab_id)
        elif command == "bookmarks-reload":
            if target_tab_id:
                self._inject_bookmarks_data(target_tab_id)
        elif command == "retry-load":
            self._retry_failed_tab(params)
        elif command == "recover-tab":
            self._recover_crashed_tab(params)
        elif command == "torrents":
            self.open_torrents()
        elif command == "books":
            self._open_placeholder("Books", "Books mode is currently a non-parity placeholder.")
        elif command == "comics":
            self._open_placeholder("Comics", "Comics mode is currently a non-parity placeholder.")
        elif command == "torrent-search":
            self._handle_torrent_search(params, source_tab_id=target_tab_id)
        elif command == "torrent-search-config-load":
            self._handle_torrent_search_config_load(params, source_tab_id=target_tab_id)
        elif command == "torrent-search-config-save":
            self._handle_torrent_search_config_save(params, source_tab_id=target_tab_id)
        elif command == "torrent-search-indexers":
            self._handle_torrent_search_indexers(params, source_tab_id=target_tab_id)
        elif command == "torrent-add":
            self._handle_torrent_add(params, source_tab_id=target_tab_id)
        elif command == "torrent-manage":
            self._handle_torrent_manage(params)
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

    def _find_internal_manager_tab(self, page_name: str) -> str:
        needle = str(page_name or "").strip().lower()
        if not needle:
            return ""
        for row in self._tab_mgr.tabs:
            url = str(row.url or "").strip().lower()
            if needle in url:
                return row.id
        return ""

    def _open_internal_manager(self, path: Path, *, page_name: str, title: str) -> str:
        if not path.exists():
            return ""
        existing = self._find_internal_manager_tab(page_name)
        if existing:
            self._tab_mgr.activate(existing)
            return existing
        tab_id = self.new_tab(
            QUrl.fromLocalFile(str(path)).toString(),
            is_internal=True,
            title=title,
        )
        return str(tab_id or "")

    def open_settings(self):
        self._open_internal_manager(
            self._SETTINGS_HTML, page_name="settings.html", title="Settings"
        )

    def open_history(self):
        self._open_internal_manager(
            self._HISTORY_HTML, page_name="history.html", title="History"
        )

    def open_downloads_manager(self):
        self._open_internal_manager(
            self._DOWNLOADS_HTML, page_name="downloads.html", title="Downloads"
        )

    def open_bookmarks_manager(self):
        self._open_internal_manager(
            self._BOOKMARKS_HTML, page_name="bookmarks.html", title="Bookmarks"
        )

    def _clear_browsing_data(self):
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if bridge and hasattr(bridge, "webData"):
            try:
                bridge.webData.clear(json.dumps({"kinds": ["history", "downloads", "cache", "siteData"]}))
            except Exception:
                pass
        else:
            self._profile.clearHttpCache()
            self._clear_history()
        self._schedule_session_save()

    def _clear_history(self):
        h = self._data_bridge._history
        if h:
            cache = h._ensure_cache()
            cache["entries"] = []
            h._write()
        self._schedule_session_save()

    def _delete_history_entry(self, params: str):
        parsed = self._parse_params(params)
        entry_id = parsed.get("id", [""])[0]
        if not entry_id:
            return
        h = self._data_bridge._history
        if h:
            cache = h._ensure_cache()
            cache["entries"] = [e for e in cache["entries"] if e.get("id") != entry_id]
            h._write()
        self._schedule_session_save()

    def _download_row_by_id(self, download_id: str):
        did = str(download_id or "").strip()
        if not did:
            return None
        for row in self._data_bridge.list_download_history():
            if isinstance(row, dict) and str(row.get("id", "") or "") == did:
                return row
        return None

    def _clear_download_history(self, target_tab_id: str = ""):
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if bridge and hasattr(bridge, "webSources"):
            try:
                bridge.webSources.clearDownloadHistory()
            except Exception:
                pass
        target = self._command_target_tab(target_tab_id)
        if target:
            self._inject_downloads_data(target)

    def _remove_download_entry(self, params: str, target_tab_id: str = ""):
        parsed = self._parse_params(params)
        did = parsed.get("id", [""])[0]
        if not did:
            return
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if bridge and hasattr(bridge, "webSources"):
            try:
                bridge.webSources.removeDownloadHistory(json.dumps({"id": did}))
            except Exception:
                pass
        target = self._command_target_tab(target_tab_id)
        if target:
            self._inject_downloads_data(target)

    def _open_download_entry(self, params: str):
        parsed = self._parse_params(params)
        did = parsed.get("id", [""])[0]
        row = self._download_row_by_id(did)
        if not row:
            return
        path = str(row.get("savePath", "") or "").strip()
        if not path:
            return
        if os.path.exists(path):
            self._open_download_path(path)

    def _open_download_path(self, path: str) -> bool:
        abs_path = os.path.abspath(str(path or "").strip())
        if not abs_path or not os.path.exists(abs_path):
            return False

        ext = os.path.splitext(abs_path)[1].lower()
        bridge = self._data_bridge._bridge if self._data_bridge else None

        if ext in self._COMIC_EXTS or ext in self._BOOK_EXTS:
            if bridge and hasattr(bridge, "library") and hasattr(bridge.library, "emit_app_open_files"):
                try:
                    bridge.library.emit_app_open_files([abs_path], source="browser-download-open")
                    return True
                except Exception:
                    pass

        if ext in self._VIDEO_EXTS:
            if bridge and hasattr(bridge, "window") and hasattr(bridge.window, "openVideoShell"):
                try:
                    raw = bridge.window.openVideoShell(json.dumps({"filePath": abs_path, "source": "browser-download-open"}))
                    result = json.loads(raw) if isinstance(raw, str) else raw
                    if isinstance(result, dict) and result.get("ok"):
                        return True
                except Exception:
                    pass
            if bridge and hasattr(bridge, "player") and hasattr(bridge.player, "launchQt"):
                try:
                    raw = bridge.player.launchQt(json.dumps({
                        "filePath": abs_path,
                        "startSeconds": 0,
                        "sessionId": str(int(time.time() * 1000)),
                        "source": "browser-download-open",
                    }))
                    result = json.loads(raw) if isinstance(raw, str) else raw
                    if isinstance(result, dict) and result.get("ok"):
                        return True
                except Exception:
                    pass
        try:
            os.startfile(abs_path)
            return True
        except Exception:
            return False

    def _reveal_download_entry(self, params: str):
        parsed = self._parse_params(params)
        did = parsed.get("id", [""])[0]
        row = self._download_row_by_id(did)
        if not row:
            return
        path = str(row.get("savePath", "") or "").strip()
        if not path:
            return
        if os.path.exists(path):
            try:
                import subprocess
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            except Exception:
                pass

    def _delete_bookmark_entry(self, params: str, target_tab_id: str = ""):
        parsed = self._parse_params(params)
        bid = parsed.get("id", [""])[0]
        if not bid:
            return
        bridge = self._data_bridge._bookmarks
        if bridge:
            try:
                bridge.remove(json.dumps({"id": bid}))
            except Exception:
                pass
        self._bookmarks_bar.refresh()
        target = self._command_target_tab(target_tab_id)
        if target:
            self._inject_bookmarks_data(target)
        self._schedule_session_save()

    def _update_bookmark_entry(self, params: str, target_tab_id: str = ""):
        parsed = self._parse_params(params)
        bid = parsed.get("id", [""])[0]
        if not bid:
            return
        payload = {"id": bid}
        if "title" in parsed:
            payload["title"] = parsed.get("title", [""])[0]
        if "url" in parsed:
            payload["url"] = parsed.get("url", [""])[0]
        bridge = self._data_bridge._bookmarks
        if bridge:
            try:
                bridge.update(json.dumps(payload))
            except Exception:
                pass
        self._bookmarks_bar.refresh()
        target = self._command_target_tab(target_tab_id)
        if target:
            self._inject_bookmarks_data(target)
        self._schedule_session_save()

    # -----------------------------------------------------------------------
    # Error/crash, permissions, history menus, and session persistence
    # -----------------------------------------------------------------------

    @staticmethod
    def _escape_html(text: str) -> str:
        s = str(text or "")
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
        )

    def _show_error_page(self, tab_id: str, failed_url: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        safe_url = self._escape_html(failed_url)
        safe_tab = self._escape_html(tab_id)
        tab.is_internal = True
        tab.last_error = "load_failed"
        html = (
            "<html><body style='margin:0;background:#202124;color:#e8eaed;"
            "font-family:Segoe UI,system-ui,sans-serif;display:flex;align-items:center;"
            "justify-content:center;height:100vh'>"
            "<div style='max-width:640px;padding:28px 30px;background:#2b2c30;"
            "border:1px solid #3c4043;border-radius:12px'>"
            "<h1 style='margin:0 0 10px 0;font-size:28px;font-weight:500'>This page could not be loaded</h1>"
            "<p style='margin:0 0 14px 0;color:#9aa0a6;font-size:14px'>"
            "The browser failed to open this address.</p>"
            f"<p style='margin:0 0 18px 0;color:#bdc1c6;font-size:13px;word-break:break-all'>{safe_url}</p>"
            f"<a href='tanko-browser://retry-load?tabId={safe_tab}' "
            "style='display:inline-block;padding:8px 16px;border-radius:8px;background:#8ab4f8;"
            "color:#1f1f1f;text-decoration:none;font-weight:600'>Retry</a>"
            "</div></body></html>"
        )
        tab.view.setHtml(html, QUrl("tanko-browser://error/"))
        self._tab_mgr.update_title(tab_id, "Load failed")

    def _show_crash_page(self, tab_id: str):
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        safe_tab = self._escape_html(tab_id)
        tab.is_internal = True
        tab.crashed = True
        html = (
            "<html><body style='margin:0;background:#202124;color:#e8eaed;"
            "font-family:Segoe UI,system-ui,sans-serif;display:flex;align-items:center;"
            "justify-content:center;height:100vh'>"
            "<div style='max-width:640px;padding:28px 30px;background:#2b2c30;"
            "border:1px solid #3c4043;border-radius:12px'>"
            "<h1 style='margin:0 0 10px 0;font-size:28px;font-weight:500'>This tab crashed</h1>"
            "<p style='margin:0 0 16px 0;color:#9aa0a6;font-size:14px'>"
            "The renderer process terminated unexpectedly.</p>"
            f"<a href='tanko-browser://recover-tab?tabId={safe_tab}' "
            "style='display:inline-block;padding:8px 16px;border-radius:8px;background:#8ab4f8;"
            "color:#1f1f1f;text-decoration:none;font-weight:600'>Recover tab</a>"
            "</div></body></html>"
        )
        tab.view.setHtml(html, QUrl("tanko-browser://crashed/"))
        self._tab_mgr.update_title(tab_id, "Crashed tab")

    def _retry_failed_tab(self, params: str):
        parsed = self._parse_params(params)
        tab_id = parsed.get("tabId", [""])[0] or self._tab_mgr.active_id or ""
        tab = self._tab_mgr.get(tab_id)
        if not tab or not tab.view:
            return
        retry_url = self._failed_load_urls.get(tab_id) or tab.url
        if retry_url:
            tab.view.load(QUrl(retry_url))
        else:
            self._load_newtab(tab.view)

    def _recover_crashed_tab(self, params: str):
        parsed = self._parse_params(params)
        tab_id = parsed.get("tabId", [""])[0] or self._tab_mgr.active_id or ""
        tab = self._tab_mgr.get(tab_id)
        if not tab:
            return
        retry_url = self._failed_load_urls.get(tab_id)
        if not retry_url and tab.url.startswith(("http://", "https://", "file://", "about:")):
            retry_url = tab.url
        self.new_tab(retry_url or None, opener_id=tab.opener_id)
        self._close_tab(tab_id, record_closed=False)

    def _on_render_process_terminated(self, tab_id: str, status, exit_code: int):
        tab = self._tab_mgr.get(tab_id)
        if not tab:
            return
        tab.crashed = True
        tab.last_error = f"render_process_terminated:{int(exit_code)}"
        self._failed_load_urls[tab_id] = str(tab.url or "")
        self._show_crash_page(tab_id)
        self._schedule_session_save()

    @staticmethod
    def _feature_to_permission_name(feature):
        feature_map = {
            QWebEnginePage.Feature.Geolocation: "geolocation",
            QWebEnginePage.Feature.MediaAudioCapture: "media",
            QWebEnginePage.Feature.MediaVideoCapture: "media",
            QWebEnginePage.Feature.MediaAudioVideoCapture: "media",
            QWebEnginePage.Feature.Notifications: "notifications",
            QWebEnginePage.Feature.DesktopVideoCapture: "display-capture",
            QWebEnginePage.Feature.DesktopAudioVideoCapture: "display-capture",
            QWebEnginePage.Feature.ClipboardReadWrite: "clipboard-read",
            QWebEnginePage.Feature.ClipboardSanitizedWrite: "clipboard-sanitized-write",
        }
        return feature_map.get(feature, "")

    def _on_permission_requested(self, tab_id: str, page: QWebEnginePage, origin, feature):
        permission = self._feature_to_permission_name(feature)
        origin_str = origin.toString() if hasattr(origin, "toString") else str(origin)

        decision = "ask"
        if permission:
            decision = self._data_bridge.get_permission_decision(origin_str, permission)

        if decision == "allow":
            page.setFeaturePermission(
                origin,
                feature,
                QWebEnginePage.PermissionPolicy.PermissionGrantedByUser,
            )
            return
        if decision == "deny":
            page.setFeaturePermission(
                origin,
                feature,
                QWebEnginePage.PermissionPolicy.PermissionDeniedByUser,
            )
            return

        if tab_id != self._tab_mgr.active_id:
            page.setFeaturePermission(
                origin,
                feature,
                QWebEnginePage.PermissionPolicy.PermissionDeniedByUser,
            )
            return

        self._pending_permission = {
            "tabId": tab_id,
            "page": page,
            "origin": origin,
            "feature": feature,
            "permission": permission,
            "originStr": origin_str,
        }
        self._permission_bar.show_permission(origin, feature)

    def _show_back_history_menu(self):
        self._show_history_menu(back=True)

    def _show_forward_history_menu(self):
        self._show_history_menu(back=False)

    def _show_history_menu(self, *, back: bool):
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            return
        history = tab.view.page().history()
        current_idx = history.currentItemIndex()
        count = history.count()
        if current_idx < 0 or count <= 0:
            return

        if back:
            indices = list(range(current_idx - 1, max(-1, current_idx - 16), -1))
            anchor = self._nav_bar._back_btn
        else:
            indices = list(range(current_idx + 1, min(count, current_idx + 16)))
            anchor = self._nav_bar._fwd_btn
        if not indices:
            return

        menu = QMenu(self)
        menu.setStyleSheet(theme.CONTEXT_MENU_STYLE)
        for idx in indices:
            item = history.itemAt(idx)
            if not item or not item.isValid():
                continue
            title = item.title() or item.url().toString()
            action = menu.addAction(title)
            action.setToolTip(item.url().toString())
            action.triggered.connect(lambda _checked=False, i=idx: self._go_to_history_index(i))

        pos = anchor.mapToGlobal(anchor.rect().bottomLeft())
        menu.exec(pos)

    def _go_to_history_index(self, index: int):
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            return
        history = tab.view.page().history()
        item = history.itemAt(int(index))
        if item and item.isValid():
            history.goToItem(item)

    def _window_state_token(self):
        win = self.window()
        if win.isFullScreen():
            return "fullscreen"
        if win.isMaximized():
            return "maximized"
        return "normal"

    @staticmethod
    def _is_restore_blocked_url(url: str) -> bool:
        u = str(url or "").strip().lower()
        if not u:
            return True
        if "tanko-browser://error" in u or "tanko-browser://crashed" in u:
            return True
        if u.startswith("tanko-browser://error") or u.startswith("tanko-browser://crashed"):
            return True
        return False

    def _collect_session_state(self):
        tabs = []
        for tab in self._tab_mgr.tabs:
            url = str(tab.url or "").strip()
            if not url:
                continue
            if self._is_restore_blocked_url(url):
                continue
            if tab.is_internal and str(tab.last_error or "").strip():
                continue
            tabs.append({
                "id": tab.id,
                "url": url,
                "title": tab.title,
                "pinned": tab.pinned,
                "muted": tab.muted,
                "zoom": tab.zoom_factor,
                "internal": tab.is_internal,
            })
        return {
            "version": 2,
            "tabs": tabs,
            "activeTabId": str(self._tab_mgr.active_id or ""),
            "closedTabs": list(self._closed_tabs),
            "uiState": {
                "bookmarksBarVisible": bool(not self._bookmarks_bar.isHidden()),
                "windowState": self._window_state_token(),
            },
        }

    def _save_session_state_now(self):
        if self._suspend_session_save or self._restoring_session:
            return
        state = self._collect_session_state()
        self._data_bridge.save_session_state(state)

    def _schedule_session_save(self):
        if self._suspend_session_save or self._restoring_session:
            return
        self._session_save_timer.start()

    def _restore_closed_tabs(self, rows):
        self._closed_tabs = []
        if not isinstance(rows, list):
            self._tab_bar.set_has_closed_tabs(False)
            return
        for row in rows:
            normalized = self._normalize_closed_tab_entry(row)
            if normalized:
                self._closed_tabs.append(normalized)
        if len(self._closed_tabs) > 25:
            self._closed_tabs = self._closed_tabs[-25:]
        self._tab_bar.set_has_closed_tabs(bool(self._closed_tabs))

    def _restore_session_or_default(self):
        self._restoring_session = True
        try:
            session = self._data_bridge.load_session_state() or {}
            ui = session.get("uiState", {}) if isinstance(session, dict) else {}
            bookmarks_visible = bool(self._settings.get("bookmarksBarVisible"))
            if isinstance(ui, dict) and "bookmarksBarVisible" in ui:
                bookmarks_visible = bool(ui.get("bookmarksBarVisible"))
            self._bookmarks_bar.setVisible(bookmarks_visible)
            if bookmarks_visible:
                self._bookmarks_bar.refresh()

            self._restore_closed_tabs(session.get("closedTabs", []))
            if self._emergency_startup_mode:
                self.new_tab()
                return

            rows = session.get("tabs", []) if isinstance(session, dict) else []
            restored = []
            if isinstance(rows, list):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    row_url = str(row.get("url", "") or "").strip()
                    if self._is_restore_blocked_url(row_url):
                        continue
                    tab_id = self.new_tab(
                        row_url,
                        activate=False,
                        pinned=bool(row.get("pinned")),
                        muted=bool(row.get("muted")),
                        zoom=float(row.get("zoom", 1.0) or 1.0),
                        is_internal=bool(row.get("internal")),
                        title=str(row.get("title", "") or "New Tab"),
                    )
                    if tab_id:
                        restored.append(tab_id)

            if not restored:
                self.new_tab()
            else:
                active = str(session.get("activeTabId", "") or "")
                target = restored[0]
                if active:
                    if self._tab_mgr.get(active):
                        target = active
                    elif active.isdigit():
                        idx = int(active)
                        if 0 <= idx < len(restored):
                            target = restored[idx]
                    elif isinstance(rows, list):
                        for idx, row in enumerate(rows):
                            if idx >= len(restored):
                                continue
                            if isinstance(row, dict) and str(row.get("id", "") or "") == active:
                                target = restored[idx]
                                break
                self._tab_mgr.activate(target)
        finally:
            self._restoring_session = False
            self._on_tab_order_changed()
            self._schedule_session_save()

    # -----------------------------------------------------------------------
    # Torrents page
    # -----------------------------------------------------------------------

    def _on_magnet_detected(self, magnet_uri: str, source_tab_id: str = ""):
        """Handle magnet link click â€” show the add-torrent dialog."""
        from .torrent_add_dialog import TorrentAddDialog
        bridge = self._data_bridge._bridge if self._data_bridge else None
        sid = self._command_target_tab(source_tab_id)
        if sid:
            # Keep source-page load failures suppressed for the full dialog
            # lifecycle. Some sites trigger benign aborted loads while the
            # modal overlay is open/closing.
            self._hold_tab_load_error_suppression(sid, 180000)
        dlg = TorrentAddDialog(magnet_uri, bridge_root=bridge, parent=self)
        dlg.torrent_started.connect(self._on_torrent_added)
        dlg.exec()
        if sid:
            QTimer.singleShot(
                1200, lambda tid=sid: self._release_tab_load_error_suppression(tid)
            )

    def _on_magnet_detected_for_tab(self, tab_id: str, magnet_uri: str):
        self._on_magnet_detected(magnet_uri, source_tab_id=tab_id)

    def _on_torrent_added(self, torrent_id: str):
        """Called when a torrent is added via the dialog â€” switch to torrents tab."""
        # If already on torrents page, just refresh. Otherwise open it.
        tab = self._tab_mgr.active_tab
        url = tab.url if tab else ""
        if "torrents.html" in url:
            self._push_torrent_updates()
        else:
            self.open_torrents()

    def open_torrents(self):
        """Open the torrent search + manager page."""
        tab_id = self._open_internal_manager(
            self._TORRENTS_HTML, page_name="torrents.html", title="Torrents"
        )
        if tab_id:
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

    def _handle_torrent_search(self, params: str, source_tab_id: str = ""):
        """Handle torrent search via provider bridge with fallback chain support."""
        import json
        import threading
        import urllib.parse
        parsed = urllib.parse.parse_qs(params)
        query = str(parsed.get("q", [""])[0] or "").strip()
        if not query:
            return

        tab = self._tab_mgr.get(self._command_target_tab(source_tab_id))
        if not tab or not tab.view:
            return
        tab_id = tab.id

        def _to_int(name: str, default: int):
            raw = str(parsed.get(name, [str(default)])[0] or "").strip()
            try:
                return int(raw)
            except Exception:
                return int(default)

        payload = {
            "query": query,
            "provider": str(parsed.get("provider", [""])[0] or "").strip(),
            "indexer": str(parsed.get("indexer", [""])[0] or "").strip(),
            "source": str(parsed.get("indexer", [""])[0] or "").strip(),
            "category": str(parsed.get("category", ["all"])[0] or "all").strip(),
            "page": max(0, _to_int("page", 0)),
            "limit": max(1, min(100, _to_int("limit", 40))),
        }
        sites_param = str(parsed.get("sites", [""])[0] or "").strip()
        if sites_param:
            payload["sites"] = [s.strip() for s in sites_param.split(",") if s.strip()]

        bridge = self._data_bridge._bridge if self._data_bridge else None

        def _run_search():
            try:
                if bridge and hasattr(bridge, "torrentSearch"):
                    raw = bridge.torrentSearch.query(json.dumps(payload))
                    result = json.loads(raw) if isinstance(raw, str) else raw
                    if not isinstance(result, dict):
                        result = {}
                    items = result.get("items", [])
                    result["results"] = items if isinstance(items, list) else []
                    result_json = json.dumps(result)
                else:
                    from .torrent_scrapers import search_all
                    rows = search_all(query, sites=set(payload.get("sites", [])) or None, limit=60)
                    result_json = json.dumps({"ok": True, "results": rows, "items": rows})
            except Exception:
                result_json = json.dumps({"ok": False, "results": [], "items": [], "error": "Search failed"})

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

    def _inject_torrent_search_config(self, tab_id: str, result_json: str):
        tab = self._tab_mgr.get(tab_id)
        if tab and tab.view:
            tab.view.page().runJavaScript(
                f"if(typeof setTorrentSearchConfig==='function')setTorrentSearchConfig({result_json});"
            )

    def _inject_torrent_indexers(self, tab_id: str, result_json: str):
        tab = self._tab_mgr.get(tab_id)
        if tab and tab.view:
            tab.view.page().runJavaScript(
                f"if(typeof setTorrentIndexers==='function')setTorrentIndexers({result_json});"
            )

    def _handle_torrent_search_config_load(self, params: str, source_tab_id: str = ""):
        import json
        bridge = self._data_bridge._bridge if self._data_bridge else None
        tab = self._tab_mgr.get(self._command_target_tab(source_tab_id))
        if not tab or not tab.view:
            return
        tab_id = tab.id
        if not bridge or not hasattr(bridge, "torrentSearch"):
            self._inject_torrent_search_config(tab_id, json.dumps({"ok": False, "error": "Torrent search bridge unavailable"}))
            return
        try:
            raw = bridge.torrentSearch.getConfig()
            cfg = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            cfg = {"ok": False, "error": "Failed to load config"}
        self._inject_torrent_search_config(tab_id, json.dumps(cfg if isinstance(cfg, dict) else {}))

    def _handle_torrent_search_indexers(self, params: str, source_tab_id: str = ""):
        import json
        import urllib.parse
        parsed = urllib.parse.parse_qs(params)
        provider = str(parsed.get("provider", [""])[0] or "").strip()
        bridge = self._data_bridge._bridge if self._data_bridge else None
        tab = self._tab_mgr.get(self._command_target_tab(source_tab_id))
        if not tab or not tab.view:
            return
        tab_id = tab.id
        if not bridge or not hasattr(bridge, "torrentSearch"):
            self._inject_torrent_indexers(tab_id, json.dumps({"ok": False, "indexers": []}))
            return
        try:
            payload = {"provider": provider} if provider else {}
            raw = bridge.torrentSearch.indexers(json.dumps(payload))
            out = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            out = {"ok": False, "indexers": [], "provider": provider}
        self._inject_torrent_indexers(tab_id, json.dumps(out if isinstance(out, dict) else {}))

    def _handle_torrent_search_config_save(self, params: str, source_tab_id: str = ""):
        import json
        import urllib.parse
        parsed = urllib.parse.parse_qs(params)
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "torrentSearch"):
            return

        payload_obj = {}
        raw_payload = str(parsed.get("payload", [""])[0] or "").strip()
        if raw_payload:
            try:
                payload_obj = json.loads(raw_payload)
            except Exception:
                payload_obj = {}
        if not isinstance(payload_obj, dict):
            payload_obj = {}

        try:
            bridge.torrentSearch.saveSettings(json.dumps(payload_obj))
        except Exception:
            pass

        self._handle_torrent_search_config_load("", source_tab_id=source_tab_id)
        provider = str(payload_obj.get("provider", "") or "").strip()
        self._handle_torrent_search_indexers(
            "provider=" + urllib.parse.quote(provider),
            source_tab_id=source_tab_id,
        )

    def _handle_torrent_add(self, params: str, source_tab_id: str = ""):
        """Handle adding a magnet â€” show the add dialog."""
        import urllib.parse
        parsed = urllib.parse.parse_qs(params)
        magnet = parsed.get("magnet", [""])[0]
        if not magnet:
            return
        self._on_magnet_detected(magnet, source_tab_id=source_tab_id)

    def _handle_torrent_manage(self, params: str):
        """Open manage-files/save dialog for an existing torrent."""
        import json
        import urllib.parse
        from .torrent_add_dialog import TorrentAddDialog

        parsed = urllib.parse.parse_qs(params)
        torrent_id = str(parsed.get("id", [""])[0] or "").strip()
        if not torrent_id:
            return
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "webTorrent"):
            return

        target = None
        try:
            active_raw = bridge.webTorrent.getActive()
            active = json.loads(active_raw) if isinstance(active_raw, str) else active_raw
            for row in active.get("torrents", []):
                if isinstance(row, dict) and str(row.get("id", "") or "") == torrent_id:
                    target = row
                    break
            if target is None:
                hist_raw = bridge.webTorrent.getHistory()
                hist = json.loads(hist_raw) if isinstance(hist_raw, str) else hist_raw
                for row in hist.get("torrents", []):
                    if isinstance(row, dict) and str(row.get("id", "") or "") == torrent_id:
                        target = row
                        break
        except Exception:
            target = None

        if not isinstance(target, dict):
            return
        source = str(target.get("magnetUri", "") or "").strip()
        dlg = TorrentAddDialog(source, bridge_root=bridge, parent=self, manage_torrent=target)
        dlg.torrent_started.connect(self._on_torrent_added)
        dlg.exec()

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
        if not torrent_id:
            return
        bridge = self._data_bridge._bridge if self._data_bridge else None
        if not bridge or not hasattr(bridge, "webTorrent"):
            return
        try:
            indices = json.loads(indices_raw) if indices_raw else []
            if not isinstance(indices, list):
                indices = []
            payload = {
                "id": torrent_id,
                "selectedIndices": indices,
            }
            priorities_raw = parsed.get("priorities", [""])[0]
            if priorities_raw:
                try:
                    priorities = json.loads(priorities_raw)
                    if isinstance(priorities, dict):
                        payload["priorities"] = priorities
                except Exception:
                    pass
            dest = str(parsed.get("destinationRoot", [""])[0] or "").strip()
            if dest:
                payload["destinationRoot"] = dest
            if "sequential" in parsed:
                payload["sequential"] = parsed.get("sequential", ["false"])[0] == "true"
            bridge.webTorrent.selectFiles(json.dumps(payload))
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
    # Placeholder pages (Books, Comics â€” coming soon)
    # -----------------------------------------------------------------------

    def _open_placeholder(self, title: str, description: str):
        """Open a placeholder page for features not yet implemented."""
        tab = self._tab_mgr.active_tab
        if not tab or not tab.view:
            self.new_tab()
            tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.is_internal = True
            self._tab_mgr.update_title(tab.id, title)
            tab.view.setHtml(f"""
                <html><body style="background:#202124;color:#e8eaed;
                font-family:'Segoe UI',system-ui,sans-serif;display:flex;
                flex-direction:column;align-items:center;justify-content:center;
                height:100vh;text-align:center">
                <h1 style="font-size:36px;font-weight:300;margin-bottom:16px">{title}</h1>
                <p style="color:#9aa0a6;font-size:16px">{description}</p>
                </body></html>
            """, QUrl("tanko-browser://placeholder/"))

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

    def closeEvent(self, event):
        try:
            self._save_session_state_now()
        except Exception:
            pass
        super().closeEvent(event)

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
        self._settings["bookmarksBarVisible"] = bool(not self._bookmarks_bar.isHidden())
        self._save_settings()

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
        self._bookmarks_bar.refresh()
        self._schedule_session_save()

    # -----------------------------------------------------------------------
    # Zoom (Ctrl+Plus/Minus/0)
    # -----------------------------------------------------------------------

    def zoom_in(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.zoom_factor = min(5.0, tab.zoom_factor + 0.1)
            tab.view.setZoomFactor(tab.zoom_factor)
            self._schedule_session_save()

    def zoom_out(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.zoom_factor = max(0.25, tab.zoom_factor - 0.1)
            tab.view.setZoomFactor(tab.zoom_factor)
            self._schedule_session_save()

    def zoom_reset(self):
        tab = self._tab_mgr.active_tab
        if tab and tab.view:
            tab.zoom_factor = 1.0
            tab.view.setZoomFactor(1.0)
            self._schedule_session_save()

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
        devtools.setWindowTitle(f"DevTools â€” {tab.title}")
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
            self.new_tab(tab.url, opener_id=tab.id)

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
            self._schedule_session_save()

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
        if self._tab_mgr.reorder(source_id, target_id):
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
            self._schedule_session_save()

    def unpin_tab(self, tab_id: str):
        """Unpin a tab."""
        tab = self._tab_mgr.set_pinned(tab_id, False)
        if tab:
            self._tab_bar.set_pinned(tab_id, False)
            self._schedule_session_save()

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
        self._bookmarks_visible_before_fullscreen = self._bookmarks_bar.isVisible()
        self._downloads_visible_before_fullscreen = self._downloads_shelf.isVisible()
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
        if self._bookmarks_visible_before_fullscreen:
            self._bookmarks_bar.show()
        if self._downloads_visible_before_fullscreen:
            self._downloads_shelf.show()
        win = self.window()
        if win.isFullScreen():
            win.showNormal()

    # -----------------------------------------------------------------------
    # Permission prompts
    # -----------------------------------------------------------------------

    def _on_permission_decided(self, origin, feature, granted, remember):
        """Handle user's decision on a permission prompt."""
        pending = self._pending_permission
        self._pending_permission = None
        if not pending:
            return
        page = pending.get("page")
        if not page:
            return
        policy = (
            QWebEnginePage.PermissionPolicy.PermissionGrantedByUser
            if granted else
            QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
        )
        try:
            page.setFeaturePermission(origin, feature, policy)
        except Exception:
            pass
        permission = str(pending.get("permission", "") or "")
        origin_str = str(pending.get("originStr", "") or "")
        if remember and permission and origin_str:
            self._data_bridge.set_permission_decision(
                origin_str,
                permission,
                "allow" if granted else "deny",
            )

    # -----------------------------------------------------------------------
    # Additional shortcuts
    # -----------------------------------------------------------------------

    def open_downloads(self):
        """Open the persistent downloads manager page (Ctrl+J)."""
        self.open_downloads_manager()

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

