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
from pathlib import Path

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTabBar,
    QStackedWidget, QLineEdit, QToolButton, QSizePolicy,
    QMenu, QLabel, QFrame, QScrollArea, QProgressBar,
    QPushButton, QComboBox, QTableWidget, QTableWidgetItem, QHeaderView,
    QApplication,
)
from PySide6.QtGui import QAction, QColor
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile, QWebEnginePage
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtCore import Qt, QUrl, QTimer, Signal, Slot, QPoint, QObject, QThread
from PySide6.QtGui import QKeySequence, QShortcut, QCursor


# ─────────────────────────────────────────────────────────────────────────────
# BrowserChromeBridge — QWebChannel bridge for browser_chrome.html
# ─────────────────────────────────────────────────────────────────────────────

class BrowserChromeBridge(QObject):
    """
    Bridge between browser_chrome.html and BrowserWidget.

    Python → Chrome: BrowserWidget._push_chrome(action, data)
    Chrome → Python: slots below (called via QWebChannel)
    """

    def __init__(self, browser_widget, parent=None):
        super().__init__(parent)
        self._bw = browser_widget

    # ── Called by chrome HTML when QWebChannel is ready ──
    @Slot()
    def chromeReady(self):
        self._bw._on_chrome_ready()

    # ── Tab actions ──
    @Slot(str, str)
    def navigate(self, tab_id, url):
        self._bw.userNavigated.emit(tab_id, url)

    @Slot()
    def createTab(self):
        self._bw.userOpenNewTab.emit()

    @Slot(str)
    def closeTab(self, tab_id):
        self._bw.userCloseTab.emit(tab_id)

    @Slot(str)
    def switchTab(self, tab_id):
        self._bw.userSwitchTab.emit(tab_id)

    @Slot(str)
    def goBack(self, tab_id):
        self._bw.userGoBack.emit(tab_id)

    @Slot(str)
    def goForward(self, tab_id):
        self._bw.userGoForward.emit(tab_id)

    @Slot(str)
    def reload(self, tab_id):
        self._bw.userReload.emit(tab_id)

    @Slot(str)
    def stop(self, tab_id):
        self._bw._stop_tab(tab_id)

    @Slot()
    def goHome(self):
        if self._bw._home_tab_id:
            self._bw.userSwitchTab.emit(self._bw._home_tab_id)

    # ── Tab cycling (from chrome keyboard shortcuts) ──
    @Slot()
    def cycleTabNext(self):
        self._bw._cycle_tab_next()

    @Slot()
    def cycleTabPrev(self):
        self._bw._cycle_tab_prev()

    # ── Utility panels ──
    @Slot(str, str)
    def bookmarkToggle(self, url, title):
        self._bw._toggle_bookmark_for_url(url, title)

    @Slot()
    def showHistory(self):
        self._bw._toggle_history_panel()

    @Slot()
    def showDownloads(self):
        self._bw._toggle_downloads_panel()

    # ── Window controls ──
    @Slot()
    def windowMinimize(self):
        self._bw.window().showMinimized()

    @Slot()
    def windowMaxRestore(self):
        w = self._bw.window()
        w.showNormal() if w.isMaximized() else w.showMaximized()

    @Slot()
    def windowClose(self):
        self._bw.window().close()

    # ── Theme ──
    @Slot(result=str)
    def getAppTheme(self):
        try:
            import storage as _st
            prefs = _st.read_json(_st.data_path("app_prefs.json")) or {}
            return prefs.get("appTheme", "dark")
        except Exception:
            return "dark"

    @Slot()
    def toggleTheme(self):
        try:
            import storage as _st
            themes = ["dark", "light", "nord", "solarized", "gruvbox", "catppuccin"]
            prefs = _st.read_json(_st.data_path("app_prefs.json")) or {}
            current = prefs.get("appTheme", "dark")
            idx = themes.index(current) if current in themes else 0
            next_theme = themes[(idx + 1) % len(themes)]
            prefs["appTheme"] = next_theme
            _st.write_json(_st.data_path("app_prefs.json"), prefs)
            self._bw._push_chrome("applyTheme", next_theme)
            win = self._bw.window()
            if win:
                web_page = getattr(win, "_web_page", None)
                if web_page:
                    web_page.runJavaScript(
                        "try { if(window.applyTheme) window.applyTheme('" + next_theme + "'); } catch(e) {}"
                    )
        except Exception:
            pass

    # ── Section switching ──
    @Slot(str)
    def switchSection(self, section):
        win = self._bw.window()
        if not win:
            return
        if hasattr(win, "show_web_view"):
            win.show_web_view()
        web_page = getattr(win, "_web_page", None)
        if web_page and section in ("comics", "books", "videos"):
            web_page.runJavaScript(
                "try { if(window.setMode) window.setMode('" + section + "'); } catch(e) {}"
            )

    # ── App icon path ──
    @Slot(result=str)
    def getAppIconPath(self):
        icon_path = Path(__file__).parent.parent / "build" / "icon.png"
        if icon_path.exists():
            return icon_path.as_uri()
        return ""


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
        self._tab_id_by_bar_idx = {}             # bar_idx → tab_id (ordering only)
        self._active_tab_id = ""
        self._home_tab_id   = ""

        # HTML chrome bridge (set in _setup_ui)
        self._chrome_view   = None
        self._chrome_bridge = None
        self._chrome_ready  = False

        # Phase 2/3 bridge refs (set via set_bridges())
        self._torrent_search_bridge = None
        self._torrent_bridge = None
        self._sources_bridge = None
        self._history_bridge = None
        self._bookmarks_bridge = None
        self._history_panel = None
        self._downloads_panel = None

        self._setup_ui()
        self._setup_shortcuts()

    # ── Properties ───────────────────────────────────────────────────────────

    @property
    def profile(self):
        return self._profile

    # ── Phase 2/3 bridge wiring ───────────────────────────────────────────────

    def set_bridges(self, torrent_search=None, torrent=None, sources=None,
                    history=None, bookmarks=None):
        """Wire Phase 2/3 bridge references and create torrent/downloads panels."""
        self._torrent_search_bridge = torrent_search
        self._torrent_bridge = torrent
        self._sources_bridge = sources
        self._history_bridge = history
        self._bookmarks_bridge = bookmarks

        # Torrent Search pinned tab removed — torrent search is now in home.html
        self._torrent_tab = None

        # Phase 3: Downloads panel (overlay drawer, not a tab)
        # Button clicks are routed from chrome HTML via BrowserChromeBridge.showDownloads()
        if sources or torrent:
            self._downloads_panel = DownloadsPanel(sources, torrent, parent=self)
            self._downloads_panel.hide()
        else:
            self._downloads_panel = None

        # Phase 3b: History panel
        if history:
            self._history_panel = HistoryPanel(history, parent=self)
            self._history_panel.hide()
            self._history_panel.navigateTo.connect(self._on_history_navigate)
        else:
            self._history_panel = None

        # Bookmark state is synced via _push_chrome("setBookmark", ...)

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
        chrome_h = 146 if (self._chrome_view and self._chrome_view.isVisible()) else 0
        find_h   = self._find_bar.height() if self._find_bar.isVisible() else 0
        w = 360
        h = self.height() - chrome_h - find_h
        x = self.width() - w
        y = chrome_h + find_h
        self._downloads_panel.setGeometry(x, y, w, h)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self._downloads_panel and self._downloads_panel.isVisible():
            self._position_downloads_panel()
        if getattr(self, "_history_panel", None) and self._history_panel.isVisible():
            self._position_history_panel()

    # ── UI construction ───────────────────────────────────────────────────────

    def set_theme(self, theme):
        """Apply theme to the HTML browser chrome."""
        self._push_chrome("applyTheme", theme)

    def _setup_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── HTML Chrome view (topbar 46px + TankoBrowser panel ~100px = 146px) ──
        chrome_profile = QWebEngineProfile("tankoweb-chrome", self)
        chrome_page = QWebEnginePage(chrome_profile, self)
        chrome_page.setBackgroundColor(QColor(10, 12, 20))   # prevent white flash

        self._chrome_channel = QWebChannel(chrome_page)
        self._chrome_bridge  = BrowserChromeBridge(self)
        self._chrome_channel.registerObject("chrome", self._chrome_bridge)
        chrome_page.setWebChannel(self._chrome_channel)

        self._chrome_view = QWebEngineView()
        self._chrome_view.setPage(chrome_page)
        self._chrome_view.setFixedHeight(146)
        self._chrome_view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)

        chrome_url = QUrl.fromLocalFile(
            str(Path(__file__).parent / "data" / "browser_chrome.html")
        )
        self._chrome_view.setUrl(chrome_url)
        self._chrome_view.hide()   # hidden on home screen; shown when a real tab activates
        root.addWidget(self._chrome_view)

        # ── Find bar (hidden by default; Ctrl+F reveals it) ──
        find_bar = QWidget()
        find_bar.setObjectName("findBar")
        find_bar.setStyleSheet(
            "QWidget#findBar { background:#161b22; border-bottom:1px solid rgba(255,255,255,0.06); }"
            "QLineEdit#findInput { background:#0d1117; border:1px solid rgba(255,255,255,0.1);"
            "  border-radius:6px; color:#e6edf3; font-size:12px; padding:3px 10px; }"
            "QLineEdit#findInput:focus { border-color:rgba(88,101,242,0.8); }"
            "QPushButton#findNavBtn { background:transparent; border:none; color:#8b949e;"
            "  font-size:13px; min-width:24px; min-height:24px; border-radius:4px; }"
            "QPushButton#findNavBtn:hover { background:rgba(255,255,255,0.08); color:#e6edf3; }"
            "QLabel#findCount { color:#8b949e; font-size:11px; min-width:48px; }"
            "QToolButton#findClose { background:transparent; border:none; color:#8b949e;"
            "  font-size:14px; min-width:22px; min-height:22px; border-radius:4px; }"
            "QToolButton#findClose:hover { background:rgba(255,255,255,0.08); color:#e6edf3; }"
        )
        fl = QHBoxLayout(find_bar)
        fl.setContentsMargins(8, 4, 8, 4)
        fl.setSpacing(4)
        fl.addStretch()
        fl.addWidget(QLabel("Find:"))
        self._find_input = QLineEdit()
        self._find_input.setObjectName("findInput")
        self._find_input.setPlaceholderText("Search…")
        self._find_input.setFixedWidth(200)
        self._find_prev_btn = QPushButton("↑")
        self._find_prev_btn.setObjectName("findNavBtn")
        self._find_prev_btn.setToolTip("Previous match")
        self._find_next_btn = QPushButton("↓")
        self._find_next_btn.setObjectName("findNavBtn")
        self._find_next_btn.setToolTip("Next match")
        self._find_count_lbl = QLabel("0/0")
        self._find_count_lbl.setObjectName("findCount")
        self._find_close_btn = QToolButton()
        self._find_close_btn.setObjectName("findClose")
        self._find_close_btn.setText("×")
        fl.addWidget(self._find_input)
        fl.addWidget(self._find_prev_btn)
        fl.addWidget(self._find_next_btn)
        fl.addWidget(self._find_count_lbl)
        fl.addWidget(self._find_close_btn)
        self._find_bar = find_bar
        self._find_bar.hide()
        root.addWidget(self._find_bar)

        # Wire find bar
        self._find_input.returnPressed.connect(self._find_next_action)
        self._find_input.textChanged.connect(self._on_find_text_changed)
        self._find_next_btn.clicked.connect(self._find_next_action)
        self._find_prev_btn.clicked.connect(self._find_prev_action)
        self._find_close_btn.clicked.connect(self._close_find_bar)

        # ── Content stack ──
        self._content_stack = QStackedWidget()
        self._content_stack.setObjectName("contentStack")
        root.addWidget(self._content_stack, stretch=1)

    def _setup_shortcuts(self):
        def _mk(seq, fn):
            s = QShortcut(QKeySequence(seq), self)
            s.activated.connect(fn)

        _mk("Ctrl+T",         self._on_new_tab)
        _mk("Ctrl+W",         self._close_active_tab)
        _mk("Ctrl+L",         lambda: self._push_chrome("focusAddrBar"))
        _mk("Alt+Left",       self._on_back)
        _mk("Alt+Right",      self._on_fwd)
        _mk("F5",             self._on_reload)
        _mk("Ctrl+R",         self._on_reload)
        _mk("Escape",         self._on_escape)
        # Find in page
        _mk("Ctrl+F",         self._show_find_bar)
        _mk("Ctrl+G",         self._find_next_action)
        _mk("Ctrl+Shift+G",   self._find_prev_action)
        # Zoom
        _mk("Ctrl+=",         self._zoom_in)
        _mk("Ctrl++",         self._zoom_in)
        _mk("Ctrl+-",         self._zoom_out)
        _mk("Ctrl+0",         self._zoom_reset)
        # Tab cycling
        _mk("Ctrl+Tab",       self._cycle_tab_next)
        _mk("Ctrl+Shift+Tab", self._cycle_tab_prev)

    # ── Called by WebTabManagerBridge ─────────────────────────────────────────

    def add_tab_view(self, tab_id, view, title="New Tab", home=False):
        """
        Register a QWebEngineView as a tab in the UI.
        Called by WebTabManagerBridge._create_tab_internal().

        The view is re-parented into the content stack — no overlay, no setGeometry.
        """
        view.setParent(self)
        stack_idx = self._content_stack.addWidget(view)

        if home:
            bar_idx = -1
            self._home_tab_id = tab_id
        else:
            # Assign next bar_idx in insertion order
            existing = [t["bar_idx"] for t in self._tabs.values() if t.get("bar_idx", -1) >= 0]
            bar_idx = (max(existing) + 1) if existing else 0
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
            "loading":   False,
        }

        if not home:
            self._push_chrome("setTabs", self._build_tab_list_payload())

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

        if tab_id == self._home_tab_id:
            self._home_tab_id = ""

        # Remove from content stack and destroy view
        if view:
            self._content_stack.removeWidget(view)
            view.deleteLater()

        # Remove from ordering map
        if bar_idx >= 0:
            self._tab_id_by_bar_idx.pop(bar_idx, None)

        # Rebuild index maps and push updated tab list to chrome
        self._rebuild_maps()
        self._push_chrome("setTabs", self._build_tab_list_payload())

    def set_active_tab_id(self, tab_id):
        """
        Switch the visible content and HTML chrome selection.
        Called by WebTabManagerBridge.switchTab().
        """
        tab = self._tabs.get(tab_id)
        if not tab:
            return
        self._active_tab_id = tab_id

        # Switch content stack
        view = tab.get("view")
        if view:
            self._content_stack.setCurrentWidget(view)

        # Show/hide HTML chrome: hidden on home, visible on real browser tabs
        is_home = tab.get("home", False)
        if is_home:
            self._chrome_view.hide()
        else:
            self._chrome_view.show()
            self._push_chrome("setActiveTab", tab_id)
            self._update_bookmark_state(tab_id)

    def navigate_tab(self, tab_id, url):
        """
        Called when a home tab navigates to a real URL (becomes a URL tab).
        Assigns bar_idx, shows chrome, pushes updated tab list to HTML chrome.
        """
        tab = self._tabs.get(tab_id)
        if not tab:
            return
        was_home = tab.get("home", False)
        tab["home"] = False
        tab["url"]  = url

        if was_home:
            # Assign a bar_idx so this tab appears in the chrome tab strip
            existing = [t["bar_idx"] for t in self._tabs.values() if t.get("bar_idx", -1) >= 0]
            bar_idx = (max(existing) + 1) if existing else 0
            tab["bar_idx"] = bar_idx
            self._tab_id_by_bar_idx[bar_idx] = tab_id
            if tab_id == self._home_tab_id:
                self._home_tab_id = ""

        if tab_id == self._active_tab_id:
            view = tab.get("view")
            if view:
                self._content_stack.setCurrentWidget(view)
            self._chrome_view.show()
            self._push_chrome("setTabs", self._build_tab_list_payload())
            self._push_chrome("setActiveTab", tab_id)

    def update_tab(self, tab_id, **fields):
        """
        Update tab metadata from page signals (url, title, loading, canGoBack, canGoForward).
        Called by WebTabManagerBridge._emit_tab_update().
        Pushes changed fields to the HTML chrome via _push_chrome("updateTab", ...).
        """
        tab = self._tabs.get(tab_id)
        if not tab:
            return

        changed = {}

        if "url" in fields:
            tab["url"] = fields["url"]
            changed["url"] = fields["url"]

        if "title" in fields and fields["title"]:
            tab["title"] = fields["title"]
            changed["title"] = fields["title"]

        if "loading" in fields:
            tab["loading"] = bool(fields["loading"])
            changed["loading"] = tab["loading"]

        if "canGoBack" in fields:
            tab["can_back"] = bool(fields["canGoBack"])
            changed["canBack"] = tab["can_back"]

        if "canGoForward" in fields:
            tab["can_fwd"] = bool(fields["canGoForward"])
            changed["canFwd"] = tab["can_fwd"]

        if changed and not tab.get("home"):
            self._push_chrome("updateTab", {"id": tab_id, **changed})

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
        """Keyboard shortcut handler: stop if loading, reload otherwise."""
        if not self._active_tab_id:
            return
        tab = self._tabs.get(self._active_tab_id, {})
        if tab.get("loading"):
            self._stop_tab(self._active_tab_id)
        else:
            self.userReload.emit(self._active_tab_id)

    def _stop_tab(self, tab_id):
        """Stop loading a tab (called from BrowserChromeBridge.stop or keyboard)."""
        tab = self._tabs.get(tab_id, {})
        view = tab.get("view")
        if view:
            view.stop()

    def _close_active_tab(self):
        """Ctrl+W: close the active non-home tab."""
        if self._active_tab_id:
            tab = self._tabs.get(self._active_tab_id, {})
            if not tab.get("home"):
                self.userCloseTab.emit(self._active_tab_id)

    def _on_new_tab(self):
        self.userOpenNewTab.emit()

    def _on_escape(self):
        if self._find_bar.isVisible():
            self._close_find_bar()

    # ── Find in page ─────────────────────────────────────────────────────────

    def _show_find_bar(self):
        self._find_bar.show()
        self._find_input.setFocus()
        self._find_input.selectAll()

    def _close_find_bar(self):
        self._find_bar.hide()
        self._find_count_lbl.setText("0/0")
        tab = self._tabs.get(self._active_tab_id)
        if tab and tab.get("view"):
            tab["view"].page().findText("")  # clear highlights

    def _on_find_text_changed(self, text):
        tab = self._tabs.get(self._active_tab_id)
        if not tab or not tab.get("view"):
            return
        from PySide6.QtWebEngineCore import QWebEnginePage as _QWP
        page = tab["view"].page()
        if not text:
            page.findText("")
            self._find_count_lbl.setText("0/0")
            return

        lbl = self._find_count_lbl

        def _on_result(result):
            try:
                m = result.numberOfMatches()
                i = result.activeMatch()
                lbl.setText(f"{i}/{m}" if m else "0/0")
            except Exception:
                pass

        page.findText(text, _QWP.FindFlags(), _on_result)

    def _find_next_action(self):
        if not self._find_bar.isVisible():
            self._show_find_bar()
            return
        text = self._find_input.text()
        if not text:
            return
        tab = self._tabs.get(self._active_tab_id)
        if tab and tab.get("view"):
            tab["view"].page().findText(text)

    def _find_prev_action(self):
        if not self._find_bar.isVisible():
            self._show_find_bar()
            return
        text = self._find_input.text()
        if not text:
            return
        tab = self._tabs.get(self._active_tab_id)
        if tab and tab.get("view"):
            from PySide6.QtWebEngineCore import QWebEnginePage as _QWP
            tab["view"].page().findText(
                text, _QWP.FindFlag.FindBackward
            )

    # ── Zoom ─────────────────────────────────────────────────────────────────

    def _active_view(self):
        tab = self._tabs.get(self._active_tab_id)
        return tab.get("view") if tab else None

    def _zoom_in(self):
        v = self._active_view()
        if v:
            v.setZoomFactor(min(5.0, v.zoomFactor() + 0.1))

    def _zoom_out(self):
        v = self._active_view()
        if v:
            v.setZoomFactor(max(0.25, v.zoomFactor() - 0.1))

    def _zoom_reset(self):
        v = self._active_view()
        if v:
            v.setZoomFactor(1.0)

    # ── Bookmarks ─────────────────────────────────────────────────────────────

    def _toggle_bookmark_for_url(self, url, title):
        """Called by BrowserChromeBridge.bookmarkToggle()."""
        if not self._bookmarks_bridge or not url or url.startswith("file://"):
            return
        try:
            result = json.loads(self._bookmarks_bridge.toggle(json.dumps({
                "url": url, "title": title,
            })))
            added = result.get("added", False)
            self._push_chrome("setBookmark", {"url": url, "bookmarked": added})
        except Exception:
            pass

    def _update_bookmark_state(self, tab_id):
        """Push bookmark state for the active tab to the HTML chrome."""
        if not self._bookmarks_bridge:
            return
        tab = self._tabs.get(tab_id, {})
        url = tab.get("url", "")
        if not url or url.startswith("file://"):
            self._push_chrome("setBookmark", {"url": url, "bookmarked": False})
            return
        try:
            r = json.loads(self._bookmarks_bridge.list())
            bookmarks = r.get("bookmarks", [])
            is_bm = any(b.get("url") == url for b in bookmarks if b)
            self._push_chrome("setBookmark", {"url": url, "bookmarked": is_bm})
        except Exception:
            self._push_chrome("setBookmark", {"url": url, "bookmarked": False})

    # ── History panel ─────────────────────────────────────────────────────────

    def _toggle_history_panel(self):
        if not self._history_panel:
            return
        if self._history_panel.isVisible():
            self._history_panel.hide()
        else:
            self._position_history_panel()
            self._history_panel.refresh()
            self._history_panel.show()
            self._history_panel.raise_()

    def _position_history_panel(self):
        if not self._history_panel:
            return
        chrome_h = 146 if (self._chrome_view and self._chrome_view.isVisible()) else 0
        find_h   = self._find_bar.height() if self._find_bar.isVisible() else 0
        w = 340
        h = self.height() - chrome_h - find_h
        x = self.width() - w
        y = chrome_h + find_h
        self._history_panel.setGeometry(x, y, w, h)

    def _on_history_navigate(self, url):
        self._history_panel.hide()
        self.userOpenNewTab.emit()
        QTimer.singleShot(300, lambda: self.userNavigated.emit(
            self._find_latest_tab_id(), url
        ))

    # ── Tab cycling ───────────────────────────────────────────────────────────

    def _cycle_tab_next(self):
        ordered = sorted(self._tab_id_by_bar_idx.keys())
        if len(ordered) < 2:
            return
        cur_bar = self._tabs.get(self._active_tab_id, {}).get("bar_idx", -1)
        if cur_bar < 0:
            self.userSwitchTab.emit(self._tab_id_by_bar_idx[ordered[0]])
            return
        try:
            pos = ordered.index(cur_bar)
            self.userSwitchTab.emit(self._tab_id_by_bar_idx[ordered[(pos + 1) % len(ordered)]])
        except ValueError:
            pass

    def _cycle_tab_prev(self):
        ordered = sorted(self._tab_id_by_bar_idx.keys())
        if len(ordered) < 2:
            return
        cur_bar = self._tabs.get(self._active_tab_id, {}).get("bar_idx", -1)
        if cur_bar < 0:
            self.userSwitchTab.emit(self._tab_id_by_bar_idx[ordered[-1]])
            return
        try:
            pos = ordered.index(cur_bar)
            self.userSwitchTab.emit(self._tab_id_by_bar_idx[ordered[(pos - 1) % len(ordered)]])
        except ValueError:
            pass

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _rebuild_maps(self):
        """Rebuild bar_idx maps and stack_idx after structural changes."""
        remaining = sorted(
            [(t["bar_idx"], tid) for tid, t in self._tabs.items() if t.get("bar_idx", -1) >= 0]
        )
        self._tab_id_by_bar_idx = {}
        for new_idx, (_, tid) in enumerate(remaining):
            self._tabs[tid]["bar_idx"] = new_idx
            self._tab_id_by_bar_idx[new_idx] = tid

        for tid, t in self._tabs.items():
            view = t.get("view")
            if view:
                t["stack_idx"] = self._content_stack.indexOf(view)

    def _push_chrome(self, action, data=None):
        """Push a state update to browser_chrome.html via runJavaScript."""
        if not self._chrome_view:
            return
        if data is None:
            js = f"if(window._chrome)window._chrome['{action}']()"
        else:
            js = f"if(window._chrome)window._chrome['{action}']({json.dumps(data, ensure_ascii=False)})"
        self._chrome_view.page().runJavaScript(js)

    def _on_chrome_ready(self):
        """Called by BrowserChromeBridge.chromeReady() when HTML is initialised."""
        self._chrome_ready = True
        self._push_chrome("setTabs", self._build_tab_list_payload())
        if self._active_tab_id:
            tab = self._tabs.get(self._active_tab_id, {})
            if not tab.get("home"):
                self._push_chrome("setActiveTab", self._active_tab_id)

    def _build_tab_list_payload(self):
        """Build the tabs array for _push_chrome("setTabs", ...)."""
        result = []
        for tid, t in self._tabs.items():
            if t.get("home"):
                continue
            result.append({
                "id":      tid,
                "title":   t.get("title", "New Tab"),
                "url":     t.get("url", ""),
                "loading": t.get("loading", False),
                "canBack": t.get("can_back", False),
                "canFwd":  t.get("can_fwd", False),
            })
        result.sort(key=lambda x: self._tabs[x["id"]].get("bar_idx", 999))
        return result

    def _close_tab_by_view(self, view):
        """Close the tab associated with a specific view widget."""
        for tid, t in self._tabs.items():
            if t.get("view") is view:
                self.userCloseTab.emit(tid)
                return

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
        if self._chrome_view:
            try:
                self._chrome_view.deleteLater()
            except Exception:
                pass
            self._chrome_view = None


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


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3b — HistoryPanel
# ─────────────────────────────────────────────────────────────────────────────

_HISTORY_PANEL_SS = """
HistoryPanel {
    background: #161b22;
    border-left: 1px solid rgba(255,255,255,0.08);
}
QLabel#histPanelTitle {
    color: #e6edf3;
    font-size: 13px;
    font-weight: 600;
    padding: 12px 12px 8px;
}
QLineEdit#histSearch {
    background: #0d1117;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: #e6edf3;
    font-size: 12px;
    padding: 5px 10px;
    margin: 0 12px 8px;
}
QLineEdit#histSearch:focus { border-color: rgba(88,101,242,0.8); }
QListWidget {
    background: transparent;
    border: none;
    color: #e6edf3;
    font-size: 12px;
}
QListWidget::item {
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
QListWidget::item:hover { background: rgba(255,255,255,0.06); }
QListWidget::item:selected { background: rgba(88,101,242,0.2); }
QPushButton#histClearBtn {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: #8b949e;
    font-size: 11px;
    padding: 4px 12px;
    margin: 8px 12px;
}
QPushButton#histClearBtn:hover { border-color: rgba(248,81,73,0.6); color: #f85149; }
"""


class HistoryPanel(QWidget):
    """
    Phase 3b — History side panel.
    Floating overlay; shows recent browsing history.
    Signal navigateTo(url) emitted when user clicks an entry.
    """
    navigateTo = Signal(str)

    def __init__(self, history_bridge, parent=None):
        super().__init__(parent)
        self._bridge = history_bridge
        self._all_entries = []
        self.setStyleSheet(_HISTORY_PANEL_SS)
        self._setup_ui()

    def _setup_ui(self):
        from PySide6.QtWidgets import QListWidget, QListWidgetItem

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        title = QLabel("History")
        title.setObjectName("histPanelTitle")
        root.addWidget(title)

        self._search_input = QLineEdit()
        self._search_input.setObjectName("histSearch")
        self._search_input.setPlaceholderText("Filter history…")
        self._search_input.textChanged.connect(self._apply_filter)
        root.addWidget(self._search_input)

        self._list = QListWidget()
        self._list.itemDoubleClicked.connect(self._on_item_double_clicked)
        root.addWidget(self._list, stretch=1)

        self._clear_btn = QPushButton("Clear history")
        self._clear_btn.setObjectName("histClearBtn")
        self._clear_btn.clicked.connect(self._clear_history)
        root.addWidget(self._clear_btn)

    def refresh(self):
        try:
            r = json.loads(self._bridge.list(json.dumps({
                "scope": "sources_browser",
                "limit": 200,
            })))
            self._all_entries = r.get("entries", []) if r.get("ok") else []
        except Exception:
            self._all_entries = []
        self._apply_filter(self._search_input.text())

    def _apply_filter(self, text):
        self._list.clear()
        q = text.strip().lower()
        for e in self._all_entries:
            if not e:
                continue
            url   = e.get("url", "")
            title = e.get("title", "") or url
            if q and q not in url.lower() and q not in title.lower():
                continue
            display = (title[:46] + "…") if len(title) > 46 else title
            from PySide6.QtWidgets import QListWidgetItem
            item = QListWidgetItem(display)
            item.setData(Qt.ItemDataRole.UserRole, url)
            item.setToolTip(url)
            self._list.addItem(item)

    def _on_item_double_clicked(self, item):
        url = item.data(Qt.ItemDataRole.UserRole)
        if url:
            self.navigateTo.emit(url)

    def _clear_history(self):
        try:
            self._bridge.clear(json.dumps({"scope": "sources_browser"}))
        except Exception:
            pass
        self._all_entries = []
        self._list.clear()


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
