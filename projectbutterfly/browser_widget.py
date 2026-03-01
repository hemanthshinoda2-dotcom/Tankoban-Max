"""
projectbutterfly/browser_widget.py

Native Qt browser chrome for Tankoban Browser.

Replaces the HTML-overlay approach with:
  - QTabBar    for the tab strip
  - QStackedWidget for tab content (each tab is a proper child widget, no overlays)
  - QLineEdit  for the address bar
  - QToolButton for nav/utility controls

This eliminates the Chromium GPU HWND z-ordering conflict that caused
blank-white rendering when using QWebEngineView overlays on Windows.

Architecture:
  WebTabManagerBridge (bridge.py) continues to own the bridge slots called from JS
  and the QWebEnginePage lifecycle (signals, userscripts, permissions).
  BrowserWidget owns the visible UI: QTabBar, QStackedWidget, toolbar widgets.
  The two sides communicate via direct method calls and Qt signals.

Phase 1: browser chrome (tabs, address bar, nav buttons)
Phase 2: TorrentSearchTab  -- added in add_torrent_tab()
Phase 3: DownloadsPanel    -- added in add_downloads_panel()
"""

import os
import json

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTabBar,
    QStackedWidget, QLineEdit, QToolButton, QSizePolicy,
    QMenu, QLabel, QFrame, QScrollArea, QProgressBar,
    QPushButton, QComboBox, QTableWidget, QTableWidgetItem, QHeaderView,
    QApplication,
)
from PySide6.QtGui import QAction
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEngineSettings
from PySide6.QtCore import Qt, QUrl, QTimer, Signal, QPoint, QObject, QThread
from PySide6.QtGui import QKeySequence, QShortcut, QCursor


# ─────────────────────────────────────────────────────────────────────────────
# Stylesheet
# ─────────────────────────────────────────────────────────────────────────────

_SS = """
BrowserWidget {
    background: #0d1117;
}

QWidget#browserToolbar {
    background: #0d1117;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}

QToolButton#navBtn {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 16px;
    min-width: 30px;
    min-height: 30px;
    border-radius: 6px;
    padding: 2px;
}
QToolButton#navBtn:hover  { background: rgba(255,255,255,0.07); color: #e6edf3; }
QToolButton#navBtn:pressed { background: rgba(255,255,255,0.12); }
QToolButton#navBtn:disabled { color: rgba(139,148,158,0.3); }

QTabBar {
    background: transparent;
    border: none;
}
QTabBar::tab {
    background: rgba(255,255,255,0.04);
    color: #8b949e;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 6px;
    padding: 5px 28px 5px 10px;
    margin: 4px 2px;
    min-width: 80px;
    max-width: 200px;
    font-size: 12px;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}
QTabBar::tab:selected {
    background: rgba(255,255,255,0.12);
    color: #e6edf3;
    border-color: rgba(88,101,242,0.45);
}
QTabBar::tab:hover:!selected {
    background: rgba(255,255,255,0.08);
    color: #c9d1d9;
}
QTabBar::close-button {
    image: none;
    subcontrol-position: right;
    width: 14px;
    height: 14px;
}

QToolButton#newTabBtn {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 20px;
    min-width: 28px;
    min-height: 28px;
    border-radius: 6px;
    padding: 0;
}
QToolButton#newTabBtn:hover  { background: rgba(255,255,255,0.07); color: #e6edf3; }

QLineEdit#addressBar {
    background: #161b22;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    color: #e6edf3;
    font-size: 13px;
    padding: 5px 16px;
    selection-background-color: rgba(88,101,242,0.4);
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}
QLineEdit#addressBar:focus {
    border-color: rgba(88,101,242,0.8);
    background: #1a2030;
}

QToolButton#utilBtn {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 15px;
    min-width: 30px;
    min-height: 30px;
    border-radius: 6px;
    padding: 2px;
}
QToolButton#utilBtn:hover   { background: rgba(255,255,255,0.07); color: #e6edf3; }
QToolButton#utilBtn:checked { color: #f0b429; }

QStackedWidget#contentStack {
    background: #0a1018;
}

QMenu {
    background: #161b22;
    color: #e6edf3;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 4px;
    font-size: 13px;
}
QMenu::item { padding: 6px 20px; border-radius: 4px; }
QMenu::item:selected { background: rgba(88,101,242,0.3); }
QMenu::separator { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 8px; }
"""


# ─────────────────────────────────────────────────────────────────────────────
# BrowserWidget
# ─────────────────────────────────────────────────────────────────────────────

class BrowserWidget(QWidget):
    """
    Native Qt browser chrome.

    Tab lifecycle (Python side):
      1. WebTabManagerBridge.createTab() → _create_tab_internal() → add_tab_view()
      2. WebTabManagerBridge.switchTab()  → set_active_tab_id()
      3. WebTabManagerBridge.closeTab()   → remove_tab_view()
      4. WebTabManagerBridge.navigateTo() → navigate_tab() (if was home tab)

    User actions (BrowserWidget → bridge):
      userNavigated, userOpenNewTab, userCloseTab, userSwitchTab,
      userGoBack, userGoForward, userReload  signals → wired in setup()
    """

    # User actions emitted to WebTabManagerBridge
    userNavigated  = Signal(str, str)   # (tab_id, url)
    userOpenNewTab = Signal()
    userCloseTab   = Signal(str)        # tab_id
    userSwitchTab  = Signal(str)        # tab_id
    userGoBack     = Signal(str)        # tab_id
    userGoForward  = Signal(str)        # tab_id
    userReload     = Signal(str)        # tab_id

    def __init__(self, profile, parent=None):
        super().__init__(parent)
        self._profile = profile                  # QWebEngineProfile("webmode")
        self._tabs = {}                          # tab_id → dict
        self._tab_id_by_bar_idx = {}             # QTabBar index → tab_id
        self._active_tab_id = ""

        # Phase 2/3 bridge refs (set via set_bridges())
        self._torrent_search_bridge = None
        self._torrent_bridge = None
        self._sources_bridge = None
        self._history_bridge = None

        self._setup_ui()
        self._setup_shortcuts()

    # ── Properties ───────────────────────────────────────────────────────────

    @property
    def profile(self):
        return self._profile

    # ── Phase 2/3 bridge wiring ───────────────────────────────────────────────

    def set_bridges(self, torrent_search=None, torrent=None, sources=None, history=None):
        """Wire Phase 2/3 bridge references and create torrent/downloads panels."""
        self._torrent_search_bridge = torrent_search
        self._torrent_bridge = torrent
        self._sources_bridge = sources
        self._history_bridge = history

        # Phase 2: Torrent Search pinned tab
        if torrent_search or torrent:
            self._torrent_tab = TorrentSearchTab(
                torrent_search, torrent,
                open_new_tab_fn=self.userOpenNewTab.emit,
                navigate_fn=lambda url: self.userNavigated.emit(self._active_tab_id, url),
                parent=self,
            )
            stack_idx = self._content_stack.addWidget(self._torrent_tab)
            bar_idx   = self._tab_bar.addTab("⚡ Torrents")
            self._tab_bar.setTabToolTip(bar_idx, "Torrent Search")
            # Mark as non-closeable
            self._tab_bar.setTabButton(bar_idx, QTabBar.ButtonPosition.RightSide, None)
            self._torrent_tab_bar_idx   = bar_idx
            self._torrent_tab_stack_idx = stack_idx
            # Wire tab bar click for torrent tab
            self._tab_bar.currentChanged.connect(self._on_special_tab_check)
        else:
            self._torrent_tab = None

        # Phase 3: Downloads panel (overlay drawer, not a tab)
        if sources or torrent:
            self._downloads_panel = DownloadsPanel(sources, torrent, parent=self)
            self._downloads_panel.hide()
            self._downloads_btn.clicked.connect(self._toggle_downloads_panel)
        else:
            self._downloads_panel = None

    def _on_special_tab_check(self, bar_idx):
        """Handle clicks on special (non-closeable) pinned tabs."""
        if hasattr(self, "_torrent_tab_bar_idx") and bar_idx == self._torrent_tab_bar_idx:
            if hasattr(self, "_torrent_tab_stack_idx"):
                self._content_stack.setCurrentIndex(self._torrent_tab_stack_idx)

    def _toggle_downloads_panel(self):
        if self._downloads_panel:
            if self._downloads_panel.isVisible():
                self._downloads_panel.hide()
            else:
                # Position as right-side overlay above content
                self._position_downloads_panel()
                self._downloads_panel.show()
                self._downloads_panel.raise_()

    def _position_downloads_panel(self):
        if not self._downloads_panel:
            return
        # Place as floating panel at the right side of BrowserWidget
        w = 360
        h = self.height() - 44  # below toolbar
        x = self.width() - w
        y = 44
        self._downloads_panel.setGeometry(x, y, w, h)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self._downloads_panel and self._downloads_panel.isVisible():
            self._position_downloads_panel()

    # ── UI construction ───────────────────────────────────────────────────────

    def _setup_ui(self):
        self.setStyleSheet(_SS)

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── Toolbar ──
        toolbar = QWidget()
        toolbar.setObjectName("browserToolbar")
        toolbar.setFixedHeight(44)
        tl = QHBoxLayout(toolbar)
        tl.setContentsMargins(8, 4, 8, 4)
        tl.setSpacing(3)

        self._back_btn   = self._nav_btn("←", "Back  (Alt+Left)")
        self._fwd_btn    = self._nav_btn("→", "Forward  (Alt+Right)")
        self._reload_btn = self._nav_btn("⟳", "Reload  (F5)")
        tl.addWidget(self._back_btn)
        tl.addWidget(self._fwd_btn)
        tl.addWidget(self._reload_btn)
        tl.addSpacing(4)

        self._tab_bar = QTabBar()
        self._tab_bar.setExpanding(False)
        self._tab_bar.setMovable(True)
        self._tab_bar.setTabsClosable(True)
        self._tab_bar.setDrawBase(False)
        self._tab_bar.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        tl.addWidget(self._tab_bar, stretch=1)

        self._new_tab_btn = QToolButton()
        self._new_tab_btn.setObjectName("newTabBtn")
        self._new_tab_btn.setText("+")
        self._new_tab_btn.setToolTip("New tab  (Ctrl+T)")
        tl.addWidget(self._new_tab_btn)

        tl.addSpacing(6)

        self._address_bar = QLineEdit()
        self._address_bar.setObjectName("addressBar")
        self._address_bar.setPlaceholderText("Search or enter address")
        self._address_bar.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        tl.addWidget(self._address_bar, stretch=2)

        tl.addSpacing(4)

        self._bookmark_btn  = self._util_btn("★", "Bookmark")
        self._history_btn_w = self._util_btn("⏱", "History")
        self._downloads_btn = self._util_btn("↓", "Downloads")
        tl.addWidget(self._bookmark_btn)
        tl.addWidget(self._history_btn_w)
        tl.addWidget(self._downloads_btn)

        root.addWidget(toolbar)

        # ── Content stack ──
        self._content_stack = QStackedWidget()
        self._content_stack.setObjectName("contentStack")
        root.addWidget(self._content_stack, stretch=1)

        # ── Toolbar signal wiring ──
        self._back_btn.clicked.connect(self._on_back)
        self._fwd_btn.clicked.connect(self._on_fwd)
        self._reload_btn.clicked.connect(self._on_reload)
        self._new_tab_btn.clicked.connect(self._on_new_tab)
        self._address_bar.returnPressed.connect(self._on_address_entered)
        self._tab_bar.currentChanged.connect(self._on_tab_bar_changed)
        self._tab_bar.tabCloseRequested.connect(self._on_tab_close_requested)
        self._tab_bar.tabMoved.connect(self._on_tab_moved)

        # Disable nav buttons initially
        self._back_btn.setEnabled(False)
        self._fwd_btn.setEnabled(False)

    def _nav_btn(self, text, tip):
        b = QToolButton()
        b.setObjectName("navBtn")
        b.setText(text)
        b.setToolTip(tip)
        return b

    def _util_btn(self, text, tip):
        b = QToolButton()
        b.setObjectName("utilBtn")
        b.setText(text)
        b.setToolTip(tip)
        return b

    def _setup_shortcuts(self):
        def _mk(seq, fn):
            s = QShortcut(QKeySequence(seq), self)
            s.activated.connect(fn)

        _mk("Ctrl+T",      self._on_new_tab)
        _mk("Ctrl+W",      lambda: self._on_tab_close_requested(self._tab_bar.currentIndex()))
        _mk("Ctrl+L",      lambda: (self._address_bar.setFocus(), self._address_bar.selectAll()))
        _mk("Alt+Left",    self._on_back)
        _mk("Alt+Right",   self._on_fwd)
        _mk("F5",          self._on_reload)
        _mk("Ctrl+R",      self._on_reload)
        _mk("Escape",      self._on_escape)

    # ── Called by WebTabManagerBridge ─────────────────────────────────────────

    def add_tab_view(self, tab_id, view, title="New Tab", home=False):
        """
        Register a QWebEngineView as a tab in the UI.
        Called by WebTabManagerBridge._create_tab_internal().

        The view is re-parented into the content stack — no overlay, no setGeometry.
        """
        view.setParent(self)
        stack_idx = self._content_stack.addWidget(view)
        bar_idx   = self._tab_bar.addTab(title)
        # Home tab has no close button — it's permanent
        if home:
            self._tab_bar.setTabButton(bar_idx, QTabBar.ButtonPosition.RightSide, None)
        self._tab_id_by_bar_idx[bar_idx] = tab_id
        self._tabs[tab_id] = {
            "view":      view,
            "stack_idx": stack_idx,
            "bar_idx":   bar_idx,
            "home":      home,
            "title":     title,
            "url":       "",
            "can_back":  False,
            "can_fwd":   False,
        }

    def remove_tab_view(self, tab_id):
        """
        Remove a tab's view from the UI.
        Called by WebTabManagerBridge.closeTab().
        """
        tab = self._tabs.pop(tab_id, None)
        if not tab:
            return
        bar_idx = tab.get("bar_idx", -1)
        view    = tab.get("view")

        # Remove from tab bar (block signals to prevent recursive switchTab)
        self._tab_bar.blockSignals(True)
        if 0 <= bar_idx < self._tab_bar.count():
            self._tab_bar.removeTab(bar_idx)
        self._tab_bar.blockSignals(False)

        # Remove from content stack and destroy view
        if view:
            self._content_stack.removeWidget(view)
            view.deleteLater()

        # Rebuild index maps
        self._rebuild_maps()

    def set_active_tab_id(self, tab_id):
        """
        Switch the visible content and QTabBar selection.
        Called by WebTabManagerBridge.switchTab().
        """
        tab = self._tabs.get(tab_id)
        if not tab:
            return
        self._active_tab_id = tab_id

        # Switch QTabBar selection (block to avoid re-emit)
        self._tab_bar.blockSignals(True)
        self._tab_bar.setCurrentIndex(tab["bar_idx"])
        self._tab_bar.blockSignals(False)

        # Switch content
        view = tab.get("view")
        if view:
            self._content_stack.setCurrentWidget(view)

        # Address bar
        if tab.get("home"):
            self._address_bar.clear()
            self._address_bar.setPlaceholderText("Search or enter address")
        else:
            self._address_bar.setText(tab.get("url", ""))

        self._sync_nav_buttons(tab_id)

    def navigate_tab(self, tab_id, url):
        """
        Called when a home tab navigates to a real URL (becomes a URL tab).
        Updates address bar + switches content to this tab's view.
        """
        tab = self._tabs.get(tab_id)
        if not tab:
            return
        tab["home"] = False
        tab["url"]  = url
        if tab_id == self._active_tab_id:
            view = tab.get("view")
            if view:
                self._content_stack.setCurrentWidget(view)
            self._address_bar.setText(url)

    def update_tab(self, tab_id, **fields):
        """
        Update tab metadata from page signals (url, title, loading, canGoBack, canGoForward).
        Called by WebTabManagerBridge._emit_tab_update().
        """
        tab = self._tabs.get(tab_id)
        if not tab:
            return

        if "url" in fields:
            u = fields["url"]
            tab["url"] = u
            if tab_id == self._active_tab_id and not tab.get("home"):
                self._address_bar.setText(u)

        if "title" in fields and fields["title"]:
            t = fields["title"]
            tab["title"] = t
            bar_idx = tab.get("bar_idx", -1)
            if 0 <= bar_idx < self._tab_bar.count():
                self._tab_bar.setTabText(bar_idx, t[:28])

        if "canGoBack" in fields:
            tab["can_back"] = bool(fields["canGoBack"])
        if "canGoForward" in fields:
            tab["can_fwd"] = bool(fields["canGoForward"])

        if tab_id == self._active_tab_id:
            self._sync_nav_buttons(tab_id)

    def show_context_menu(self, tab_id, req, screen_pos):
        """
        Show a native Qt context menu for a browser tab.
        Called by the bridge instead of emitting to JS.

        req is a QWebEngineContextMenuRequest or None.
        screen_pos is a QPoint in screen coordinates.
        """
        menu = QMenu(self)

        tab  = self._tabs.get(tab_id, {})
        page = tab.get("view").page() if tab.get("view") else None

        # Navigation items
        act_back    = menu.addAction("Back")
        act_forward = menu.addAction("Forward")
        act_reload  = menu.addAction("Reload")
        act_back.setEnabled(tab.get("can_back", False))
        act_forward.setEnabled(tab.get("can_fwd", False))
        menu.addSeparator()

        # Link items
        link_url = ""
        img_url  = ""
        sel_text = ""
        if req:
            try:
                lu = req.linkUrl()
                link_url = lu.toString() if lu and lu.isValid() else ""
            except Exception:
                pass
            try:
                mu = req.mediaUrl()
                img_url = mu.toString() if mu and mu.isValid() else ""
            except Exception:
                pass
            try:
                sel_text = req.selectedText() or ""
            except Exception:
                pass

        if link_url:
            act_open_tab = menu.addAction("Open link in new tab")
            act_copy_link = menu.addAction("Copy link address")
            menu.addSeparator()
        else:
            act_open_tab  = None
            act_copy_link = None

        if img_url:
            act_save_img  = menu.addAction("Save image as…")
            act_copy_img  = menu.addAction("Copy image address")
            menu.addSeparator()
        else:
            act_save_img = None
            act_copy_img = None

        if sel_text:
            act_copy_sel = menu.addAction("Copy")
            act_search   = menu.addAction(f'Search for "{sel_text[:40]}"')
            menu.addSeparator()
        else:
            act_copy_sel = None
            act_search   = None

        act_save_page = menu.addAction("Save page as…")
        act_view_src  = menu.addAction("View page source")
        menu.addSeparator()
        act_inspect = menu.addAction("Inspect (DevTools)")

        chosen = menu.exec(screen_pos)
        if not chosen:
            return

        if chosen == act_back    and page: page.triggerAction(page.WebAction.Back)
        elif chosen == act_forward and page: page.triggerAction(page.WebAction.Forward)
        elif chosen == act_reload  and page: page.triggerAction(page.WebAction.Reload)
        elif chosen == act_open_tab and link_url:
            self.userOpenNewTab.emit()
            # The new tab needs to navigate to link_url — done via JS signal chain
            QTimer.singleShot(300, lambda: self.userNavigated.emit(self._find_latest_tab_id(), link_url))
        elif chosen == act_copy_link and link_url:
            QApplication.clipboard().setText(link_url)
        elif chosen == act_copy_img and img_url:
            QApplication.clipboard().setText(img_url)
        elif chosen == act_copy_sel and sel_text:
            QApplication.clipboard().setText(sel_text)
        elif chosen == act_search and sel_text:
            q = "https://www.google.com/search?q=" + sel_text.replace(" ", "+")
            self.userNavigated.emit(tab_id, q)
        elif chosen == act_save_page and page:
            page.triggerAction(page.WebAction.SavePage)
        elif chosen == act_view_src and page:
            self.userNavigated.emit(tab_id, "view-source:" + (tab.get("url") or ""))
        elif chosen == act_inspect and page:
            page.triggerAction(page.WebAction.InspectElement)

    # ── Toolbar user action handlers ─────────────────────────────────────────

    def _on_back(self):
        if self._active_tab_id:
            self.userGoBack.emit(self._active_tab_id)

    def _on_fwd(self):
        if self._active_tab_id:
            self.userGoForward.emit(self._active_tab_id)

    def _on_reload(self):
        if self._active_tab_id:
            self.userReload.emit(self._active_tab_id)

    def _on_new_tab(self):
        self.userOpenNewTab.emit()

    def _on_escape(self):
        self._address_bar.clearFocus()

    def _on_address_entered(self):
        raw = self._address_bar.text().strip()
        if not raw:
            return
        url = _normalize_url(raw)
        if self._active_tab_id:
            self.userNavigated.emit(self._active_tab_id, url)
        else:
            self.userOpenNewTab.emit()
            # bridge will create a tab and JS will call navigateTo

    def _on_tab_bar_changed(self, bar_idx):
        tab_id = self._tab_id_by_bar_idx.get(bar_idx)
        if tab_id and tab_id != self._active_tab_id:
            self.userSwitchTab.emit(tab_id)

    def _on_tab_close_requested(self, bar_idx):
        tab_id = self._tab_id_by_bar_idx.get(bar_idx)
        if tab_id:
            self.userCloseTab.emit(tab_id)

    def _on_tab_moved(self, from_idx, to_idx):
        self._rebuild_maps()

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _rebuild_maps(self):
        """Rebuild bar_idx maps and stack_idx after structural changes."""
        self._tab_id_by_bar_idx = {}
        for tid, t in self._tabs.items():
            # Find bar index by matching current text (fragile) or by scanning
            pass
        # Safer: rebuild by scanning all tabs against QTabBar text is unreliable.
        # Instead maintain a list and update on add/remove.
        # After removeTab, bar indices of later tabs shift down by 1.
        # Rebuild from scratch using the remaining tabs' bar positions.
        remaining = sorted(
            [(t["bar_idx"], tid) for tid, t in self._tabs.items() if t.get("bar_idx", -1) >= 0]
        )
        # QTabBar removes the tab at bar_idx and shifts subsequent indices
        # After rebuild we need to re-query actual indices.
        # Use a position-scan approach: iterate QTabBar count and match by title.
        # Actually the cleanest: store bar indices keyed by insertion order, then
        # recalculate after each remove.
        # We update _tab_id_by_bar_idx by iterating the sorted remaining list
        # and reassigning consecutive indices from 0:
        for new_idx, (_, tid) in enumerate(remaining):
            self._tabs[tid]["bar_idx"] = new_idx
            self._tab_id_by_bar_idx[new_idx] = tid

        # Update stack_idx
        for tid, t in self._tabs.items():
            view = t.get("view")
            if view:
                t["stack_idx"] = self._content_stack.indexOf(view)

    def _sync_nav_buttons(self, tab_id):
        tab = self._tabs.get(tab_id)
        if not tab:
            self._back_btn.setEnabled(False)
            self._fwd_btn.setEnabled(False)
            return
        # Use cached values from tabUpdated signals
        self._back_btn.setEnabled(tab.get("can_back", False))
        self._fwd_btn.setEnabled(tab.get("can_fwd", False))

    def _find_latest_tab_id(self):
        """Return the tab_id with the highest bar index (most recently opened)."""
        if not self._tab_id_by_bar_idx:
            return self._active_tab_id
        max_idx = max(self._tab_id_by_bar_idx)
        return self._tab_id_by_bar_idx.get(max_idx, self._active_tab_id)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def shutdown(self):
        """Destroy all views. Called from app.py on close."""
        for t in list(self._tabs.values()):
            v = t.get("view")
            if v:
                try:
                    v.deleteLater()
                except Exception:
                    pass
        self._tabs.clear()
        self._tab_id_by_bar_idx.clear()


# ─────────────────────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_url(text):
    """Turn user input into a navigable URL."""
    t = text.strip()
    if not t:
        return ""
    if t.startswith(("http://", "https://", "file://", "view-source:")):
        return t
    # Looks like a domain?
    if "." in t and " " not in t and not t.startswith("/"):
        return "https://" + t
    # Treat as search
    return "https://www.google.com/search?q=" + t.replace(" ", "+")


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — TorrentSearchTab
# ─────────────────────────────────────────────────────────────────────────────

_TORRENT_TAB_SS = """
TorrentSearchTab {
    background: #0d1117;
    color: #e6edf3;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}
QLineEdit#torrentQuery {
    background: #161b22;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: #e6edf3;
    font-size: 14px;
    padding: 8px 14px;
}
QLineEdit#torrentQuery:focus { border-color: rgba(88,101,242,0.8); }
QComboBox#torrentCategory {
    background: #161b22;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: #8b949e;
    font-size: 13px;
    padding: 6px 12px;
    min-width: 120px;
}
QComboBox#torrentCategory::drop-down { border: none; }
QComboBox QAbstractItemView { background: #161b22; color: #e6edf3; selection-background-color: rgba(88,101,242,0.3); }
QPushButton#searchBtn {
    background: #5865f2;
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 20px;
}
QPushButton#searchBtn:hover  { background: #6b78f5; }
QPushButton#searchBtn:pressed { background: #4752c4; }
QTableWidget {
    background: #0d1117;
    color: #e6edf3;
    gridline-color: rgba(255,255,255,0.06);
    border: none;
    font-size: 12px;
    selection-background-color: rgba(88,101,242,0.2);
}
QTableWidget::item { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
QTableWidget::item:selected { background: rgba(88,101,242,0.25); }
QHeaderView::section {
    background: #161b22;
    color: #8b949e;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 6px 8px;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.08);
}
QLabel#statusLabel { color: #8b949e; font-size: 12px; }
"""


class _TorrentSearchWorker(QObject):
    """Runs the torrent search in a thread to avoid blocking the UI."""
    finished = Signal(str)   # JSON result

    def __init__(self, bridge, payload_json):
        super().__init__()
        self._bridge = bridge
        self._payload = payload_json

    def run(self):
        try:
            result = self._bridge.query(self._payload)
        except Exception as e:
            result = json.dumps({"ok": False, "items": [], "error": str(e)})
        self.finished.emit(result)


class TorrentSearchTab(QWidget):
    """
    Phase 2 — Torrent Search Engine tab.

    Calls TorrentSearchBridge.query() in a background thread,
    displays results in a QTableWidget.
    Double-click → start magnet via WebTorrentBridge.
    Right-click → open source URL as a new browser tab.
    """

    def __init__(self, torrent_search_bridge, torrent_bridge,
                 open_new_tab_fn, navigate_fn, parent=None):
        super().__init__(parent)
        self._search_bridge = torrent_search_bridge
        self._torrent_bridge = torrent_bridge
        self._open_new_tab  = open_new_tab_fn   # callable → emit userOpenNewTab
        self._navigate      = navigate_fn        # callable(url)
        self._results       = []                 # current result dicts
        self._thread        = None
        self._worker        = None
        self.setStyleSheet(_TORRENT_TAB_SS)
        self._setup_ui()

    def _setup_ui(self):
        from PySide6.QtWidgets import QPushButton, QTableWidget, QTableWidgetItem, QComboBox, QHeaderView
        from PySide6.QtCore import QThread

        root = QVBoxLayout(self)
        root.setContentsMargins(16, 16, 16, 16)
        root.setSpacing(12)

        # Search bar row
        search_row = QHBoxLayout()
        search_row.setSpacing(8)

        self._query_input = QLineEdit()
        self._query_input.setObjectName("torrentQuery")
        self._query_input.setPlaceholderText("Search torrents…")
        self._query_input.returnPressed.connect(self._do_search)

        self._category = QComboBox()
        self._category.setObjectName("torrentCategory")
        self._category.addItems(["All", "Comics", "Books", "TV / Movies", "Anime"])
        self._category.setCurrentIndex(0)

        self._search_btn = QPushButton("Search")
        self._search_btn.setObjectName("searchBtn")
        self._search_btn.clicked.connect(self._do_search)

        search_row.addWidget(self._query_input, stretch=1)
        search_row.addWidget(self._category)
        search_row.addWidget(self._search_btn)
        root.addLayout(search_row)

        # Status label
        self._status = QLabel("Enter a search term above.")
        self._status.setObjectName("statusLabel")
        root.addWidget(self._status)

        # Results table
        self._table = QTableWidget()
        self._table.setColumnCount(5)
        self._table.setHorizontalHeaderLabels(["Name", "Size", "Seeds", "Leechers", "Source"])
        self._table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self._table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self._table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self._table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self._table.setAlternatingRowColors(False)
        self._table.verticalHeader().setVisible(False)
        self._table.doubleClicked.connect(self._on_double_click)
        self._table.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._table.customContextMenuRequested.connect(self._on_context_menu)
        root.addWidget(self._table, stretch=1)

    def _category_key(self):
        mapping = {0: "all", 1: "comics", 2: "books", 3: "tv", 4: "anime"}
        return mapping.get(self._category.currentIndex(), "all")

    def _do_search(self):
        from PySide6.QtCore import QThread
        if not self._search_bridge:
            self._status.setText("Torrent search is not configured.")
            return
        q = self._query_input.text().strip()
        if not q:
            return
        self._status.setText("Searching…")
        self._search_btn.setEnabled(False)
        self._table.setRowCount(0)
        self._results = []

        payload = json.dumps({"query": q, "category": self._category_key()})

        # Run in background thread
        self._thread = QThread(self)
        self._worker = _TorrentSearchWorker(self._search_bridge, payload)
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.finished.connect(self._on_search_done)
        self._worker.finished.connect(self._thread.quit)
        self._thread.finished.connect(self._thread.deleteLater)
        self._thread.start()

    def _on_search_done(self, result_json):
        self._search_btn.setEnabled(True)
        try:
            data = json.loads(result_json)
        except Exception:
            self._status.setText("Search failed — invalid response.")
            return
        if not data.get("ok"):
            self._status.setText(f"Search failed: {data.get('error', 'Unknown error')}")
            return
        items = data.get("items", [])
        self._results = items
        self._status.setText(f"{len(items)} result(s)")
        self._table.setRowCount(len(items))
        for row, item in enumerate(items):
            self._table.setItem(row, 0, self._cell(item.get("title", "—")))
            self._table.setItem(row, 1, self._cell(_fmt_size(item.get("size", 0))))
            self._table.setItem(row, 2, self._cell(str(item.get("seeders", "—"))))
            self._table.setItem(row, 3, self._cell(str(item.get("leechers", "—"))))
            self._table.setItem(row, 4, self._cell(item.get("source", "—")))

    def _cell(self, text):
        from PySide6.QtWidgets import QTableWidgetItem
        c = QTableWidgetItem(str(text))
        c.setFlags(c.flags() & ~Qt.ItemFlag.ItemIsEditable)
        return c

    def _on_double_click(self, index):
        row = index.row()
        if row < 0 or row >= len(self._results):
            return
        item = self._results[row]
        magnet = item.get("magnetUri") or item.get("magnet") or ""
        if magnet and self._torrent_bridge:
            try:
                self._torrent_bridge.startMagnet(json.dumps({"magnet": magnet}))
            except Exception:
                pass
        elif item.get("link") or item.get("url"):
            url = item.get("link") or item.get("url")
            self._navigate(url)

    def _on_context_menu(self, pos):
        row = self._table.rowAt(pos.y())
        if row < 0 or row >= len(self._results):
            return
        item = self._results[row]
        magnet = item.get("magnetUri") or item.get("magnet") or ""
        link   = item.get("link") or item.get("url") or ""

        menu = QMenu(self)
        if magnet:
            act_dl = menu.addAction("⬇ Start download (magnet)")
        else:
            act_dl = None
        if link:
            act_open = menu.addAction("🌐 Open source page")
        else:
            act_open = None
        act_copy_name = menu.addAction("Copy name")
        if magnet:
            act_copy_mag  = menu.addAction("Copy magnet link")
        else:
            act_copy_mag = None

        chosen = menu.exec(self._table.viewport().mapToGlobal(pos))
        if not chosen:
            return
        if chosen == act_dl and magnet and self._torrent_bridge:
            try:
                self._torrent_bridge.startMagnet(json.dumps({"magnet": magnet}))
            except Exception:
                pass
        elif chosen == act_open and link:
            self._navigate(link)
        elif chosen == act_copy_name:
            QApplication.clipboard().setText(item.get("title", ""))
        elif chosen == act_copy_mag and magnet:
            QApplication.clipboard().setText(magnet)


def _fmt_size(b):
    """Format bytes as human-readable size string."""
    try:
        b = int(b)
    except (TypeError, ValueError):
        return "—"
    if b <= 0:
        return "—"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} PB"


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — DownloadsPanel
# ─────────────────────────────────────────────────────────────────────────────

_DL_PANEL_SS = """
DownloadsPanel {
    background: #161b22;
    border-left: 1px solid rgba(255,255,255,0.08);
}
QLabel#panelTitle {
    color: #e6edf3;
    font-size: 14px;
    font-weight: 700;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}
QToolButton#closeBtn {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 16px;
}
QToolButton#closeBtn:hover { color: #e6edf3; }
QLabel#sectionLabel {
    color: #8b949e;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
}
QFrame.dlItem {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    padding: 6px;
}
QLabel.dlName { color: #c9d1d9; font-size: 12px; }
QLabel.dlInfo { color: #8b949e; font-size: 11px; }
QProgressBar {
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    height: 4px;
    text-align: left;
}
QProgressBar::chunk { background: #5865f2; border-radius: 3px; }
QToolButton.dlCancel {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
}
QToolButton.dlCancel:hover { background: rgba(255,0,0,0.15); color: #f85149; }
QScrollArea { border: none; background: transparent; }
"""


class DownloadsPanel(QWidget):
    """
    Phase 3 — Downloads & Torrents side panel.

    Listens to WebSourcesBridge and WebTorrentBridge signals to show:
      • Active direct downloads (with progress bars)
      • Active torrents (with progress bars + pause/resume)
      • Completed items
    """

    def __init__(self, sources_bridge, torrent_bridge, parent=None):
        super().__init__(parent)
        self._sources = sources_bridge
        self._torrents = torrent_bridge
        self._dl_widgets = {}       # download_id → {frame, progress, info_label}
        self._torrent_widgets = {}  # torrent_id  → {frame, progress, info_label}
        self.setStyleSheet(_DL_PANEL_SS)
        self._setup_ui()
        self._wire_signals()

    def _setup_ui(self):
        from PySide6.QtWidgets import QScrollArea

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Header
        header = QWidget()
        header.setFixedHeight(44)
        hl = QHBoxLayout(header)
        hl.setContentsMargins(12, 0, 8, 0)
        title = QLabel("Downloads")
        title.setObjectName("panelTitle")
        close_btn = QToolButton()
        close_btn.setObjectName("closeBtn")
        close_btn.setText("×")
        close_btn.clicked.connect(self.hide)
        hl.addWidget(title)
        hl.addStretch()
        hl.addWidget(close_btn)
        root.addWidget(header)

        # Scrollable content
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        content = QWidget()
        self._content_layout = QVBoxLayout(content)
        self._content_layout.setContentsMargins(8, 8, 8, 8)
        self._content_layout.setSpacing(6)

        # Section: Downloads
        dl_label = QLabel("⬇  Direct Downloads")
        dl_label.setObjectName("sectionLabel")
        self._content_layout.addWidget(dl_label)

        self._dl_container = QWidget()
        self._dl_layout = QVBoxLayout(self._dl_container)
        self._dl_layout.setContentsMargins(0, 0, 0, 0)
        self._dl_layout.setSpacing(4)
        self._dl_placeholder = QLabel("No active downloads")
        self._dl_placeholder.setObjectName("sectionLabel")
        self._dl_layout.addWidget(self._dl_placeholder)
        self._content_layout.addWidget(self._dl_container)

        self._content_layout.addSpacing(8)

        # Section: Torrents
        tor_label = QLabel("🧲  Torrents")
        tor_label.setObjectName("sectionLabel")
        self._content_layout.addWidget(tor_label)

        self._tor_container = QWidget()
        self._tor_layout = QVBoxLayout(self._tor_container)
        self._tor_layout.setContentsMargins(0, 0, 0, 0)
        self._tor_layout.setSpacing(4)
        self._tor_placeholder = QLabel("No active torrents")
        self._tor_placeholder.setObjectName("sectionLabel")
        self._tor_layout.addWidget(self._tor_placeholder)
        self._content_layout.addWidget(self._tor_container)

        self._content_layout.addStretch()
        scroll.setWidget(content)
        root.addWidget(scroll, stretch=1)

    def _wire_signals(self):
        if self._sources:
            try:
                self._sources.downloadStarted.connect(self._on_dl_started)
                self._sources.downloadProgress.connect(self._on_dl_progress)
                self._sources.downloadCompleted.connect(self._on_dl_completed)
            except Exception:
                pass
        if self._torrents:
            try:
                self._torrents.torrentProgress.connect(self._on_torrent_progress)
                self._torrents.torrentsUpdated.connect(self._on_torrents_updated)
                self._torrents.torrentCompleted.connect(self._on_torrent_completed)
            except Exception:
                pass

    # ── Download slots ────────────────────────────────────────────────────────

    def _on_dl_started(self, payload_json):
        try:
            d = json.loads(payload_json)
        except Exception:
            return
        did = str(d.get("id") or d.get("downloadId") or "")
        if not did or did in self._dl_widgets:
            return
        name = d.get("filename") or d.get("name") or "Download"
        frame, progress, info = self._make_dl_item(name, "Starting…")
        self._dl_widgets[did] = {"frame": frame, "progress": progress, "info": info, "data": d}
        self._dl_placeholder.hide()
        self._dl_layout.addWidget(frame)

    def _on_dl_progress(self, payload_json):
        try:
            d = json.loads(payload_json)
        except Exception:
            return
        did = str(d.get("id") or d.get("downloadId") or "")
        w = self._dl_widgets.get(did)
        if not w:
            return
        received = int(d.get("received") or d.get("receivedBytes") or 0)
        total    = int(d.get("totalBytes") or 0)
        speed    = int(d.get("speed") or 0)
        pct = int(received * 100 / total) if total > 0 else 0
        w["progress"].setValue(pct)
        w["info"].setText(f"{_fmt_size(received)} / {_fmt_size(total)}  •  {_fmt_size(speed)}/s")

    def _on_dl_completed(self, payload_json):
        try:
            d = json.loads(payload_json)
        except Exception:
            return
        did = str(d.get("id") or d.get("downloadId") or "")
        w = self._dl_widgets.pop(did, None)
        if not w:
            return
        w["frame"].deleteLater()
        if not self._dl_widgets:
            self._dl_placeholder.show()

    # ── Torrent slots ─────────────────────────────────────────────────────────

    def _on_torrent_progress(self, payload_json):
        try:
            d = json.loads(payload_json)
        except Exception:
            return
        tid = str(d.get("id") or d.get("infoHash") or "")
        if not tid:
            return
        w = self._torrent_widgets.get(tid)
        if not w:
            name = d.get("name") or "Torrent"
            frame, progress, info = self._make_dl_item(name, "")
            self._torrent_widgets[tid] = {"frame": frame, "progress": progress, "info": info}
            self._tor_placeholder.hide()
            self._tor_layout.addWidget(frame)
            w = self._torrent_widgets[tid]
        pct   = int(float(d.get("progress") or 0) * 100)
        speed = int(d.get("downloadSpeed") or 0)
        seeds = d.get("numPeers") or d.get("seeds") or 0
        w["progress"].setValue(pct)
        w["info"].setText(f"{pct}%  •  {_fmt_size(speed)}/s  •  Seeds: {seeds}")

    def _on_torrents_updated(self, payload_json):
        # Handled via individual torrentProgress signals
        pass

    def _on_torrent_completed(self, payload_json):
        try:
            d = json.loads(payload_json)
        except Exception:
            return
        tid = str(d.get("id") or d.get("infoHash") or "")
        w = self._torrent_widgets.pop(tid, None)
        if not w:
            return
        w["frame"].deleteLater()
        if not self._torrent_widgets:
            self._tor_placeholder.show()

    # ── Widget factory ────────────────────────────────────────────────────────

    def _make_dl_item(self, name, info_text):
        from PySide6.QtWidgets import QProgressBar
        frame = QFrame()
        fl = QVBoxLayout(frame)
        fl.setContentsMargins(8, 6, 8, 6)
        fl.setSpacing(4)

        name_label = QLabel(name[:60] + ("…" if len(name) > 60 else ""))
        progress   = QProgressBar()
        progress.setFixedHeight(4)
        progress.setRange(0, 100)
        progress.setValue(0)
        progress.setTextVisible(False)
        info_label = QLabel(info_text)
        info_label.setStyleSheet("color: #8b949e; font-size: 11px;")

        fl.addWidget(name_label)
        fl.addWidget(progress)
        fl.addWidget(info_label)
        return frame, progress, info_label
