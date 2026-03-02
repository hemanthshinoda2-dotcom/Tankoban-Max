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
from PySide6.QtGui import QKeySequence, QShortcut, QClipboard
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QStackedWidget, QApplication,
)
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
from .browser_page import ChromePage, inject_antibot_script
from .find_bar import FindBar
from .bookmarks_bar import BookmarksBar
from .downloads_shelf import DownloadsShelf
from .data_bridge import DataBridge
from .context_menu import build_context_menu
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

        # Inject anti-bot script into the profile
        inject_antibot_script(self._profile)

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

        # Viewport — one QWebEngineView per tab, stacked
        self._viewport = QStackedWidget()
        self._viewport.setStyleSheet(f"background: {theme.BG_VIEWPORT};")
        layout.addWidget(self._viewport, 1)

        # Downloads shelf (hidden, shows when download starts)
        self._downloads_shelf = DownloadsShelf()
        layout.addWidget(self._downloads_shelf)

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

    def _go_to_library(self):
        """Navigate back to the main Tankoban library."""
        if self._on_back:
            self._on_back()

    def _wire_find_bar(self):
        self._find_bar.closed.connect(self._on_find_closed)

    def _wire_downloads(self):
        self._profile.downloadRequested.connect(self._on_download_requested)

    def _on_download_requested(self, download):
        """Handle a new download from the web engine."""
        # Accept with default path (user's Downloads folder)
        download.accept()
        self._downloads_shelf.add_download(download)

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

        # Update nav bar
        self._nav_bar.set_url(tab.url)
        self._nav_bar.set_loading(tab.loading)
        self._nav_bar.set_nav_state(tab.can_go_back, tab.can_go_forward)

        # Update find bar page reference
        self._find_bar.set_page(tab.view.page())

    def _on_tab_loading_changed(self, tab_id: str, loading: bool, progress: int):
        self._tab_bar.update_loading(tab_id, loading)
        if tab_id == self._tab_mgr.active_id:
            self._nav_bar.set_loading(loading)

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

        # Context menu
        view.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        view.customContextMenuRequested.connect(
            lambda pos, v=view, p=page: self._show_context_menu(v, p, pos)
        )

    def _on_url_changed(self, tab_id: str, url: QUrl):
        url_str = url.toString()
        self._tab_mgr.update_url(tab_id, url_str)

        # Update nav bar if this is the active tab
        if tab_id == self._tab_mgr.active_id:
            self._nav_bar.set_url(url_str)

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
